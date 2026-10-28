-- Интеграционный тест 0009: серии, перенос контента, очередь Web Push. Всё откатывается исключением с итогом.
-- Ожидаемый результат: ERROR "TEST OK: {...}".
do $$
declare
  owner_id uuid := gen_random_uuid(); mob_id uuid := gen_random_uuid();
  v_client uuid; v_project uuid; v_period uuid; v_series uuid; v_t2 timestamptz; v_content uuid; v_n int; ok boolean;
  v_claim jsonb; v_notif uuid; res jsonb := '{}';
begin
  insert into auth.users(id, email, email_confirmed_at, aud, role) values
    (owner_id, 't-owner9@citadel.test', now(), 'authenticated', 'authenticated'),
    (mob_id, 't-mob9@citadel.test', now(), 'authenticated', 'authenticated');
  perform set_config('request.jwt.claims', json_build_object('sub', owner_id, 'role', 'authenticated')::text, true);
  if not public.owner_exists() then perform public.claim_first_owner('Тест Владелец');
  else
    perform set_config('citadel.bypass', 'on', true);
    update public.profiles set status = 'active' where id = owner_id;
    insert into public.user_roles(user_id, role_code) values (owner_id, 'owner');
    perform set_config('citadel.bypass', 'off', true);
  end if;
  perform set_config('citadel.bypass', 'on', true);
  update public.profiles set status = 'active' where id = mob_id;
  insert into public.user_roles(user_id, role_code) values (mob_id, 'mobilographer');
  perform set_config('citadel.bypass', 'off', true);

  insert into public.clients(company_name) values ('Тест клиент 9') returning id into v_client;
  insert into public.projects(name, client_id, kind, status, admin_id, created_by) values ('Тест 9', v_client, 'monthly', 'awaiting_payment', owner_id, owner_id) returning id into v_project;
  insert into public.project_periods(project_id, seq, label, starts_on, ends_on) values (v_project, 1, 'Месяц 1', current_date, current_date + 30) returning id into v_period;

  -- 1. Серия задач: 3 повтора → одно уведомление исполнителю
  insert into public.recurrence_series(entity, rule, summary, created_by) values ('task', '{"freq":"weekly","interval":1,"count":3}', 'Каждую неделю, 3 раза', owner_id) returning id into v_series;
  insert into public.tasks(title, description, assignee_id, due_at, created_by, series_id)
  select 'Отчёт клиенту', 'Еженедельный отчёт', mob_id, now() + (g || ' days')::interval, owner_id, v_series from generate_series(1, 15, 7) g;
  res := res || jsonb_build_object('series_tasks', (select count(*) from public.tasks where series_id = v_series),
    'series_one_notification', (select count(*) from public.notifications where user_id = mob_id and type = 'task.assigned') = 1);

  -- 2. Остановка серии со второго повтора: отменено 2, первый остаётся
  select due_at into v_t2 from public.tasks where series_id = v_series order by due_at offset 1 limit 1;
  v_n := public.series_cancel(v_series, v_t2, 'клиент приостановил');
  res := res || jsonb_build_object('series_cancelled', v_n,
    'first_kept', (select status from public.tasks where series_id = v_series order by due_at limit 1) = 'todo');

  -- 3. Исполнитель не может остановить чужую серию
  perform set_config('request.jwt.claims', json_build_object('sub', mob_id, 'role', 'authenticated')::text, true);
  begin perform public.series_cancel(v_series, now() - interval '1 day', 'хочу'); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('executor_cannot_cancel_series', ok);

  -- 4. Перенос срока контента: только менеджер, с историей и уведомлением
  perform set_config('request.jwt.claims', json_build_object('sub', owner_id, 'role', 'authenticated')::text, true);
  insert into public.content_items(project_id, period_id, kind, title, prep_due) values (v_project, v_period, 'video', 'Ролик 9', now() + interval '2 days') returning id into v_content;
  perform public.content_assign(v_content, mob_id, null, 'ТЗ ролика', now() + interval '2 days', null);
  perform public.content_reschedule(v_content, now() + interval '5 days', null, 'перенос съёмки');
  res := res || jsonb_build_object('content_moved', (select prep_due > now() + interval '4 days' from public.content_items where id = v_content),
    'content_history', exists (select 1 from public.content_history where content_id = v_content and note like 'перенос:%'),
    'content_notified', exists (select 1 from public.notifications where user_id = mob_id and type = 'content.rescheduled'));
  perform set_config('request.jwt.claims', json_build_object('sub', mob_id, 'role', 'authenticated')::text, true);
  begin perform public.content_reschedule(v_content, now() + interval '9 days', null, 'сам'); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('executor_cannot_move_content', ok);

  -- 5. Push: подписка, очередь, удаление «мёртвой» подписки
  begin perform public.push_subscribe('http://insecure.example/x', 'k', 'a', null); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('rejects_non_https', ok);
  perform public.push_subscribe('https://push.example.invalid/sub-9', 'BPk', 'auth9', 'test');
  res := res || jsonb_build_object('public_key_visible', public.push_public_key() is not null);
  perform public.push_test();
  select id into v_notif from public.notifications where user_id = mob_id and type = 'push.test';
  v_claim := public.push_claim(50);
  res := res || jsonb_build_object('claimed', exists (select 1 from jsonb_array_elements(v_claim) x where x->>'id' = v_notif::text and jsonb_array_length(x->'subs') = 1),
    'status_sending', (select push_status from public.notifications where id = v_notif) = 'sending');
  perform public.push_result(v_notif, false, array['https://push.example.invalid/sub-9']);
  res := res || jsonb_build_object('gone_sub_deleted', not exists (select 1 from public.push_subscriptions where user_id = mob_id),
    'status_after_gone', (select push_status from public.notifications where id = v_notif));
  begin perform public.push_test(); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('test_requires_subscription', ok);

  raise exception 'TEST OK: %', res;
end $$;
