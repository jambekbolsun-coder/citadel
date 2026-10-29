-- 0011: индексы под реальные фильтры мобильных экранов и годовая сводка календаря агрегатами.
-- Только добавление объектов: ни одна таблица и ни одна строка не меняются.

create index if not exists content_items_prep_due_idx on public.content_items(prep_due);
create index if not exists content_items_reviewer_idx on public.content_items(reviewer_id, status);
create index if not exists tasks_due_idx on public.tasks(due_at);
create index if not exists tasks_reviewer_idx on public.tasks(reviewer_id, status);
create index if not exists notifications_unread_idx on public.notifications(user_id) where read_at is null and archived_at is null;
create index if not exists calendar_events_user_time_idx on public.calendar_events(user_id, starts_at);
create index if not exists shoot_participants_user_idx on public.shoot_participants(user_id);

-- Годовой обзор: счётчики по месяцам вместо выгрузки всех записей за год.
-- security invoker — считаются только строки, видимые сотруднику по RLS.
create or replace function public.calendar_year_summary(p_from timestamptz, p_to timestamptz, p_project uuid default null, p_person uuid default null)
returns table(month int, kind text, n bigint)
language sql stable security invoker set search_path = public as $$
  select extract(month from (c.prep_due at time zone 'Asia/Bishkek'))::int, 'content', count(*)
    from public.content_items c
   where c.prep_due between p_from and p_to and c.status not in ('cancelled', 'done', 'published')
     and (p_project is null or c.project_id = p_project) and (p_person is null or c.assignee_id = p_person)
   group by 1
  union all
  select extract(month from (c.publish_due at time zone 'Asia/Bishkek'))::int, 'publish', count(*)
    from public.content_items c
   where c.publish_due between p_from and p_to and c.status <> 'cancelled'
     and (p_project is null or c.project_id = p_project) and (p_person is null or c.assignee_id = p_person)
   group by 1
  union all
  select extract(month from (s.starts_at at time zone 'Asia/Bishkek'))::int, 'shoot', count(*)
    from public.shoots s
   where s.starts_at between p_from and p_to and s.status <> 'cancelled'
     and (p_project is null or s.project_id = p_project)
     and (p_person is null or exists (select 1 from public.shoot_participants sp where sp.shoot_id = s.id and sp.user_id = p_person))
   group by 1
  union all
  select extract(month from (t.due_at at time zone 'Asia/Bishkek'))::int, 'task', count(*)
    from public.tasks t
   where t.due_at between p_from and p_to and t.status <> 'cancelled'
     and (p_project is null or t.project_id = p_project) and (p_person is null or t.assignee_id = p_person)
   group by 1
$$;
revoke execute on function public.calendar_year_summary(timestamptz, timestamptz, uuid, uuid) from public, anon;
grant execute on function public.calendar_year_summary(timestamptz, timestamptz, uuid, uuid) to authenticated;
