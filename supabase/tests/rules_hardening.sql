-- Интеграционный тест 0024: деньги и статусы (docs/SECURITY_FIX_PLAN.md, этап 1).
-- Выполняется целиком и откатывается исключением — реальные данные не меняются.
-- Запуск: SQL editor Supabase / execute_sql. Ожидаемый результат: ERROR "TEST OK: {...}".
-- Если хоть одна проверка false — тест падает с "TEST FAILED: {...}" (искать false глазами не нужно).
do $$
declare
  o uuid := gen_random_uuid(); mgr uuid := gen_random_uuid(); ex uuid := gen_random_uuid();
  rv uuid := gen_random_uuid(); mb uuid := gen_random_uuid();
  v_client uuid; v_project uuid; v_period uuid; v_c uuid; v_t uuid; v_s uuid; v_s2 uuid;
  k_kgs uuid; k_usd uuid; v_pay uuid; r jsonb; ok boolean; res jsonb := '{}';
begin
  insert into auth.users(id, email, email_confirmed_at, aud, role) values
    (o, 'h-own@citadel.test', now(), 'authenticated', 'authenticated'),
    (mgr, 'h-mgr@citadel.test', now(), 'authenticated', 'authenticated'),
    (ex, 'h-exec@citadel.test', now(), 'authenticated', 'authenticated'),
    (rv, 'h-rev@citadel.test', now(), 'authenticated', 'authenticated'),
    (mb, 'h-member@citadel.test', now(), 'authenticated', 'authenticated');
  perform set_config('citadel.bypass', 'on', true);
  update public.profiles set status = 'active', full_name = 'Тест 0024' where id in (o, mgr, ex, rv, mb);
  insert into public.user_roles(user_id, role_code) values
    (o, 'owner'), (mgr, 'project_admin'), (ex, 'mobilographer'), (rv, 'creative_director'), (mb, 'mobilographer');
  insert into public.user_permissions(user_id, permission_code) values (mgr, 'reports.view');
  perform set_config('citadel.bypass', 'off', true);

  insert into public.clients(company_name, contact_name, phone, created_by) values ('Тест 0024', 'Айгерим', '+996555002400', o) returning id into v_client;
  insert into public.projects(name, client_id, kind, status, admin_id, stories_method, created_by, handoff)
  values ('Тест 0024', v_client, 'monthly', 'draft', mgr, 'fixed_per_period', o,
          '{"client":true,"package":true,"dates":true,"wishes":true,"admin_accepted":true}') returning id into v_project;
  insert into public.project_contracts(project_id, price_minor, currency) values (v_project, 6000000, 'KGS');
  insert into public.project_members(project_id, user_id, role) values (v_project, mb, 'executor');
  insert into public.project_periods(project_id, seq, label, starts_on, ends_on) values (v_project, 1, 'тест', current_date, current_date + 30) returning id into v_period;
  insert into public.content_items(project_id, period_id, kind, title, status, assignee_id, reviewer_id, brief, prep_due)
  values (v_project, v_period, 'video', 'Рилс 0024', 'editing', ex, rv, 'ТЗ', now() + interval '2 days') returning id into v_c;
  insert into public.financial_accounts(name, kind, currency) values ('Тест 0024 KGS', 'cash', 'KGS') returning id into k_kgs;
  insert into public.financial_accounts(name, kind, currency) values ('Тест 0024 USD', 'cash', 'USD') returning id into k_usd;

  -- ───── A. материал: с паузы — только туда, где был ─────
  perform set_config('request.jwt.claims', json_build_object('sub', ex, 'role', 'authenticated')::text, true);
  perform public.content_transition(v_c, 'paused', 'жду исходники');
  begin perform public.content_transition(v_c, 'done'); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('a_exec_cannot_done_from_pause', ok and (select status::text from public.content_items where id = v_c) = 'paused');
  begin perform public.content_transition(v_c, 'review', null, 'https://drive.test/x'); ok := false; exception when others then ok := sqlerrm like '%возвращается в статус%'; end;
  res := res || jsonb_build_object('a_exec_cannot_skip_to_review', ok);
  perform public.content_transition(v_c, 'blocked', 'нет доступа');
  begin perform public.content_transition(v_c, 'in_progress'); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('a_pause_then_block_still_remembers', ok);
  perform public.content_transition(v_c, 'editing');
  res := res || jsonb_build_object('a_exec_back_to_before', (select status::text from public.content_items where id = v_c) = 'editing');
  -- руководитель проекта снимает паузу как раньше
  perform public.content_transition(v_c, 'paused', 'стоп');
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  perform public.content_transition(v_c, 'in_progress');
  res := res || jsonb_build_object('a_manager_unpauses_freely', (select status::text from public.content_items where id = v_c) = 'in_progress');

  -- прямые правки исполнителем: проверяющий и срок — нельзя, название — можно
  perform set_config('request.jwt.claims', json_build_object('sub', ex, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin update public.content_items set reviewer_id = ex where id = v_c; ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('a_exec_cannot_set_self_reviewer', ok);
  begin update public.content_items set prep_due = now() + interval '30 days' where id = v_c; ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('a_exec_cannot_move_own_deadline', ok);
  begin update public.content_items set submitted_at = now() - interval '5 days' where id = v_c; ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('a_exec_cannot_forge_submitted_at', ok);
  update public.content_items set title = 'Рилс 0024 (новое название)' where id = v_c;
  reset role;
  res := res || jsonb_build_object('a_exec_can_edit_title', (select title from public.content_items where id = v_c) = 'Рилс 0024 (новое название)'
    and (select reviewer_id from public.content_items where id = v_c) = rv);

  -- ───── B. проект: статус только функциями, оплата в валюте договора ─────
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin update public.projects set status = 'in_progress' where id = v_project; ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('b_admin_cannot_set_status_directly', ok);
  begin update public.projects set launched_at = now() where id = v_project; ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('b_admin_cannot_fake_launch', ok);
  update public.projects set handoff = handoff || '{"note":true}' where id = v_project;
  reset role;
  res := res || jsonb_build_object('b_admin_can_edit_checklist', (select handoff ? 'note' from public.projects where id = v_project));

  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    insert into public.projects(name, client_id, kind, status, created_by) values ('Обход', v_client, 'monthly', 'in_progress', o);
    ok := false;
  exception when others then ok := true; end;
  res := res || jsonb_build_object('b_cannot_insert_running_project', ok);
  reset role;

  -- 30 000 сом + $1 000 000: доллары не закрывают договор в сомах
  insert into public.payments(project_id, amount_minor, currency, created_by) values (v_project, 3000000, 'KGS', o) returning id into v_pay;
  perform public.payment_confirm(v_pay, k_kgs);
  insert into public.payments(project_id, amount_minor, currency, created_by) values (v_project, 100000000, 'USD', o) returning id into v_pay;
  perform public.payment_confirm(v_pay, k_usd);
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  begin perform public.launch_project(v_project); ok := false; exception when others then ok := sqlerrm like '%оплата 30000 из 60000 KGS%'; end;
  res := res || jsonb_build_object('b_launch_ignores_other_currency', ok);
  r := public.project_paid_status(v_project);
  res := res || jsonb_build_object('b_admin_sees_amounts', (r->>'masked')::boolean = false and (r->>'paid')::bigint = 3000000 and r->>'currency' = 'KGS');
  perform set_config('request.jwt.claims', json_build_object('sub', mb, 'role', 'authenticated')::text, true);
  r := public.project_paid_status(v_project);
  res := res || jsonb_build_object('b_member_sees_only_flag', (r->>'masked')::boolean and not (r ? 'paid') and not (r ? 'price')
    and (r->>'fully_paid')::boolean = false);

  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  insert into public.payments(project_id, amount_minor, currency, created_by) values (v_project, 3000000, 'KGS', o) returning id into v_pay;
  perform public.payment_confirm(v_pay, k_kgs);
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  perform public.launch_project(v_project);
  res := res || jsonb_build_object('b_launch_after_full_payment', (select status::text from public.projects where id = v_project) = 'in_progress');

  -- ───── C. задачи ─────
  insert into public.tasks(title, assignee_id, created_by, project_id) values ('Задача 0024', ex, o, v_project) returning id into v_t;
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin update public.tasks set status = 'done' where id = v_t; ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('c_creator_cannot_set_status_directly', ok);
  begin
    insert into public.tasks(title, assignee_id, created_by, status) values ('Сразу готово', o, o, 'done');
    ok := false;
  exception when others then ok := true; end;
  res := res || jsonb_build_object('c_cannot_insert_done_task', ok);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ex, 'role', 'authenticated')::text, true);
  perform public.task_transition(v_t, 'done', null, 'https://drive.test/result');
  begin perform public.task_transition(v_t, 'revision', 'хочу переделать'); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('c_assignee_cannot_reopen_closed', ok);
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  perform public.task_transition(v_t, 'revision', 'нужны правки');
  res := res || jsonb_build_object('c_creator_reopens', (select status::text from public.tasks where id = v_t) = 'revision');

  -- ───── D. съёмки ─────
  insert into public.shoots(project_id, title, starts_at, ends_at, created_by) values (v_project, 'Съёмка 0024', now() + interval '1 day', now() + interval '1 day 2 hours', o) returning id into v_s;
  insert into public.shoots(project_id, title, starts_at, ends_at, created_by) values (v_project, 'Съёмка 0024-2', now() + interval '2 days', now() + interval '2 days 2 hours', o) returning id into v_s2;
  insert into public.shoot_participants(shoot_id, user_id, role) values (v_s, ex, 'mobilographer'), (v_s2, ex, 'mobilographer');
  perform set_config('request.jwt.claims', json_build_object('sub', ex, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin update public.shoots set starts_at = starts_at + interval '1 day' where id = v_s; ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('d_mobilographer_cannot_move_time', ok);
  begin update public.shoots set status = 'done' where id = v_s; ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('d_mobilographer_cannot_set_status_directly', ok);
  update public.shoots set notes = 'взять свет' where id = v_s;
  reset role;
  res := res || jsonb_build_object('d_mobilographer_can_edit_notes', (select notes from public.shoots where id = v_s) = 'взять свет');
  begin perform public.shoot_cancel(v_s, 'не хочу'); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('d_mobilographer_cannot_cancel', ok);
  begin perform public.shoot_complete(v_s, null, null, ''); ok := false; exception when others then ok := sqlerrm like '%исходники%'; end;
  res := res || jsonb_build_object('d_complete_needs_sources', ok);
  perform public.shoot_complete(v_s, null, null, 'https://drive.test/src');
  res := res || jsonb_build_object('d_mobilographer_completes',
    (select status from public.shoots where id = v_s) = 'done'
    and (select sources_url from public.shoots where id = v_s) = 'https://drive.test/src'
    and exists (select 1 from public.comments where entity_type = 'shoot' and entity_id = v_s and author_id = ex));
  begin perform public.shoot_complete(v_s, null, null, 'https://drive.test/src'); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('d_complete_once', ok);
  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  perform public.shoot_cancel(v_s2, 'клиент перенёс');
  res := res || jsonb_build_object('d_manager_cancels',
    (select status from public.shoots where id = v_s2) = 'cancelled'
    and exists (select 1 from public.notifications where user_id = ex and type = 'shoot.cancelled'));

  -- ───── E. роли и права: изменение строки запрещено ─────
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin update public.user_roles set role_code = 'owner' where user_id = mgr; ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('e_cannot_rewrite_role_to_owner', ok);
  begin update public.user_permissions set permission_code = 'roles.manage' where user_id = mgr; ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('e_cannot_rewrite_permission', ok);
  reset role;
  res := res || jsonb_build_object('e_roles_unchanged', (select array_agg(role_code) from public.user_roles where user_id = mgr) = array['project_admin']);

  if exists (select 1 from jsonb_each(res) where value <> 'true'::jsonb) then
    raise exception 'TEST FAILED: %', res;
  end if;
  raise exception 'TEST OK: %', res;
end $$;
