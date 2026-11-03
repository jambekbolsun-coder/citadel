-- Интеграционный тест 0023: серия без просрочек, счётчики значков, итоги прошлого месяца, именинники.
-- Выполняется целиком и откатывается исключением с итогом — реальные данные не меняются.
-- Ожидаемый результат: ERROR "TEST OK: {...}", все значения true.
do $$
declare
  o uuid := gen_random_uuid(); a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  today date := (now() at time zone 'Asia/Bishkek')::date; late_day date := today - 10;
  m_from date := (date_trunc('month', today) - interval '1 month')::date;
  r jsonb; res jsonb := '{}'; expect int; expect_best int; late_in_month int;
begin
  insert into auth.users(id, email, email_confirmed_at, aud, role) values
    (o, 't-own@ach.test', now(), 'authenticated', 'authenticated'), (a, 't-a@ach.test', now(), 'authenticated', 'authenticated'),
    (b, 't-b@ach.test', now(), 'authenticated', 'authenticated');
  perform set_config('citadel.bypass', 'on', true);
  update public.profiles set status = 'active', full_name = case id when o then 'Т Владелец' when a then 'Т Айгерим' else 'Т Бекжан' end,
    birth_date = case id when a then make_date(1996, extract(month from today)::int, extract(day from today)::int) end
   where id in (o, a, b);
  insert into public.user_roles(user_id, role_code) values (o, 'owner'), (a, 'mobilographer'), (b, 'mobilographer');
  -- A: одна задача сдана с опозданием 10 дней назад, 3 вовремя, 1 «сам себе» (не считается)
  -- первая работа A — 60 дней назад: лучшая серия = от неё до опоздания
  insert into public.tasks(title, status, assignee_id, created_by, created_at, due_at, completed_at) values
    ('T', 'done', a, o, now() - interval '60 days', (late_day - 1)::timestamp at time zone 'Asia/Bishkek', (late_day::timestamp + time '12:00') at time zone 'Asia/Bishkek');
  insert into public.tasks(title, status, assignee_id, created_by, due_at, completed_at) values
    ('T', 'done', a, o, now() + interval '1 day', now()), ('T', 'done', a, o, now() + interval '1 day', now()), ('T', 'done', a, o, now() + interval '1 day', now()),
    ('Сам', 'done', a, a, now() + interval '1 day', now());
  -- A в прошлом месяце: 2 задачи вовремя (+ опоздавшая, если 10 дней назад — ещё прошлый месяц)
  insert into public.tasks(title, status, assignee_id, created_by, due_at, completed_at) values
    ('M', 'done', a, o, ((m_from + 5)::timestamp + time '18:00') at time zone 'Asia/Bishkek', ((m_from + 5)::timestamp + time '12:00') at time zone 'Asia/Bishkek'),
    ('M', 'done', a, o, ((m_from + 6)::timestamp + time '18:00') at time zone 'Asia/Bishkek', ((m_from + 6)::timestamp + time '12:00') at time zone 'Asia/Bishkek');
  insert into public.app_activity(user_id, day) values (a, m_from + 1), (a, m_from + 2), (a, today);
  -- B: открытая просроченная задача
  insert into public.tasks(title, status, assignee_id, created_by, due_at) values ('T', 'todo', b, o, now() - interval '1 day');
  perform set_config('citadel.bypass', 'off', true);

  late_in_month := case when late_day >= m_from and late_day < date_trunc('month', today)::date then 1 else 0 end;
  select count(*) into expect_best from generate_series(today - 60, late_day - 2, interval '1 day') g where extract(isodow from g)::int = any('{1,2,3,4,5}');
  select count(*) into expect from generate_series(late_day + 1, today, interval '1 day') g where extract(isodow from g)::int = any('{1,2,3,4,5}');

  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  r := public.my_achievements();
  res := res || jsonb_build_object(
    'a_streak_from_last_late', (r->>'streak_days')::int = expect and expect > 0,
    'a_best_streak', (r->>'best_streak')::int = greatest(expect_best, expect) and expect_best > 0,
    'a_not_overdue', not (r->>'overdue_now')::boolean,
    'a_self_tasks_ignored', (r->>'tasks_done')::int = 6,
    'a_active_days', (r->>'active_days')::int = 3,
    'month_tasks', (r->'month'->>'tasks')::int = 2 + late_in_month,
    'month_late', (r->'month'->>'late')::int = late_in_month,
    'month_active', (r->'month'->>'active_days')::int = 2,
    'month_from', r->'month'->>'from' = m_from::text,
    'birthday_listed', exists (select 1 from public.birthdays_today() where id = a),
    'not_birthday_not_listed', not exists (select 1 from public.birthdays_today() where id = b));

  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  r := public.my_achievements();
  res := res || jsonb_build_object('b_overdue_streak_0', (r->>'streak_days')::int = 0 and (r->>'best_streak')::int = 0 and (r->>'overdue_now')::boolean);

  perform set_config('request.jwt.claims', '{}', true);
  res := res || jsonb_build_object('anon_null', public.my_achievements() is null,
    'anon_no_birthdays', not exists (select 1 from public.birthdays_today()));

  raise exception 'TEST OK: %', res;
end $$;
