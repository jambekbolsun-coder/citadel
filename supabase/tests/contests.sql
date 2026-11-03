-- Интеграционный тест 0022: соревнования — баллы, места, скрытие до итогов, итоги, премии, права.
-- Выполняется целиком и откатывается исключением с итогом — реальные данные не меняются.
-- Ожидаемый результат: ERROR "TEST OK: {...}", все значения true.
do $$
declare
  o uuid := gen_random_uuid(); a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); lazy uuid := gen_random_uuid();
  v_c uuid; dep uuid; r jsonb; ok boolean; n int; res jsonb := '{}'; s date := current_date - 20; e date := current_date - 2; d date;
begin
  insert into auth.users(id, email, email_confirmed_at, aud, role) values
    (o, 't-own@contest.test', now(), 'authenticated', 'authenticated'), (a, 't-a@contest.test', now(), 'authenticated', 'authenticated'),
    (b, 't-b@contest.test', now(), 'authenticated', 'authenticated'), (lazy, 't-l@contest.test', now(), 'authenticated', 'authenticated');
  perform set_config('citadel.bypass', 'on', true);
  update public.profiles set status = 'active', full_name = case id when o then 'Т Владелец' when a then 'Т Айгерим' when b then 'Т Бекжан' else 'Т Ленивый' end where id in (o, a, b, lazy);
  insert into public.user_roles(user_id, role_code) values (o, 'owner'), (a, 'mobilographer'), (b, 'mobilographer'), (lazy, 'designer');
  -- отдельный тестовый отдел: реальные сотрудники в сезон не попадают
  insert into public.departments(name) values ('Тест-отдел ' || gen_random_uuid()) returning id into dep;
  update public.profiles set department_id = dep where id in (a, b, lazy);
  -- A: 4 задачи от владельца, все вовремя; B: 4 задачи, 2 вовремя, 1 поздно, 1 не сделана; Ленивый: 1 задача (меньше порога)
  insert into public.tasks(title, status, assignee_id, created_by, due_at, completed_at)
  select 'T', 'done', a, o, (s + i)::timestamp + time '18:00', (s + i)::timestamp + time '12:00' from generate_series(1, 4) i;
  insert into public.tasks(title, status, assignee_id, created_by, due_at, completed_at) values
    ('T', 'done', b, o, (s + 1)::timestamp + time '18:00', (s + 1)::timestamp + time '12:00'),
    ('T', 'done', b, o, (s + 2)::timestamp + time '18:00', (s + 2)::timestamp + time '12:00'),
    ('T', 'done', b, o, (s + 3)::timestamp + time '18:00', (s + 5)::timestamp + time '12:00'),
    ('T', 'todo', b, o, (s + 4)::timestamp + time '18:00', null),
    ('T', 'done', lazy, o, (s + 4)::timestamp + time '18:00', (s + 4)::timestamp + time '10:00');
  -- задачи «себе самому» не считаются
  insert into public.tasks(title, status, assignee_id, created_by, due_at, completed_at)
  select 'Сам себе', 'done', b, b, (s + i)::timestamp + time '18:00', (s + i)::timestamp + time '10:00' from generate_series(1, 10) i;
  -- дни в приложении: A — каждый день, B — 2 дня
  for d in select g::date from generate_series(s, e, interval '1 day') g loop
    insert into public.app_activity(user_id, day) values (a, d) on conflict do nothing;
  end loop;
  insert into public.app_activity(user_id, day) values (b, s + 1), (b, s + 2);
  perform set_config('citadel.bypass', 'off', true);

  -- владелец создаёт сезон (участники — тестовый отдел)
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  v_c := public.contest_save(jsonb_build_object('title', 'Тест-сезон', 'starts_on', s, 'ends_on', e, 'scope', 'departments',
    'scope_ids', jsonb_build_array(dep), 'ranking', 'overall', 'min_items', 3,
    'weights', jsonb_build_object('completion', 35, 'discipline', 25, 'quality', 15, 'stories', 10, 'activity', 15),
    'prizes', jsonb_build_array(jsonb_build_object('place', 1, 'amount_minor', 500000, 'text', 'Аванс'), jsonb_build_object('place', 2, 'amount_minor', 0, 'text', 'Выходной'))));
  res := res || jsonb_build_object('new_season_notified', (select count(*) from public.notifications where type = 'contest.started' and entity_id = v_c::text and user_id in (a, b, lazy)) = 3);

  -- живой рейтинг владельца: A первое место, B второе, ленивый вне рейтинга, владелец не участвует
  select count(*) into n from public.contest_leaderboard(v_c);
  res := res || jsonb_build_object('participants_3_no_owner', n = 3,
    'a_first', (select place = 1 from public.contest_leaderboard(v_c) where user_id = a),
    'b_second', (select place = 2 from public.contest_leaderboard(v_c) where user_id = b),
    'lazy_not_ranked', (select place is null and not eligible from public.contest_leaderboard(v_c) where user_id = lazy),
    'b_self_tasks_ignored', (select (metrics->>'due')::int = 4 and (metrics->>'finished')::int = 3 and (metrics->>'on_time')::int = 2 from public.contest_leaderboard(v_c) where user_id = b),
    'a_score_100', (select score = 100 from public.contest_leaderboard(v_c) where user_id = a));

  -- сотрудник видит только свои баллы и не видит чужие до итогов
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  r := public.my_contest_score(v_c);
  res := res || jsonb_build_object('employee_own_score', (r->>'score')::numeric > 0 and (r->>'score')::numeric < 100 and not (r ? 'place'));
  begin perform public.contest_leaderboard(v_c); ok := false; exception when others then ok := sqlerrm like '%только владелец%'; end;
  res := res || jsonb_build_object('employee_no_leaderboard', ok);
  begin perform public.contest_reveal(v_c); ok := false; exception when others then ok := true; end;
  res := res || jsonb_build_object('employee_cannot_reveal', ok);
  execute 'set local role authenticated';
  select count(*) into n from public.contest_results where contest_id = v_c;
  execute 'reset role';
  res := res || jsonb_build_object('results_hidden_before_reveal', n = 0);

  -- итоги: фиксируются, уведомления, повтор безопасен
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  r := public.contest_reveal(v_c);
  res := res || jsonb_build_object('reveal_snapshot', (r->>'participants')::int = 3,
    'reveal_notified_winner', exists (select 1 from public.notifications where user_id = a and type = 'contest.results' and body like '%1-е место%'),
    'reveal_repeat_safe', (public.contest_reveal(v_c)->>'already')::boolean);
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.contest_results where contest_id = v_c;
  execute 'reset role';
  res := res || jsonb_build_object('results_visible_after_reveal', n = 3);
  begin perform public.contest_issue_bonuses(v_c); ok := false; exception when others then ok := sqlerrm like '%payroll.manage%'; end;
  res := res || jsonb_build_object('employee_cannot_issue_bonus', ok);

  -- премии: черновик начисления победителю, повтор запрещён, 0 сом за 2-е место — ничего не создаётся
  perform set_config('request.jwt.claims', json_build_object('sub', o, 'role', 'authenticated')::text, true);
  r := public.contest_issue_bonuses(v_c);
  res := res || jsonb_build_object('bonus_count_1', (r->>'count')::int = 1,
    'bonus_draft_for_a', (select bonus_minor = 500000 and status = 'draft' from public.payroll_accruals where user_id = a and period_month = date_trunc('month', e)::date),
    'no_bonus_for_b', not exists (select 1 from public.payroll_accruals where user_id = b and period_month = date_trunc('month', e)::date));
  begin perform public.contest_issue_bonuses(v_c); ok := false; exception when others then ok := sqlerrm like '%уже начислены%'; end;
  res := res || jsonb_build_object('bonus_not_twice', ok);

  -- идущий сезон нельзя закрыть досрочно
  v_c := public.contest_save(jsonb_build_object('title', 'Идёт', 'starts_on', current_date - 1, 'ends_on', current_date + 5, 'weights', jsonb_build_object('activity', 1)));
  begin perform public.contest_reveal(v_c); ok := false; exception when others then ok := sqlerrm like '%ещё идёт%'; end;
  res := res || jsonb_build_object('cannot_reveal_running', ok);

  raise exception 'TEST OK: %', res;
end $$;
