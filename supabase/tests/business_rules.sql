-- Интеграционный тест бизнес-правил (п. 27 ТЗ). Выполняется целиком и откатывается исключением с итогом.
-- Запуск: вставить в SQL editor Supabase / execute_sql. Ожидаемый результат: ERROR "TEST OK: {...}".
do $$
declare
  owner_id uuid := gen_random_uuid(); sales_id uuid := gen_random_uuid(); acc_id uuid := gen_random_uuid(); mob_id uuid := gen_random_uuid();
  v_client uuid; v_project uuid; v_period uuid; v_inv uuid; v_pay uuid; v_acc uuid; s jsonb; r jsonb; v_content uuid; v_story uuid;
  v_accrual uuid; v_lead jsonb; v_lead2 jsonb; ok boolean; msg text; res jsonb := '{}';
  procedure_as text;
begin
  -- пользователи
  insert into auth.users(id, email, email_confirmed_at, aud, role) values
    (owner_id, 't-owner@citadel.test', now(), 'authenticated', 'authenticated'),
    (sales_id, 't-sales@citadel.test', now(), 'authenticated', 'authenticated'),
    (acc_id, 't-acc@citadel.test', now(), 'authenticated', 'authenticated'),
    (mob_id, 't-mob@citadel.test', now(), 'authenticated', 'authenticated');

  -- владелец (если владельца ещё нет — claim; иначе назначаем напрямую в тесте)
  perform set_config('request.jwt.claims', json_build_object('sub', owner_id, 'role', 'authenticated')::text, true);
  if not public.owner_exists() then perform public.claim_first_owner('Тест Владелец');
  else
    perform set_config('citadel.bypass', 'on', true);
    update public.profiles set status = 'active' where id = owner_id;
    insert into public.user_roles(user_id, role_code) values (owner_id, 'owner');
    perform set_config('citadel.bypass', 'off', true);
  end if;
  perform set_config('citadel.bypass', 'on', true);
  update public.profiles set status = 'active' where id in (sales_id, acc_id, mob_id);
  insert into public.user_roles(user_id, role_code) values (sales_id, 'sales'), (acc_id, 'accountant'), (mob_id, 'mobilographer');
  perform set_config('citadel.bypass', 'off', true);

  -- 1. Лид: идемпотентность и уведомление
  v_lead := public.submit_lead('{"name":"Тест Клиент","phone":"+996555000111","consent":true,"service":"SMM","idempotency_key":"test-key-1"}');
  v_lead2 := public.submit_lead('{"name":"Тест Клиент","phone":"+996555000111","consent":true,"service":"SMM","idempotency_key":"test-key-1"}');
  res := res || jsonb_build_object('lead_dedup', (v_lead->>'id') = (v_lead2->>'id'),
     'lead_notified_owner', exists (select 1 from public.notifications where user_id = owner_id and entity_id = v_lead->>'id'),
     'lead_notified_sales', exists (select 1 from public.notifications where user_id = sales_id and entity_id = v_lead->>'id'));

  -- 2. Проект Про Макс 60 000
  perform set_config('request.jwt.claims', json_build_object('sub', owner_id, 'role', 'authenticated')::text, true);
  v_client := public.lead_convert((v_lead->>'id')::uuid, 'ООО Тест');
  insert into public.projects(name, client_id, kind, status, admin_id, stories_method, handoff, created_by)
  values ('Тест проект', v_client, 'monthly', 'awaiting_payment', owner_id, 'fixed_per_period',
          '{"client":true,"package":true,"dates":true,"wishes":true,"admin_accepted":true}', owner_id) returning id into v_project;
  insert into public.project_contracts(project_id, price_minor, composition) values (v_project, 6000000, '{"video":8,"story":120}');
  insert into public.invoices(project_id, title, amount_minor, due_on, created_by) values (v_project, 'Счёт', 6000000, current_date + 3, owner_id) returning id into v_inv;
  select id into v_acc from public.financial_accounts order by created_at limit 1;

  -- 3. Продавец вносит 15 000 и не может подтвердить сам
  perform set_config('request.jwt.claims', json_build_object('sub', sales_id, 'role', 'authenticated')::text, true);
  insert into public.payments(invoice_id, project_id, amount_minor, created_by) values (v_inv, v_project, 1500000, sales_id) returning id into v_pay;
  begin perform public.payment_confirm(v_pay, v_acc); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('seller_cannot_confirm_own', ok);
  -- бухгалтер подтверждает
  perform set_config('request.jwt.claims', json_build_object('sub', acc_id, 'role', 'authenticated')::text, true);
  perform public.payment_confirm(v_pay, v_acc);
  select pay_state into msg from public.v_invoice_status where id = v_inv;
  s := public.project_paid_status(v_project);
  res := res || jsonb_build_object('partial_state', msg, 'remaining', ((s->>'price')::bigint - (s->>'paid')::bigint) / 100);

  -- 4. Гейт: без 100% не запускается
  perform set_config('request.jwt.claims', json_build_object('sub', owner_id, 'role', 'authenticated')::text, true);
  begin perform public.launch_project(v_project, null); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('gate_blocks_partial', ok);
  insert into public.payments(invoice_id, project_id, amount_minor, created_by) values (v_inv, v_project, 4500000, owner_id) returning id into v_pay;
  perform set_config('request.jwt.claims', json_build_object('sub', acc_id, 'role', 'authenticated')::text, true);
  perform public.payment_confirm(v_pay, v_acc);
  perform set_config('request.jwt.claims', json_build_object('sub', owner_id, 'role', 'authenticated')::text, true);
  v_period := public.launch_project(v_project, null);
  -- 5. План: 8 видео, 120 сторис, повторный запуск без дублей
  r := public.generate_period_plan(v_period);
  perform public.generate_period_plan(v_period);
  res := res || jsonb_build_object('plan_videos', (select count(*) from public.content_items where period_id = v_period and kind = 'video'),
    'plan_stories_total', (select sum(planned) from public.story_daily_plans where period_id = v_period));

  -- 6. Контент: назначение, ТЗ обязательно, 2 размещения = 1 видео
  select id into v_content from public.content_items where period_id = v_period and kind = 'video' order by occurrence_key::int limit 1;
  begin perform public.content_assign(v_content, mob_id, owner_id, '', now() + interval '1 day', null); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('brief_required', ok);
  perform public.content_assign(v_content, mob_id, owner_id, 'ТЗ: обзор продукта', now() + interval '1 day', null);
  perform set_config('request.jwt.claims', json_build_object('sub', mob_id, 'role', 'authenticated')::text, true);
  perform public.content_transition(v_content, 'in_progress');
  begin perform public.content_transition(v_content, 'review'); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('result_required_for_review', ok);
  perform public.content_transition(v_content, 'review', null, 'https://drive.example/v1');
  perform set_config('request.jwt.claims', json_build_object('sub', owner_id, 'role', 'authenticated')::text, true);
  perform public.content_transition(v_content, 'done');
  insert into public.placements(content_id, platform, url, created_by) values (v_content, 'instagram_reels', 'https://instagram.com/reel/1', owner_id),
    (v_content, 'tiktok', 'https://tiktok.com/@x/1', owner_id);
  perform public.content_transition(v_content, 'published');
  res := res || jsonb_build_object('progress_video', (select jsonb_build_object('prepared', prepared, 'published', published, 'left', left_to_prepare)
       from public.v_period_progress where period_id = v_period and kind = 'video'),
     'placements', (select count(*) from public.placements where content_id = v_content));

  -- 7. Сторис 3 из 5
  select id into v_story from public.story_daily_plans where period_id = v_period order by day limit 1;
  update public.story_daily_plans set planned = 5, actual = 3 where id = v_story;
  res := res || jsonb_build_object('story_day', (select jsonb_build_object('planned', planned, 'actual', actual, 'left', planned - actual) from public.story_daily_plans where id = v_story));

  -- 8. Прямое изменение статуса материала из клиента запрещено (RLS + guard)
  perform set_config('request.jwt.claims', json_build_object('sub', mob_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin update public.content_items set status = 'planned' where id = v_content; ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('direct_status_update_blocked', ok);
  -- мобилограф не видит зарплаты, цены и финансы
  res := res || jsonb_build_object('mob_sees_contracts', (select count(*) from public.project_contracts),
     'mob_sees_payments', (select count(*) from public.payments), 'mob_sees_salary_terms_of_others', (select count(*) from public.salary_terms where user_id <> mob_id));
  reset role;

  -- 9. Зарплата: начислено 50 000, аванс 15 000 → долг 35 000
  perform set_config('request.jwt.claims', json_build_object('sub', owner_id, 'role', 'authenticated')::text, true);
  insert into public.salary_terms(user_id, pay_type, base_minor, pay_days, effective_from, created_by)
  values (mob_id, 'fixed', 5000000, '{5,20}', date_trunc('month', current_date)::date, owner_id);
  v_accrual := public.payroll_compute(mob_id, current_date);
  perform public.payroll_approve(v_accrual);
  perform public.salary_pay(mob_id, v_accrual, 'advance', 1500000, current_date, v_acc, 'аванс');
  res := res || jsonb_build_object('salary_debt', (select (accrued_minor - paid_minor) / 100 from public.v_payroll_balance where user_id = mob_id));
  begin update public.payroll_accruals set bonus_minor = 1 where id = v_accrual; ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('approved_accrual_immutable', ok);

  -- 10. Нельзя снять единственного владельца / назначить себе owner
  perform set_config('request.jwt.claims', json_build_object('sub', sales_id, 'role', 'authenticated')::text, true);
  begin insert into public.user_roles(user_id, role_code) values (sales_id, 'owner'); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('self_owner_blocked', ok);

  raise exception 'TEST OK: %', res;
end $$;
