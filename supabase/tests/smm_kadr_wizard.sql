-- Интеграционный тест 0018–0019: мастер «Добавить проект», база клиентов без дублей, заявка с тарифом, права CMS.
-- Выполняется целиком и откатывается исключением с итогом — реальные данные не меняются, уведомления не уходят
-- (push-функция читает только закоммиченные уведомления).
-- Запуск: SQL editor Supabase / execute_sql. Ожидаемый результат: ERROR "TEST OK: {...}", все значения true.
do $$
declare
  o uuid := gen_random_uuid(); mob uuid := gen_random_uuid(); acc uuid := gen_random_uuid();
  r jsonb; r2 jsonb; ok boolean; n int; res jsonb := '{}';
  v_tv_pro uuid; v_tv_once uuid; v_client uuid; v_p1 uuid; v_p2 uuid; v_p3 uuid; v_lead uuid; ph text := '+99670' || lpad((floor(random() * 10000000))::text, 7, '0');
begin
  insert into auth.users(id, email, email_confirmed_at, aud, role) values
    (o, 't-own@smmkadr.test', now(), 'authenticated', 'authenticated'),
    (mob, 't-mob@smmkadr.test', now(), 'authenticated', 'authenticated'),
    (acc, 't-acc@smmkadr.test', now(), 'authenticated', 'authenticated');
  perform set_config('citadel.bypass', 'on', true);
  update public.profiles set status = 'active', full_name = 'Тест' where id in (o, mob, acc);
  insert into public.user_roles(user_id, role_code) values (o, 'owner'), (mob, 'mobilographer'), (acc, 'accountant');
  perform set_config('citadel.bypass', 'off', true);
  select v.id into v_tv_pro from public.tariff_versions v join public.tariffs t on t.id = v.tariff_id where t.code = 'pro' and v.is_current;
  select v.id into v_tv_once from public.tariff_versions v join public.tariffs t on t.id = v.tariff_id where t.code = 'one_time_launch' and v.is_current;

  -- телефоны
  res := res || jsonb_build_object(
    'phone_kg_formats', public.normalize_phone('0555 123 456') = '+996555123456' and public.normalize_phone('555123456') = '+996555123456' and public.normalize_phone('+996 555 123 456') = '+996555123456',
    'phone_intl', public.normalize_phone('+7 916 123 45 67') = '+79161234567',
    'phone_key_same', public.phone_key('0555123456') = public.phone_key('+996555123456'));
  begin perform public.normalize_phone('12345'); ok := false; exception when others then ok := sqlerrm like '%Некорректный номер%'; end;
  res := res || jsonb_build_object('phone_invalid_human_error', ok);

  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);

  -- A. новый клиент + месячный тариф + частичная оплата
  r := public.project_wizard_create(jsonb_build_object(
    'idempotency_key', 'k-a', 'client', jsonb_build_object('contact_name', 'Асанов Бекжан', 'phone', ph, 'company_name', 'Тест Kausar', 'niche', 'Строительство', 'whatsapp_same', true, 'socials', jsonb_build_object('instagram', '@kausar_test', 'tiktok', '')),
    'kind', 'monthly', 'tariff_version_id', v_tv_pro, 'price_minor', 4399900, 'currency', 'KGS', 'paid_minor', 1500000, 'paid_on', current_date, 'next_payment_on', current_date + 10));
  v_p1 := (r->>'project_id')::uuid; v_client := (r->>'client_id')::uuid;
  res := res || jsonb_build_object(
    'a_ok', (r->>'ok')::boolean and (r->>'client_created')::boolean,
    'a_one_client', (select count(*) from public.clients where phone_key = public.phone_key(ph)) = 1,
    'a_client_whatsapp', (select whatsapp = phone from public.clients where id = v_client),
    'a_socials_clean', (select socials = '{"instagram":"@kausar_test"}'::jsonb from public.clients where id = v_client),
    'a_project_draft', (select status = 'draft' and client_id = v_client and name = 'Тест Kausar' from public.projects where id = v_p1),
    'a_snapshot', (select tariff_snapshot->'tariffs'->>'code' = 'pro' and composition = '{"video":5}'::jsonb and price_minor = 4399900 from public.project_contracts where project_id = v_p1),
    'a_no_periods_until_launch', not exists (select 1 from public.project_periods where project_id = v_p1),
    'a_invoices_sum_price', (select sum(amount_minor) = 4399900 and count(*) = 2 from public.invoices where project_id = v_p1),
    'a_payment_pending', (select count(*) = 1 and bool_and(status = 'pending') from public.payments where project_id = v_p1),
    'a_paid_status_zero', (public.project_paid_status(v_p1)->>'paid')::bigint = 0 and (public.project_paid_status(v_p1)->>'pending')::bigint = 1500000,
    'a_admin_reminder_task', exists (select 1 from public.tasks where project_id = v_p1 and assignee_id = o and title like 'Назначить администратора%'));
  begin perform public.launch_project(v_p1, null); ok := false; exception when others then ok := sqlerrm like '%Допуск невозможен%' or sqlerrm like '%администратор%'; end; -- без администратора и без 100% оплаты запуск запрещён
  res := res || jsonb_build_object('a_launch_blocked_without_payment', ok);

  -- B. повтор с тем же ключом (двойное нажатие) — без дублей
  r2 := public.project_wizard_create(jsonb_build_object('idempotency_key', 'k-a', 'client', jsonb_build_object('contact_name', 'Асанов Бекжан', 'phone', ph), 'price_minor', 100));
  res := res || jsonb_build_object('b_repeat_same_project', (r2->>'repeat')::boolean and r2->>'project_id' = v_p1::text,
    'b_still_one_project', (select count(*) from public.projects where client_id = v_client) = 1,
    'b_still_one_client', (select count(*) from public.clients where phone_key = public.phone_key(ph)) = 1);

  -- C. тот же телефон как «новый клиент» — сервер предлагает существующего, дубль не создаётся
  r2 := public.project_wizard_create(jsonb_build_object('idempotency_key', 'k-c', 'client', jsonb_build_object('contact_name', 'Другой человек', 'phone', '0' || right(ph, 9)), 'price_minor', 0));
  res := res || jsonb_build_object('c_duplicate_detected', not (r2->>'ok')::boolean and r2->'duplicate_client'->>'id' = v_client::text,
    'c_no_project_created', not exists (select 1 from public.projects where idempotency_key = 'k-c'));

  -- D. второй проект существующего клиента (разовый тариф): профиль клиента не меняется, разовый объём
  r2 := public.project_wizard_create(jsonb_build_object('idempotency_key', 'k-d', 'client_id', v_client, 'client', jsonb_build_object('contact_name', 'НЕ ДОЛЖНО ЗАПИСАТЬСЯ', 'phone', '0700000000'),
    'kind', 'one_time', 'tariff_version_id', v_tv_once));
  v_p2 := (r2->>'project_id')::uuid;
  res := res || jsonb_build_object('d_ok_existing', (r2->>'ok')::boolean and not (r2->>'client_created')::boolean and r2->>'client_id' = v_client::text,
    'd_profile_untouched', (select contact_name = 'Асанов Бекжан' and phone = public.normalize_phone(ph) from public.clients where id = v_client),
    'd_two_projects_one_client', (select count(*) from public.projects where client_id = v_client) = 2,
    'd_one_time_kind_price_from_tariff', (select p.kind = 'one_time' and c.price_minor = 1050000 from public.projects p join public.project_contracts c on c.project_id = p.id where p.id = v_p2),
    'd_single_invoice_full', (select count(*) = 1 and sum(amount_minor) = 1050000 from public.invoices where project_id = v_p2));

  -- E. ошибки ввода и переплата
  begin perform public.project_wizard_create(jsonb_build_object('idempotency_key', 'k-e1', 'client', jsonb_build_object('contact_name', '', 'phone', '0555111222'), 'price_minor', 0)); ok := false;
  exception when others then ok := sqlerrm like '%ФИО%'; end;
  res := res || jsonb_build_object('e_empty_name', ok);
  begin perform public.project_wizard_create(jsonb_build_object('idempotency_key', 'k-e2', 'client', jsonb_build_object('contact_name', 'Тест Тестов', 'phone', '123'), 'price_minor', 0)); ok := false;
  exception when others then ok := sqlerrm like '%Некорректный номер%'; end;
  res := res || jsonb_build_object('e_bad_phone', ok);
  begin perform public.project_wizard_create(jsonb_build_object('idempotency_key', 'k-e3', 'client_id', v_client, 'price_minor', 1000, 'paid_minor', 5000)); ok := false;
  exception when others then ok := sqlerrm like '%больше стоимости%'; end;
  res := res || jsonb_build_object('e_overpay_rejected', ok, 'e_nothing_left_behind', not exists (select 1 from public.projects where idempotency_key like 'k-e%'));

  -- F. поиск клиента в базе
  res := res || jsonb_build_object('f_lookup_phone', exists (select 1 from public.client_lookup('0' || right(ph, 9)) x where x.id = v_client and x.match = 'phone'),
    'f_lookup_name', exists (select 1 from public.client_lookup('Асанов') x where x.id = v_client));

  -- G. заявка с сайта: тариф, подробное уведомление владельцу
  r := public.submit_lead(jsonb_build_object('name', 'Тест Заявка', 'phone', '+996 700 111 222', 'business', 'Кафе «Тест»', 'tariff_code', 'pro', 'consent', true, 'idempotency_key', 'lead-k1', 'source', 'site'));
  v_lead := (r->>'id')::uuid;
  res := res || jsonb_build_object('g_lead_tariff', (select tariff_id is not null and service = 'Тариф «Про»' from public.leads where id = v_lead),
    'g_owner_notified', exists (select 1 from public.notifications where user_id = o and type = 'lead.new' and entity_id = v_lead::text and body like '%Кафе «Тест»%' and body like '%Про%'),
    'g_lead_idempotent', (public.submit_lead(jsonb_build_object('name', 'Тест Заявка', 'phone', '+996 700 111 222', 'consent', true, 'idempotency_key', 'lead-k1'))->>'duplicate')::boolean);

  -- H. права: мобилограф не создаёт проекты и не правит сайт
  perform set_config('request.jwt.claims', json_build_object('sub', mob, 'role', 'authenticated')::text, true);
  begin perform public.project_wizard_create(jsonb_build_object('idempotency_key', 'k-h', 'client', jsonb_build_object('contact_name', 'Х Х', 'phone', '0555999888'), 'price_minor', 0)); ok := false;
  exception when others then ok := sqlerrm like '%projects.create%'; end;
  res := res || jsonb_build_object('h_no_perm_wizard', ok);
  execute 'set local role authenticated';
  update public.site_blocks set draft = '{}' where key = 'p01_hero';
  get diagnostics n = row_count;
  res := res || jsonb_build_object('h_site_update_blocked_by_rls', n = 0);
  execute 'set local role anon';
  update public.site_blocks set draft = '{}' where key = 'p01_hero';
  get diagnostics n = row_count;
  res := res || jsonb_build_object('h_anon_site_update_blocked', n = 0);
  execute 'reset role';

  raise exception 'TEST OK: %', res;
end $$;
