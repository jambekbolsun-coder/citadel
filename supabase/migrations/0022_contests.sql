-- 0022. Соревнования сотрудников: сезоны, учёт дней в приложении, баллы из реальных данных, итоги по кнопке владельца,
-- премии победителям — черновиками в «Зарплатах». Только добавления: новые таблицы, право и функции.
--
-- Баллы 0–100 — средневзвешенное долей (в % от плана), поэтому должности с разным объёмом сравнимы:
--   completion — сдано из того, что было назначено со сроком в сезоне (задачи, созданные себе самому, не считаются);
--   discipline — сдано вовремя из назначенного;   quality — 1 − доля возвратов на правки;
--   stories   — дни, когда дневной план сторис выполнен;   activity — дни в приложении из рабочих дней сезона.
-- Показатель без данных не участвует в среднем. В рейтинг попадает тот, у кого назначено ≥ min_items работ.

insert into public.permissions(code, name, module, sensitive) values
  ('contests.manage', 'Создавать сезоны соревнований и показывать итоги', 'Команда', false)
on conflict (code) do nothing;

-- ───────── дни в приложении (одна отметка в день, без деталей действий) ─────────
create table if not exists public.app_activity (
  user_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  first_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.app_activity enable row level security;
drop policy if exists app_activity_read on public.app_activity;
create policy app_activity_read on public.app_activity for select to authenticated
  using (user_id = auth.uid() or public.has_perm('contests.manage'));

create or replace function public.touch_activity()
returns void language sql security definer set search_path = public as $$
  insert into public.app_activity(user_id, day)
  select auth.uid(), (now() at time zone 'Asia/Bishkek')::date
   where auth.uid() is not null and public.is_active()
  on conflict do nothing;
$$;
revoke execute on function public.touch_activity() from public, anon;
grant execute on function public.touch_activity() to authenticated;

-- ───────── сезоны и зафиксированные итоги ─────────
create table if not exists public.contests (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 2 and 120),
  description text,
  starts_on date not null,
  ends_on date not null,
  scope text not null default 'all' check (scope in ('all', 'departments', 'roles')),
  scope_ids text[] not null default '{}',
  ranking text not null default 'overall' check (ranking in ('overall', 'by_department')),
  weights jsonb not null default '{"completion":35,"discipline":25,"quality":15,"stories":10,"activity":15}',
  min_items int not null default 3 check (min_items between 0 and 100),
  prizes jsonb not null default '[]', -- [{place:1, amount_minor:..., text:"..."}]
  status text not null default 'active' check (status in ('active', 'revealed', 'cancelled')),
  revealed_at timestamptz, revealed_by uuid references public.profiles(id),
  bonuses_issued_at timestamptz, bonuses_issued_by uuid references public.profiles(id),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);
