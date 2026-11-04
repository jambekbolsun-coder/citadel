-- Интеграционный тест 0025: тема в профиле. Откатывается; ожидается ERROR "TEST OK: {...}", при ошибке — "TEST FAILED".
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); ok boolean; n int; res jsonb := '{}';
begin
  insert into auth.users(id, email, email_confirmed_at, aud, role) values
    (a, 'th-a@citadel.test', now(), 'authenticated', 'authenticated'), (b, 'th-b@citadel.test', now(), 'authenticated', 'authenticated');
  perform set_config('citadel.bypass', 'on', true);
  update public.profiles set status = 'active', full_name = 'Тест темы' where id in (a, b);
  insert into public.user_roles(user_id, role_code) values (a, 'mobilographer'), (b, 'mobilographer');
  perform set_config('citadel.bypass', 'off', true);
  res := res || jsonb_build_object('default_system', (select theme from public.profiles where id = a) = 'system');

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.profiles set theme = 'neon' where id = a;
  begin update public.profiles set theme = 'rainbow' where id = a; ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('unknown_theme_rejected', ok);
  update public.profiles set theme = 'pink' where id = b;
  get diagnostics n = row_count;
  res := res || jsonb_build_object('cannot_change_colleague_theme', n = 0);
  reset role;
  res := res || jsonb_build_object('own_theme_saved', (select theme from public.profiles where id = a) = 'neon',
    'colleague_untouched', (select theme from public.profiles where id = b) = 'system');

  if exists (select 1 from jsonb_each(res) where value <> 'true'::jsonb) then raise exception 'TEST FAILED: %', res; end if;
  raise exception 'TEST OK: %', res;
end $$;
