-- 0012: обезличенные замеры скорости интерфейса (Web Vitals и переходы между экранами).
-- Ни пользователя, ни адресов с идентификаторами, ни параметров запроса: только шаблон маршрута и цифры.

create table if not exists public.web_vitals (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  name text not null check (name in ('TTFB', 'FCP', 'LCP', 'CLS', 'INP', 'route-shell', 'route-ready')),
  value double precision not null check (value >= 0 and value < 600000),
  rating text check (rating in ('good', 'needs-improvement', 'poor')),
  route text not null check (route ~ '^/[a-z0-9/:_-]{0,119}$'),
  nav text check (char_length(nav) <= 32),
  standalone boolean not null default false,
  width int check (width between 0 and 10000),
  conn text check (char_length(conn) <= 16)
);
create index if not exists web_vitals_created_idx on public.web_vitals(created_at desc);
create index if not exists web_vitals_route_idx on public.web_vitals(route, name, created_at desc);

alter table public.web_vitals enable row level security;
-- писать может любой активный сотрудник, читать — только тот, кто видит отчёты компании
create policy web_vitals_insert on public.web_vitals for insert to authenticated with check (public.is_active());
create policy web_vitals_read on public.web_vitals for select to authenticated using (public.has_perm('reports.view'));
revoke all on public.web_vitals from anon;

-- храним 30 дней
select cron.schedule('citadel-web-vitals-retention', '17 3 * * *', $$delete from public.web_vitals where created_at < now() - interval '30 days';$$);

-- p75 по маршрутам и метрикам; строки с route = '*' — итог по всем маршрутам (security invoker — читает только тот, кому разрешено политикой)
create or replace function public.web_vitals_summary(p_days int default 30)
returns table(route text, name text, n bigint, p75 double precision, poor_share double precision)
language sql stable security invoker set search_path = public as $$
  select coalesce(v.route, '*'), v.name, count(*),
         percentile_cont(0.75) within group (order by v.value),
         avg(case when v.rating = 'poor' then 1 else 0 end)::double precision
    from public.web_vitals v
   where v.created_at > now() - make_interval(days => greatest(1, least(p_days, 30)))
   group by grouping sets ((v.route, v.name), (v.name))
$$;
revoke execute on function public.web_vitals_summary(int) from public, anon;
grant execute on function public.web_vitals_summary(int) to authenticated;