create table if not exists public.contest_results (
  contest_id uuid not null references public.contests(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  group_key text not null,
  group_label text,
  score numeric(5,1) not null,
  place int,
  eligible boolean not null,
  metrics jsonb not null,
  primary key (contest_id, user_id)
);
alter table public.contests enable row level security;
alter table public.contest_results enable row level security;
drop policy if exists contests_read on public.contests;
create policy contests_read on public.contests for select to authenticated using (public.is_active());
drop policy if exists contest_results_read on public.contest_results;
create policy contest_results_read on public.contest_results for select to authenticated using (
  public.has_perm('contests.manage')
  or (public.is_active() and exists (select 1 from public.contests c where c.id = contest_id and c.status = 'revealed')));

-- ───────── расчёт баллов (внутренняя функция, наружу — через обёртки с проверкой прав) ─────────
create or replace function public.contest_compute(p_contest uuid)
returns table (user_id uuid, full_name text, group_key text, group_label text, score numeric, eligible boolean, metrics jsonb)
language plpgsql stable security definer set search_path = public as $$
declare c public.contests; t_from timestamptz; t_to timestamptz; d_to date; wd int[]; work_days int;
begin
  select * into c from public.contests where id = p_contest;
  if not found then raise exception 'Сезон не найден'; end if;
  t_from := (c.starts_on::timestamp at time zone 'Asia/Bishkek');
  t_to := least(now(), ((c.ends_on + 1)::timestamp at time zone 'Asia/Bishkek'));
  d_to := least((now() at time zone 'Asia/Bishkek')::date, c.ends_on);
  wd := coalesce((select array_agg(x::int) from jsonb_array_elements_text((select value::jsonb from public.app_settings where key = 'work_days')) x), '{1,2,3,4,5}');
  select count(*) into work_days from generate_series(c.starts_on, d_to, interval '1 day') g where extract(isodow from g)::int = any(wd);

  return query
  with people as (
    select p.id, p.full_name, p.department_id from public.profiles p
     where p.status = 'active' and not public.is_owner(p.id)
       and (c.scope = 'all'
         or (c.scope = 'departments' and p.department_id::text = any(c.scope_ids))
         or (c.scope = 'roles' and exists (select 1 from public.user_roles ur where ur.user_id = p.id and ur.role_code = any(c.scope_ids))))
  ), tk as (
    select pe.id uid, count(*) due,
           count(*) filter (where t.status = 'done') fin,
           count(*) filter (where t.status = 'done' and t.completed_at <= t.due_at) ontime
      from people pe join public.tasks t on t.assignee_id = pe.id
     where t.status <> 'cancelled' and t.created_by is distinct from pe.id and t.due_at >= t_from and t.due_at < t_to
     group by pe.id
  ), ct as (
    select pe.id uid, count(*) due,
           count(*) filter (where coalesce(ci.submitted_at, ci.prepared_at) is not null) fin,
           count(*) filter (where coalesce(ci.submitted_at, ci.prepared_at) <= ci.prep_due) ontime
      from people pe join public.content_items ci on ci.assignee_id = pe.id
     where ci.status <> 'cancelled' and ci.prep_due >= t_from and ci.prep_due < t_to
     group by pe.id
  ), qh as (
    select pe.id uid, count(*) filter (where h.to_status = 'review') subm, count(*) filter (where h.to_status = 'revision') rev
      from people pe join public.content_items ci on ci.assignee_id = pe.id
      join public.content_history h on h.content_id = ci.id
     where h.created_at >= t_from and h.created_at < t_to and h.to_status in ('review', 'revision')
     group by pe.id
  ), st as (
    select pe.id uid, count(*) days, count(*) filter (where s.actual >= s.planned) ok
      from people pe join public.story_daily_plans s on s.assignee_id = pe.id
     where s.planned > 0 and s.day >= c.starts_on and s.day <= d_to
     group by pe.id
  ), ac as (
    select pe.id uid, count(*) days from people pe join public.app_activity a on a.user_id = pe.id
     where a.day >= c.starts_on and a.day <= d_to and extract(isodow from a.day)::int = any(wd)
     group by pe.id
  ), m as (
    select pe.id, pe.full_name, pe.department_id,
           coalesce(tk.due, 0) + coalesce(ct.due, 0) due,
           coalesce(tk.fin, 0) + coalesce(ct.fin, 0) fin,
           coalesce(tk.ontime, 0) + coalesce(ct.ontime, 0) ontime,
           coalesce(qh.subm, 0) subm, coalesce(qh.rev, 0) rev,
           coalesce(st.days, 0) sdays, coalesce(st.ok, 0) sok,
           coalesce(ac.days, 0) adays
      from people pe left join tk on tk.uid = pe.id left join ct on ct.uid = pe.id left join qh on qh.uid = pe.id
      left join st on st.uid = pe.id left join ac on ac.uid = pe.id
  ), r as (
    select m.*,
      case when due > 0 then fin::numeric / due end r_completion,
      case when due > 0 then ontime::numeric / due end r_discipline,
      case when subm > 0 then greatest(0, 1 - rev::numeric / subm) end r_quality,
      case when sdays > 0 then sok::numeric / sdays end r_stories,
      case when work_days > 0 then least(1, adays::numeric / work_days) end r_activity
    from m
  ), w as (
    select r.*,
      coalesce((c.weights->>'completion')::numeric, 0) w1, coalesce((c.weights->>'discipline')::numeric, 0) w2,
      coalesce((c.weights->>'quality')::numeric, 0) w3, coalesce((c.weights->>'stories')::numeric, 0) w4,
      coalesce((c.weights->>'activity')::numeric, 0) w5
    from r
  )
  select w.id, w.full_name,
    case when c.ranking = 'by_department' then coalesce(w.department_id::text, 'none') else 'all' end,
    case when c.ranking = 'by_department' then coalesce((select d.name from public.departments d where d.id = w.department_id), 'Без отдела') else 'Все участники' end,
    round(100 * coalesce(
      (coalesce(w.w1 * w.r_completion, 0) + coalesce(w.w2 * w.r_discipline, 0) + coalesce(w.w3 * w.r_quality, 0) + coalesce(w.w4 * w.r_stories, 0) + coalesce(w.w5 * w.r_activity, 0))
      / nullif((case when w.r_completion is not null then w.w1 else 0 end) + (case when w.r_discipline is not null then w.w2 else 0 end)
             + (case when w.r_quality is not null then w.w3 else 0 end) + (case when w.r_stories is not null then w.w4 else 0 end)
             + (case when w.r_activity is not null then w.w5 else 0 end), 0), 0), 1),
    w.due >= c.min_items,
    jsonb_build_object('due', w.due, 'finished', w.fin, 'on_time', w.ontime, 'submissions', w.subm, 'revisions', w.rev,
      'story_days', w.sdays, 'story_ok', w.sok, 'active_days', w.adays, 'work_days', work_days,
      'completion', round(coalesce(w.r_completion, -1) * 100), 'discipline', round(coalesce(w.r_discipline, -1) * 100),
      'quality', round(coalesce(w.r_quality, -1) * 100), 'stories', round(coalesce(w.r_stories, -1) * 100), 'activity', round(coalesce(w.r_activity, -1) * 100))
  from w;
end $$;
revoke execute on function public.contest_compute(uuid) from public, anon, authenticated;

-- Места внутри группы: баллы ↓, сдано ↓, вовремя ↓ (ничья по всем трём — одинаковое место)
create or replace function public.contest_ranked(p_contest uuid)
returns table (user_id uuid, full_name text, group_key text, group_label text, score numeric, eligible boolean, place int, metrics jsonb)
language sql stable security definer set search_path = public as $$
  select x.user_id, x.full_name, x.group_key, x.group_label, x.score, x.eligible,
         case when x.eligible then (rank() over (partition by x.group_key, x.eligible order by x.score desc, (x.metrics->>'finished')::int desc, (x.metrics->>'on_time')::int desc))::int end,
         x.metrics
    from public.contest_compute(p_contest) x;
$$;
revoke execute on function public.contest_ranked(uuid) from public, anon, authenticated;

-- Живой рейтинг — только владельцу/с правом contests.manage
create or replace function public.contest_leaderboard(p_contest uuid)
returns table (user_id uuid, full_name text, group_key text, group_label text, score numeric, eligible boolean, place int, metrics jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_perm('contests.manage') then raise exception 'Рейтинг до итогов видит только владелец'; end if;
  return query select * from public.contest_ranked(p_contest) order by 3, 7 nulls last, 5 desc;
end $$;
revoke execute on function public.contest_leaderboard(uuid) from public, anon;
grant execute on function public.contest_leaderboard(uuid) to authenticated;

-- Свои баллы во время сезона (без места и без чужих результатов)
create or replace function public.my_contest_score(p_contest uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare x record;
begin
  if not public.is_active() then return null; end if;
  select * into x from public.contest_compute(p_contest) where user_id = auth.uid();
  if not found then return null; end if;
  return jsonb_build_object('score', x.score, 'eligible', x.eligible, 'metrics', x.metrics, 'group_label', x.group_label);
end $$;
revoke execute on function public.my_contest_score(uuid) from public, anon;
grant execute on function public.my_contest_score(uuid) to authenticated;

-- Создать/изменить сезон
create or replace function public.contest_save(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid := nullif(p->>'id', '')::uuid; v_w jsonb := '{}'; k text; v_prizes jsonb := '[]'; pr jsonb; r2 record;
begin
  if not public.has_perm('contests.manage') then raise exception 'Нет права contests.manage'; end if;
  foreach k in array array['completion', 'discipline', 'quality', 'stories', 'activity'] loop
    v_w := v_w || jsonb_build_object(k, greatest(0, least(100, coalesce((p->'weights'->>k)::int, 0))));
  end loop;
  if (select sum(value::int) from jsonb_each_text(v_w)) = 0 then raise exception 'Задайте вес хотя бы одному показателю'; end if;
  for pr in select * from jsonb_array_elements(coalesce(p->'prizes', '[]')) loop
    if (pr->>'place')::int between 1 and 3 and (coalesce((pr->>'amount_minor')::bigint, 0) > 0 or coalesce(btrim(pr->>'text'), '') <> '') then
      if coalesce((pr->>'amount_minor')::bigint, 0) < 0 then raise exception 'Сумма премии не может быть отрицательной'; end if;
      v_prizes := v_prizes || jsonb_build_array(jsonb_build_object('place', (pr->>'place')::int,
        'amount_minor', coalesce((pr->>'amount_minor')::bigint, 0), 'text', left(btrim(coalesce(pr->>'text', '')), 120)));
    end if;
  end loop;
  if v_id is null then
    insert into public.contests(title, description, starts_on, ends_on, scope, scope_ids, ranking, weights, min_items, prizes, created_by)
    values (btrim(p->>'title'), nullif(btrim(p->>'description'), ''), (p->>'starts_on')::date, (p->>'ends_on')::date,
      coalesce(nullif(p->>'scope', ''), 'all'), coalesce((select array_agg(x) from jsonb_array_elements_text(p->'scope_ids') x), '{}'),
      coalesce(nullif(p->>'ranking', ''), 'overall'), v_w, coalesce((p->>'min_items')::int, 3), v_prizes, auth.uid())
    returning id into v_id;
    for r2 in select id from public.profiles where status = 'active' and id is distinct from auth.uid() loop
      perform public.notify_user(r2.id, 'contest.started', 'Новый сезон соревнования', btrim(p->>'title') || ' — до ' || to_char((p->>'ends_on')::date, 'DD.MM'), 'contest', v_id::text, 'normal', 'cs:' || v_id || ':' || r2.id);
    end loop;
  else
    update public.contests set title = btrim(p->>'title'), description = nullif(btrim(p->>'description'), ''),
      starts_on = (p->>'starts_on')::date, ends_on = (p->>'ends_on')::date, scope = coalesce(nullif(p->>'scope', ''), 'all'),
      scope_ids = coalesce((select array_agg(x) from jsonb_array_elements_text(p->'scope_ids') x), '{}'),
      ranking = coalesce(nullif(p->>'ranking', ''), 'overall'), weights = v_w, min_items = coalesce((p->>'min_items')::int, 3), prizes = v_prizes
     where id = v_id and status = 'active';
    if not found then raise exception 'Сезон уже завершён — изменить нельзя'; end if;
  end if;
  perform public.audit('contest.save', 'contest', v_id::text, p - 'description');
  return v_id;
end $$;
revoke execute on function public.contest_save(jsonb) from public, anon;
grant execute on function public.contest_save(jsonb) to authenticated;

create or replace function public.contest_cancel(p_contest uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('contests.manage') then raise exception 'Нет права contests.manage'; end if;
  update public.contests set status = 'cancelled' where id = p_contest and status = 'active';
  if not found then raise exception 'Отменить можно только идущий сезон'; end if;
  perform public.audit('contest.cancel', 'contest', p_contest::text, null);
end $$;
revoke execute on function public.contest_cancel(uuid) from public, anon;
grant execute on function public.contest_cancel(uuid) to authenticated;

-- «Показать результаты»: только после окончания сезона; баллы фиксируются, всем участникам — уведомление
create or replace function public.contest_reveal(p_contest uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.contests; n int; r record;
begin
  if not public.has_perm('contests.manage') then raise exception 'Нет права contests.manage'; end if;
  select * into c from public.contests where id = p_contest for update;
  if not found then raise exception 'Сезон не найден'; end if;
  if c.status = 'revealed' then return jsonb_build_object('already', true); end if;
  if c.status <> 'active' then raise exception 'Сезон отменён'; end if;
  if (now() at time zone 'Asia/Bishkek')::date <= c.ends_on then raise exception 'Сезон ещё идёт — итоги можно показать после %', to_char(c.ends_on, 'DD.MM.YYYY'); end if;
  insert into public.contest_results(contest_id, user_id, group_key, group_label, score, place, eligible, metrics)
  select p_contest, x.user_id, x.group_key, x.group_label, x.score, x.place, x.eligible, x.metrics from public.contest_ranked(p_contest) x;
  get diagnostics n = row_count;
  update public.contests set status = 'revealed', revealed_at = now(), revealed_by = auth.uid() where id = p_contest;
  for r in select user_id, place from public.contest_results where contest_id = p_contest loop
    perform public.notify_user(r.user_id, 'contest.results', 'Итоги соревнования: ' || c.title,
      case when r.place between 1 and 3 then 'Поздравляем: ' || r.place || '-е место! Откройте церемонию.' else 'Результаты открыты — посмотрите, кто победил.' end,
      'contest', p_contest::text, case when r.place between 1 and 3 then 'high' else 'normal' end, 'cr:' || p_contest || ':' || r.user_id);
  end loop;
  perform public.audit('contest.reveal', 'contest', p_contest::text, jsonb_build_object('participants', n));
  return jsonb_build_object('participants', n);
end $$;
revoke execute on function public.contest_reveal(uuid) from public, anon;
grant execute on function public.contest_reveal(uuid) to authenticated;

-- «Начислить премии»: черновик премии за месяц окончания сезона (утверждение — как обычно), один раз на сезон
create or replace function public.contest_issue_bonuses(p_contest uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.contests; r record; amt bigint; m date; a public.payroll_accruals; done int := 0; skipped jsonb := '[]'; why text;
begin
  if not public.has_perm('payroll.manage') then raise exception 'Начислять премии может сотрудник с правом payroll.manage'; end if;
  select * into c from public.contests where id = p_contest for update;
  if not found or c.status <> 'revealed' then raise exception 'Сначала покажите итоги сезона'; end if;
  if c.bonuses_issued_at is not null then raise exception 'Премии по этому сезону уже начислены'; end if;
  m := date_trunc('month', c.ends_on)::date;
  for r in select cr.user_id, cr.place, p.full_name from public.contest_results cr join public.profiles p on p.id = cr.user_id
            where cr.contest_id = p_contest and cr.place between 1 and 3 order by cr.place loop
    amt := coalesce((select (x->>'amount_minor')::bigint from jsonb_array_elements(c.prizes) x where (x->>'place')::int = r.place limit 1), 0);
    if amt <= 0 then continue; end if;
    why := 'Премия: ' || c.title || ', ' || r.place || '-е место';
    select * into a from public.payroll_accruals where user_id = r.user_id and period_month = m;
    if found and a.currency <> 'KGS' then
      skipped := skipped || jsonb_build_object('name', r.full_name, 'reason', 'начисление в ' || a.currency); continue;
    end if;
    if not found then
      insert into public.payroll_accruals(user_id, period_month, bonus_minor, currency, note, created_by)
      values (r.user_id, m, amt, 'KGS', why, auth.uid());
    elsif a.status = 'draft' then
      update public.payroll_accruals set bonus_minor = bonus_minor + amt, note = concat_ws('; ', nullif(note, ''), why) where id = a.id;
    else
      insert into public.payroll_adjustments(accrual_id, amount_minor, reason, created_by) values (a.id, amt, why, auth.uid());
    end if;
    done := done + 1;
  end loop;
  update public.contests set bonuses_issued_at = now(), bonuses_issued_by = auth.uid() where id = p_contest;
  perform public.audit('contest.bonuses', 'contest', p_contest::text, jsonb_build_object('count', done, 'skipped', skipped));
  return jsonb_build_object('count', done, 'skipped', skipped);
end $$;
revoke execute on function public.contest_issue_bonuses(uuid) from public, anon;
grant execute on function public.contest_issue_bonuses(uuid) to authenticated;
