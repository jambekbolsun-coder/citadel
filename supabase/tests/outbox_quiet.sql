-- Интеграционный тест 0027: журнал event_outbox пополняется, только когда ушло новое уведомление.
-- Откатывается; ожидается ERROR "TEST OK: {...}", при ошибке — "TEST FAILED".
do $$
declare o uuid := gen_random_uuid(); n0 int; n1 int; n2 int; k text := 'outbox-test:' || gen_random_uuid(); res jsonb := '{}';
begin
  insert into auth.users(id, email, email_confirmed_at, aud, role) values (o, 'ob-own@citadel.test', now(), 'authenticated', 'authenticated');
  perform set_config('citadel.bypass', 'on', true);
  update public.profiles set status = 'active', full_name = 'Тест 0027' where id = o;
  insert into public.user_roles(user_id, role_code) values (o, 'owner');
  perform set_config('citadel.bypass', 'off', true);

  select count(*) into n0 from public.event_outbox;
  perform public.notify_perm('leads.receive', 'test.outbox', 'Тест', 'тело', 'lead', 'x', 'normal', k);
  select count(*) into n1 from public.event_outbox;
  perform public.notify_perm('leads.receive', 'test.outbox', 'Тест', 'тело', 'lead', 'x', 'normal', k); -- повтор того же напоминания
  select count(*) into n2 from public.event_outbox;
  res := res || jsonb_build_object(
    'first_call_logged', n1 = n0 + 1,
    'repeat_not_logged', n2 = n1,
    'notification_once', (select count(*) from public.notifications where user_id = o and idempotency_key = k) = 1);

  if exists (select 1 from jsonb_each(res) where value <> 'true'::jsonb) then raise exception 'TEST FAILED: %', res; end if;
  raise exception 'TEST OK: %', res;
end $$;
