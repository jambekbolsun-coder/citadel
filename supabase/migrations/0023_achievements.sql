-- 0023. Значки, серия без просрочек, итоги месяца и дни рождения. Только новые функции (чтение), данные не меняются.

-- Свои достижения: всё считается по своим задачам и материалам (security invoker — работает RLS).
-- streak_days — рабочие дни подряд без просрочек до сегодня (сейчас есть просрочка — 0); best_streak — лучшая серия за всё время
-- (значок не пропадает после срыва). month — итоги прошлого месяца.
create or replace function public.my_achievements()
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare uid uuid := auth.uid(); today date := (now() at time zone 'Asia/Bishkek')::date;
  wd int[]; overdue_now boolean; first_day date; streak int := 0; best int := 0;
  m_from date := (date_trunc('month', today) - interval '1 month')::date; m_to date := date_trunc('month', today)::date;
  tf timestamptz; tt timestamptz; res jsonb;
begin
  if uid is null then return null; end if;
  wd := coalesce((select array_agg(x::int) from jsonb_array_elements_text((select value::jsonb from public.app_settings where key = 'work_days')) x), '{1,2,3,4,5}');
  tf := (m_from::timestamp at time zone 'Asia/Bishkek'); tt := (m_to::timestamp at time zone 'Asia/Bishkek');

  select exists (select 1 from public.tasks where assignee_id = uid and status not in ('done', 'cancelled', 'review') and due_at < now())
      or exists (select 1 from public.content_items where assignee_id = uid and status not in ('done', 'published', 'cancelled', 'paused', 'review') and prep_due < now())
    into overdue_now;
  select (least((select min(created_at) from public.tasks where assignee_id = uid), (select min(created_at) from public.content_items where assignee_id = uid)) at time zone 'Asia/Bishkek')::date
    into first_day;
  if first_day is not null then
    -- «окна просрочки»: от дня срока до дня сдачи (открытая просрочка — до сегодня); серии — рабочие дни между окнами
    with ev as (
      select (due_at at time zone 'Asia/Bishkek')::date s, (completed_at at time zone 'Asia/Bishkek')::date e from public.tasks
       where assignee_id = uid and status = 'done' and completed_at > due_at
      union all
      select (prep_due at time zone 'Asia/Bishkek')::date, (coalesce(submitted_at, prepared_at) at time zone 'Asia/Bishkek')::date from public.content_items
       where assignee_id = uid and coalesce(submitted_at, prepared_at) > prep_due
      union all
      select (due_at at time zone 'Asia/Bishkek')::date, today from public.tasks where assignee_id = uid and status not in ('done', 'cancelled', 'review') and due_at < now()
      union all
      select (prep_due at time zone 'Asia/Bishkek')::date, today from public.content_items where assignee_id = uid and status not in ('done', 'published', 'cancelled', 'paused', 'review') and prep_due < now()
    ), gaps as (
      select coalesce(max(e) over (order by s, e rows between unbounded preceding and 1 preceding) + 1, first_day) g_from, s - 1 g_to from ev
      union all
      select coalesce(max(e) + 1, first_day), today from ev
    )
    select coalesce(max(n), 0), coalesce(max(n) filter (where g_to = today), 0) into best, streak
      from (select g_from, g_to, (select count(*) from generate_series(g_from, g_to, interval '1 day') d where extract(isodow from d)::int = any(wd))::int n from gaps) x;
    if overdue_now then streak := 0; end if;
  end if;

  select jsonb_build_object(
    'tasks_done', (select count(*) from public.tasks where assignee_id = uid and status = 'done' and created_by is distinct from uid),
    'videos', (select count(*) from public.content_items where assignee_id = uid and kind = 'video' and status in ('done', 'published')),
    'content', (select count(*) from public.content_items where assignee_id = uid and status in ('done', 'published')),
    'story_days', (select count(*) from public.story_daily_plans where assignee_id = uid and planned > 0 and actual >= planned),
    'active_days', (select count(*) from public.app_activity where user_id = uid),
    'contest_top3', (select count(*) from public.contest_results r join public.contests c on c.id = r.contest_id where r.user_id = uid and c.status = 'revealed' and r.place between 1 and 3),
    'contest_wins', (select count(*) from public.contest_results r join public.contests c on c.id = r.contest_id where r.user_id = uid and c.status = 'revealed' and r.place = 1),
    'streak_days', streak,
    'best_streak', greatest(best, streak),
    'overdue_now', overdue_now,
    'month', jsonb_build_object(
      'from', m_from,
      'tasks', (select count(*) from public.tasks where assignee_id = uid and status = 'done' and created_by is distinct from uid and completed_at >= tf and completed_at < tt),
      'content', (select count(*) from public.content_items where assignee_id = uid and status in ('done', 'published') and approved_at >= tf and approved_at < tt),
      'late', (select count(*) from public.tasks where assignee_id = uid and status = 'done' and completed_at > due_at and completed_at >= tf and completed_at < tt)
            + (select count(*) from public.content_items where assignee_id = uid and coalesce(submitted_at, prepared_at) > prep_due and coalesce(submitted_at, prepared_at) >= tf and coalesce(submitted_at, prepared_at) < tt),
      'active_days', (select count(*) from public.app_activity where user_id = uid and day >= m_from and day < m_to),
      'best_place', (select min(r.place) from public.contest_results r join public.contests c on c.id = r.contest_id
                      where r.user_id = uid and c.status = 'revealed' and c.ends_on >= m_from and c.ends_on < m_to)
    )) into res;
  return res;
end $$;
revoke execute on function public.my_achievements() from public, anon;
grant execute on function public.my_achievements() to authenticated;

-- Именинники сегодня: только имя (без года рождения), только те, кто сам указал дату в профиле.
create or replace function public.birthdays_today()
returns table (id uuid, full_name text, greet_name text, avatar_url text)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.greet_name, p.avatar_url from public.profiles p
   where public.is_active() and p.status = 'active' and p.birth_date is not null
     and to_char(p.birth_date, 'MM-DD') = to_char((now() at time zone 'Asia/Bishkek')::date, 'MM-DD')
   order by p.full_name;
$$;
revoke execute on function public.birthdays_today() from public, anon;
grant execute on function public.birthdays_today() to authenticated;
