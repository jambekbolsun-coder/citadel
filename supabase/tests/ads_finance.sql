-- Интеграционный тест 0013–0016: утверждение сотрудника, рабочее место таргетолога, валюты касс, баланс зарплаты.
-- Выполняется целиком и откатывается исключением с итогом — реальные данные не меняются.
-- Запуск: SQL editor Supabase / execute_sql. Ожидаемый результат: ERROR "TEST OK: {...}" и все значения true.
do $$
declare
  o uuid := gen_random_uuid(); t1 uuid := gen_random_uuid(); t2 uuid := gen_random_uuid(); emp uuid := gen_random_uuid(); acc uuid := gen_random_uuid();
  v_client uuid; v_project uuid; v_camp uuid; ca uuid; cb uuid; cc uuid; r jsonb; ok boolean; n int; e_a uuid;
  k_kgs uuid; k_usd uuid; v_inv uuid; v_pay uuid; v_exp uuid; v_cat uuid; v_accrual uuid; res jsonb := '{}';
begin
  insert into auth.users(id, email, email_confirmed_at, aud, role) values
    (o, 't-own@citadel.test', now(), 'authenticated', 'authenticated'), (t1, 't-tg1@citadel.test', now(), 'authenticated', 'authenticated'),
    (t2, 't-tg2@citadel.test', now(), 'authenticated', 'authenticated'), (emp, 't-emp@citadel.test', now(), 'authenticated', 'authenticated'),
    (acc, 't-acc2@citadel.test', now(), 'authenticated', 'authenticated');
  perform set_config('citadel.bypass', 'on', true);
  update public.profiles set status = 'active', full_name = 'Тест' where id in (o, t1, t2, acc);
  update public.profiles set status = 'pending_approval', full_name = 'Новый сотрудник' where id = emp;
  insert into public.user_roles(user_id, role_code) values (o, 'owner'), (t1, 'targetologist'), (t2, 'targetologist'), (emp, 'mobilographer'), (acc, 'accountant');
  insert into public.device_pins(user_id, device_id, pin_hash) values (emp, 'dev-1', 'x');
  perform set_config('citadel.bypass', 'off', true);

  -- ───── A. утверждение сотрудника ─────
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  r := public.employee_set_status(emp, 'active', null);
  res := res || jsonb_build_object('approve_changed', (r->>'changed')::boolean and r->>'status' = 'active',
    'approve_one_row', (select status::text from public.profiles where id = emp) = 'active');
  r := public.employee_set_status(emp, 'active', null);
  res := res || jsonb_build_object('approve_idempotent', not (r->>'changed')::boolean,
    'approve_single_notification', (select count(*) from public.notifications where user_id = emp and type = 'employee.approved') = 1);
  begin perform public.employee_set_status(gen_random_uuid(), 'active', null); ok := false; exception when others then ok := sqlerrm like '%не найден%'; end;
  res := res || jsonb_build_object('approve_missing_id_error', ok);
  begin perform public.employee_set_status(o, 'blocked', null); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('cannot_change_self', ok);
  perform set_config('request.jwt.claims', json_build_object('sub', t1, 'role', 'authenticated')::text, true);
  begin perform public.employee_set_status(emp, 'blocked', null); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('employee_cannot_approve', ok);
  perform set_config('request.jwt.claims', json_build_object('sub', emp, 'role', 'authenticated')::text, true);
  begin update public.profiles set job_title = 'Директор' where id = emp; ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('employee_cannot_self_activate', ok);
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  r := public.employee_set_status(emp, 'blocked', 'тест');
  perform public.employee_set_status(emp, 'blocked', 'тест');
  res := res || jsonb_build_object('block_resets_pins', not exists (select 1 from public.device_pins where user_id = emp),
    'block_single_offboarding_task', (select count(*) from public.tasks where type = 'offboarding' and title like '%Новый сотрудник%') = 1);

  -- ───── B. таргетолог ─────
  insert into public.clients(company_name, contact_name, phone, niche, created_by) values ('Жер Төшөк', 'Айбек', '+996555000222', 'Товары для дома', o) returning id into v_client;
  insert into public.projects(name, client_id, kind, status, admin_id, stories_method, created_by)
  values ('Жер Төшөк', v_client, 'monthly', 'in_progress', o, 'fixed_per_period', o) returning id into v_project;
  insert into public.campaigns(project_id, name, platform, currency, owner_id, status, created_by)
  values (v_project, 'Матрасы осень', 'meta', 'USD', t1, 'active', o) returning id into v_camp;
  res := res || jsonb_build_object('targetologist_assigned_to_project', exists (select 1 from public.project_members where project_id = v_project and user_id = t1 and role = 'targetologist'),
    'campaign_history_started', (select count(*) from public.ad_status_history where campaign_id = v_camp) = 1);

  -- RLS глазами назначенного и чужого таргетолога
  perform set_config('request.jwt.claims', json_build_object('sub', t1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  res := res || jsonb_build_object('t1_sees_campaign', (select count(*) from public.campaigns where id = v_camp) = 1,
    't1_sees_client', (select count(*) from public.clients where id = v_client) = 1,
    't1_sees_project', (select count(*) from public.projects where id = v_project) = 1);
  insert into public.campaign_creatives(campaign_id, title, daily_budget_minor, status, created_by) values (v_camp, 'Видео 1', 500, 'active', t1) returning id into ca;
  insert into public.campaign_creatives(campaign_id, title, daily_budget_minor, status, created_by) values (v_camp, 'Видео 2', 300, 'active', t1) returning id into cb;
  insert into public.campaign_creatives(campaign_id, title, daily_budget_minor, status, created_by) values (v_camp, 'Видео 3', 200, 'paused', t1) returning id into cc;
  res := res || jsonb_build_object('active_daily_budget_8usd',
    (select sum(daily_budget_minor) from public.campaign_creatives where campaign_id = v_camp and status = 'active') = 800,
    'creative_seq', (select array_agg(seq order by seq) from public.campaign_creatives where campaign_id = v_camp) = array[1,2,3],
    'creative_currency_from_campaign', (select bool_and(currency = 'USD') from public.campaign_creatives where campaign_id = v_camp));
  begin update public.campaign_creatives set status = 'active' where id = cc; ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('direct_creative_status_blocked', ok);
  begin update public.campaign_creatives set daily_budget_minor = 900 where id = ca; ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('direct_budget_blocked', ok);

  -- $20 общим расходом, повтор с тем же ключом не удваивает
  r := public.ad_spend_add(v_camp, null, public.bishkek_today(), 'USD', 2000, 0, null, null, 'итог дня', 'key-1', false);
  r := public.ad_spend_add(v_camp, null, public.bishkek_today(), 'USD', 2000, 0, null, null, 'итог дня', 'key-1', false);
  res := res || jsonb_build_object('resubmit_is_duplicate', (r->>'duplicate')::boolean,
    'spend_after_resubmit_20', (select sum(spend_minor) from public.campaign_spend_entries where campaign_id = v_camp and superseded_at is null) = 2000);
  -- распределили $12 + $8 по видео — итог остаётся $20
  r := public.ad_spend_add(v_camp, ca, public.bishkek_today(), 'USD', 1200, 0, null, null, null, 'key-2', true);
  e_a := (r->>'id')::uuid;
  perform public.ad_spend_add(v_camp, cb, public.bishkek_today(), 'USD', 800, 0, null, null, null, 'key-3', true);
  res := res || jsonb_build_object('allocated_total_still_20', (select sum(spend_minor) from public.campaign_spend_entries where campaign_id = v_camp and superseded_at is null) = 2000,
    'unallocated_left_0', coalesce((select sum(spend_minor) from public.campaign_spend_entries where campaign_id = v_camp and superseded_at is null and creative_id is null), 0) = 0);
  begin perform public.ad_spend_add(v_camp, ca, public.bishkek_today(), 'USD', 100, 0, null, null, null, 'key-4', true); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('over_allocation_rejected', ok);
  -- сом отдельно, не складывается с долларами
  perform public.ad_spend_add(v_camp, null, public.bishkek_today(), 'KGS', 300000, 3, null, null, null, 'key-5', false);
  res := res || jsonb_build_object('currencies_separate', (select jsonb_object_agg(currency, s) from (select currency, sum(spend_minor) s from public.campaign_spend_entries where campaign_id = v_camp and superseded_at is null group by currency) x) = '{"USD":2000,"KGS":300000}'::jsonb);
  begin perform public.ad_spend_add(v_camp, ca, public.bishkek_today(), 'KGS', 100, 0, null, null, null, 'key-6', false); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('creative_currency_enforced', ok);
  -- исправление: старая запись в истории, действует новая
  perform public.ad_spend_correct(e_a, 1500, 0, null, null, null, 'опечатка', false);
  res := res || jsonb_build_object('correction_keeps_history', (select superseded_at is not null from public.campaign_spend_entries where id = e_a),
    'correction_total_23', (select sum(spend_minor) from public.campaign_spend_entries where campaign_id = v_camp and superseded_at is null and currency = 'USD') = 2300);
  begin update public.campaign_spend_entries set spend_minor = 1 where id = e_a; get diagnostics n = row_count; ok := n = 0; exception when others then ok := true; end;
  res := res || jsonb_build_object('direct_spend_update_blocked', ok);
  begin delete from public.campaign_spend_entries where campaign_id = v_camp; get diagnostics n = row_count; ok := n = 0; exception when others then ok := true; end;
  res := res || jsonb_build_object('direct_spend_delete_blocked', ok);
  begin perform public.campaign_set_status(v_camp, 'paused', null, null); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('pause_requires_reason', ok);
  perform public.campaign_set_status(v_camp, 'paused', null, 'Клиент попросил остановить');
  res := res || jsonb_build_object('pause_in_history', (select count(*) from public.ad_status_history where campaign_id = v_camp and creative_id is null) = 2);
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', t2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  res := res || jsonb_build_object('t2_no_campaign', (select count(*) from public.campaigns where id = v_camp) = 0,
    't2_no_client', (select count(*) from public.clients where id = v_client) = 0,
    't2_no_spend', (select count(*) from public.campaign_spend_entries where campaign_id = v_camp) = 0,
    't2_no_creatives', (select count(*) from public.campaign_creatives where campaign_id = v_camp) = 0);
  begin perform public.ad_spend_add(v_camp, null, public.bishkek_today(), 'USD', 100, 0, null, null, null, 'key-x', false); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('t2_cannot_add_spend', ok);
  begin insert into public.campaign_creatives(campaign_id, title, created_by) values (v_camp, 'чужое', t2); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('t2_cannot_add_creative', ok);
  reset role;

  -- ───── C. валюты касс и зарплата ─────
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  insert into public.financial_accounts(name, kind, currency) values ('Тест касса KGS', 'cash', 'KGS') returning id into k_kgs;
  insert into public.financial_accounts(name, kind, currency) values ('Тест касса USD', 'cash', 'USD') returning id into k_usd;
  insert into public.invoices(project_id, title, amount_minor, currency, due_on, created_by) values (v_project, 'Счёт', 6000000, 'KGS', current_date + 3, o) returning id into v_inv;
  begin insert into public.payments(invoice_id, project_id, amount_minor, currency, created_by) values (v_inv, v_project, 100, 'USD', o); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('payment_currency_must_match_invoice', ok);
  insert into public.payments(invoice_id, project_id, amount_minor, currency, created_by) values (v_inv, v_project, 1500000, 'KGS', o) returning id into v_pay;
  perform set_config('request.jwt.claims', json_build_object('sub', acc, 'role', 'authenticated')::text, true);
  begin perform public.payment_confirm(v_pay, k_usd); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('kgs_payment_into_usd_cash_rejected', ok);
  perform public.payment_confirm(v_pay, k_kgs);
  begin perform public.payment_confirm(v_pay, k_kgs); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('double_confirm_rejected', ok,
    'one_cash_movement', (select count(*) from public.money_transactions where source_id = v_pay) = 1,
    'invoice_debt_45000', (select (amount_minor - paid_minor) / 100 from public.v_invoice_status where id = v_inv) = 45000);

  -- зарплата: черновик с корректировкой не создаёт долга
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  insert into public.salary_terms(user_id, pay_type, base_minor, pay_days, effective_from, created_by) values (t1, 'fixed', 5000000, '{5}', date_trunc('month', current_date)::date, o);
  v_accrual := public.payroll_compute(t1, current_date);
  insert into public.payroll_adjustments(accrual_id, amount_minor, reason, created_by) values (v_accrual, 100000, 'премия', o);
  res := res || jsonb_build_object('draft_accrual_no_debt', (select accrued_minor from public.v_payroll_balance where user_id = t1 and currency = 'KGS') = 0);
  perform public.payroll_approve(v_accrual);
  begin perform public.salary_pay(t1, v_accrual, 'advance', 1500000, current_date, k_usd, null); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('salary_into_wrong_currency_rejected', ok);
  perform public.salary_pay(t1, v_accrual, 'advance', 1500000, current_date, k_kgs, null);
  perform public.salary_pay(t1, v_accrual, 'salary', 2000000, current_date, k_kgs, null);
  perform public.salary_pay(t1, v_accrual, 'offset', 100000, current_date, null, 'зачёт');
  res := res || jsonb_build_object(
    'salary_left_15000', (select (accrued_minor - paid_minor) / 100 from public.v_payroll_balance where user_id = t1 and currency = 'KGS') = 15000,
    'offset_no_cash_movement', (select count(*) from public.money_transactions t join public.salary_payments s on s.id = t.source_id where s.user_id = t1) = 2,
    'salary_tx_in_kgs', (select bool_and(t.currency = 'KGS') from public.money_transactions t join public.salary_payments s on s.id = t.source_id where s.user_id = t1));

  raise exception 'TEST OK: %', res;
end $$;
