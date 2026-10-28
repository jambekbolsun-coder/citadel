-- Цитадель · 0003 · проекты, договоры, периоды, план, контент, задачи, съёмки, сторис, публикации, реклама, проверки

create type public.project_status as enum ('draft','on_approval','awaiting_payment','ready_for_handoff','in_progress',
  'awaiting_client','final_review','work_completed','closed','paused','cancelled');
create type public.project_kind as enum ('one_time','monthly','yearly','custom','one_time_shoot');

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity,
  name text not null,
  client_id uuid not null references public.clients(id),
  lead_id uuid references public.leads(id),
  kind public.project_kind not null,
  status public.project_status not null default 'draft',
  tariff_version_id uuid references public.tariff_versions(id),
  contract_start date,
  contract_end date,
  work_start date,
  renewal_date date,
  platforms text[] not null default '{instagram}',
  revisions_allowed int,
  approval_flow text,
  wishes text,
  references_text text,
  socials jsonb not null default '{}',
  stories_method text check (stories_method in ('fixed_per_period','four_each_calendar_day')),
  requires_publication boolean not null default true,
  admin_id uuid references public.profiles(id),
  manager_id uuid references public.profiles(id),
  planning_director_id uuid references public.profiles(id),
  creative_director_id uuid references public.profiles(id),
  handoff jsonb not null default '{}', -- чек-лист передачи
  launch_override_reason text,
  launched_at timestamptz,
  launched_by uuid references public.profiles(id),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create index projects_status_idx on public.projects(status);
create trigger projects_touch before update on public.projects for each row execute function public.touch_updated_at();

create table public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  role text not null default 'member',
  added_at timestamptz not null default now(),
  primary key (project_id, user_id, role)
);
create index project_members_user_idx on public.project_members(user_id);

-- Коммерческие условия: отдельная таблица, видна только с prices.view / finance.view
create table public.project_contracts (
  project_id uuid primary key references public.projects(id) on delete cascade,
  price_minor bigint not null check (price_minor >= 0),
  currency text not null default 'KGS',
  tariff_snapshot jsonb,
  composition jsonb not null default '{}', -- договорный объём на период
  extra_services text,
  payment_terms text,
  updated_at timestamptz not null default now()
);

create table public.project_amendments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  reason text not null,
  before jsonb, after jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.project_status_history (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  from_status public.project_status, to_status public.project_status not null,
  reason text, actor_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.project_periods (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  seq int not null,
  label text not null,
  starts_on date not null,
  ends_on date not null,
  status text not null default 'open' check (status in ('open','closed','closed_with_debt')),
  plan_status text not null default 'none' check (plan_status in ('none','draft','approved')),
  closed_at timestamptz, closed_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (project_id, seq),
  check (ends_on >= starts_on)
);

create type public.content_kind as enum ('video','story','post','carousel','ad_creative','shoot','other');
create table public.plan_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  period_id uuid not null references public.project_periods(id) on delete cascade,
  kind public.content_kind not null,
  planned_qty int not null check (planned_qty >= 0),
  note text,
  unique (period_id, kind)
);

-- ───────────── контент (единицы материала) ─────────────
create type public.content_status as enum ('planned','in_progress','ready_to_shoot','shot','processing','editing','design',
  'review','revision','done','published','blocked','paused','cancelled');
create table public.content_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  period_id uuid not null references public.project_periods(id) on delete cascade,
  plan_item_id uuid references public.plan_items(id) on delete set null,
  occurrence_key text,
  kind public.content_kind not null,
  title text not null,
  goal text,
  format text,
  brief text,             -- ТЗ, обязательно до назначения исполнителя
  script text,
  links text,
  slides jsonb,           -- спецификация слайдов карусели
  status public.content_status not null default 'planned',
  assignee_id uuid references public.profiles(id),
  reviewer_id uuid references public.profiles(id),
  prep_due timestamptz,
  review_due timestamptz,
  publish_due timestamptz,
  submitted_at timestamptz,
  prepared_at timestamptz,
  approved_at timestamptz,
  result_url text,
  version int not null default 1,
  blocked_reason text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_item_id, occurrence_key)
);
create index content_items_period_idx on public.content_items(period_id, kind);
create index content_items_assignee_idx on public.content_items(assignee_id, status);
create index content_items_due_idx on public.content_items(publish_due);
create trigger content_touch before update on public.content_items for each row execute function public.touch_updated_at();

create table public.content_history (
  id bigint generated always as identity primary key,
  content_id uuid not null references public.content_items(id) on delete cascade,
  from_status public.content_status, to_status public.content_status,
  actor_id uuid references public.profiles(id),
  note text, data jsonb,
  created_at timestamptz not null default now()
);

create table public.placements (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.content_items(id) on delete cascade,
  platform text not null,
  url text not null,
  published_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  checked_by uuid references public.profiles(id),
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (content_id, platform, url)
);

-- Сторис: дневной план/факт по кадрам
create table public.story_daily_plans (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  period_id uuid not null references public.project_periods(id) on delete cascade,
  day date not null,
  planned int not null default 0 check (planned >= 0),
  actual int not null default 0 check (actual >= 0),
  assignee_id uuid references public.profiles(id),
  confirmed_by uuid references public.profiles(id),
  confirmed_at timestamptz,
  shortfall_reason text,
  updated_at timestamptz not null default now(),
  unique (period_id, day)
);

-- ───────────── задачи ─────────────
create type public.task_status as enum ('todo','in_progress','review','revision','done','blocked','cancelled');
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  content_id uuid references public.content_items(id) on delete cascade,
  title text not null,
  description text,
  type text not null default 'general',
  status public.task_status not null default 'todo',
  priority text not null default 'normal' check (priority in ('low','normal','high','critical')),
  assignee_id uuid references public.profiles(id),
  reviewer_id uuid references public.profiles(id),
  starts_at timestamptz,
  due_at timestamptz,
  original_due_at timestamptz,
  completed_at timestamptz,
  result_url text,
  result_note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tasks_assignee_idx on public.tasks(assignee_id, status, due_at);
create index tasks_project_idx on public.tasks(project_id);
create trigger tasks_touch before update on public.tasks for each row execute function public.touch_updated_at();

create table public.task_history (
  id bigint generated always as identity primary key,
  task_id uuid not null references public.tasks(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  kind text not null, data jsonb,
  created_at timestamptz not null default now()
);

-- ───────────── съёмки ─────────────
create table public.shoots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  period_id uuid references public.project_periods(id),
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'Asia/Bishkek',
  location text,
  lat numeric, lng numeric,
  planned_items int,
  topics text,
  notes text,
  equipment text,
  ambassador_needed boolean not null default true,
  status text not null default 'planned' check (status in ('planned','done','cancelled')),
  actual_start timestamptz, actual_end timestamptz,
  sources_url text,
  cancel_reason text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index shoots_time_idx on public.shoots(starts_at);
create trigger shoots_touch before update on public.shoots for each row execute function public.touch_updated_at();

create table public.shoot_participants (
  shoot_id uuid not null references public.shoots(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  role text not null check (role in ('mobilographer','ambassador','creative','other')),
  response text not null default 'pending' check (response in ('pending','accepted','declined')),
  responded_at timestamptz,
  decline_reason text,
  primary key (shoot_id, user_id)
);
create table public.shoot_history (
  id bigint generated always as identity primary key,
  shoot_id uuid not null references public.shoots(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  kind text not null, data jsonb,
  created_at timestamptz not null default now()
);

-- ───────────── реклама ─────────────
create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  platform text not null default 'meta',
  goal text,
  target_leads int,
  ad_account_id text,
  pixel text,
  starts_on date, ends_on date,
  budget_minor bigint not null default 0,
  currency text not null default 'USD',
  owner_id uuid references public.profiles(id),
  status text not null default 'draft' check (status in ('draft','active','paused','finished')),
  check_every_days int not null default 2,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create table public.campaign_metrics (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  day date not null,
  spend_minor bigint not null default 0,
  leads int not null default 0,
  impressions int, clicks int,
  source text not null default 'manual',
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (campaign_id, day)
);

-- Секреты проекта: значение хранится в Supabase Vault, здесь только ссылка
create table public.project_secrets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  label text not null,
  platform text,
  login_hint text,
  vault_secret_id uuid not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create table public.secret_access_log (
  id bigint generated always as identity primary key,
  secret_id uuid not null references public.project_secrets(id) on delete cascade,
  actor_id uuid not null,
  created_at timestamptz not null default now()
);

-- ───────────── ежедневные проверки администратора ─────────────
create table public.project_admin_checks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  admin_id uuid not null references public.profiles(id),
  day date not null,
  due_at timestamptz not null,
  summary text,
  stories_note text,
  delays text,
  contacts jsonb not null default '[]', -- [{with, channel, at, reason, result, promise, next}]
  escalated boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (project_id, day)
);

-- Личные события календаря: смены, отпуска, занятость
create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('shift','time_off','busy','report','other')),
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- Нормативы ёмкости (редактируемые, без выдуманных значений по умолчанию)
create table public.capacity_rules (
  key text primary key,
  label text not null,
  value numeric,
  unit text not null,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

-- Файлы
create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  project_id uuid references public.projects(id) on delete cascade,
  bucket text not null,
  path text not null,
  name text not null,
  size bigint,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index attachments_entity_idx on public.attachments(entity_type, entity_id);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  project_id uuid references public.projects(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  body text not null,
  created_at timestamptz not null default now()
);
create index comments_entity_idx on public.comments(entity_type, entity_id, created_at);

-- ───────────── доступ к проектам ─────────────
create or replace function public.is_project_member(p_project uuid, uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_active(uid) and exists (
    select 1 from public.projects p where p.id = p_project and uid in (p.admin_id, p.manager_id, p.planning_director_id, p.creative_director_id)
    union all select 1 from public.project_members m where m.project_id = p_project and m.user_id = uid);
$$;
create or replace function public.can_view_project(p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_perm('projects.view_all') or public.is_project_member(p_project);
$$;
create or replace function public.can_manage_project(p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_perm('projects.manage') or exists (
    select 1 from public.projects p where p.id = p_project and auth.uid() in (p.admin_id, p.manager_id) and public.is_active());
$$;

-- ───────────── статусы проекта ─────────────
create or replace function public.project_set_status(p_project uuid, p_to public.project_status, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare p public.projects; ok boolean;
begin
  select * into p from public.projects where id = p_project for update;
  if not found then raise exception 'Проект не найден'; end if;
  if not public.can_manage_project(p_project) then raise exception 'Нет прав на проект'; end if;
  if p_to = 'in_progress' and p.launched_at is null then raise exception 'Запуск — только через допуск (launch_project)'; end if;
  ok := case p.status
    when 'draft' then p_to in ('on_approval','awaiting_payment','cancelled')
    when 'on_approval' then p_to in ('draft','awaiting_payment','cancelled')
    when 'awaiting_payment' then p_to in ('ready_for_handoff','on_approval','cancelled')
    when 'ready_for_handoff' then p_to in ('awaiting_payment','cancelled')
    when 'in_progress' then p_to in ('awaiting_client','final_review','paused','cancelled')
    when 'awaiting_client' then p_to in ('in_progress','paused','cancelled')
    when 'final_review' then p_to in ('in_progress','work_completed')
    when 'work_completed' then p_to in ('closed','in_progress')
    when 'paused' then p_to in ('in_progress','cancelled')
    else false end;
  if not ok then raise exception 'Недопустимый переход статуса: % → %', p.status, p_to; end if;
  if p_to in ('cancelled','paused','closed','in_progress') and p.status in ('paused','in_progress','work_completed','awaiting_client') and coalesce(trim(p_reason),'') = '' then
    raise exception 'Укажите причину перехода'; end if;
  update public.projects set status = p_to where id = p_project;
  insert into public.project_status_history(project_id, from_status, to_status, reason, actor_id) values (p_project, p.status, p_to, p_reason, auth.uid());
  perform public.audit('project.status', 'project', p_project::text, jsonb_build_object('from', p.status, 'to', p_to, 'reason', p_reason));
end $$;

-- ───────────── генерация периодов ─────────────
create or replace function public.create_period(p_project uuid, p_start date, p_months int default 1)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_seq int; v_id uuid; c jsonb; k text; v_end date; pr public.projects;
begin
  select * into pr from public.projects where id = p_project;
  if not public.can_manage_project(p_project) and auth.uid() is not null then raise exception 'Нет прав'; end if;
  select coalesce(max(seq),0)+1 into v_seq from public.project_periods where project_id = p_project;
  v_end := case when pr.kind in ('one_time','one_time_shoot') then coalesce(pr.contract_end, p_start + 30)
                else (p_start + make_interval(months => greatest(p_months,1)))::date - 1 end;
  insert into public.project_periods(project_id, seq, label, starts_on, ends_on)
  values (p_project, v_seq, to_char(p_start, 'DD.MM.YYYY') || ' — ' || to_char(v_end, 'DD.MM.YYYY'), p_start, v_end)
  returning id into v_id;
  select composition into c from public.project_contracts where project_id = p_project;
  for k in select jsonb_object_keys(coalesce(c, '{}')) loop
    if k in ('video','story','post','carousel','ad_creative','shoot') and coalesce((c->>k)::int,0) > 0 then
      insert into public.plan_items(project_id, period_id, kind, planned_qty)
      values (p_project, v_id, k::public.content_kind,
        case when k = 'story' and pr.stories_method = 'four_each_calendar_day' then 4 * ((v_end - p_start) + 1)
             else (c->>k)::int end);
    end if;
  end loop;
  return v_id;
end $$;

-- ───────────── допуск проекта (платёжный гейт) ─────────────
-- project_paid_status() определена в 0004_finance.sql
create or replace function public.launch_project(p_project uuid, p_override_reason text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare p public.projects; s jsonb; v_price bigint; v_paid bigint; v_period uuid; h jsonb; missing text[] := '{}';
begin
  select * into p from public.projects where id = p_project for update;
  if not found then raise exception 'Проект не найден'; end if;
  if not public.can_manage_project(p_project) then raise exception 'Нет прав на проект'; end if;
  if p.launched_at is not null then raise exception 'Проект уже запущен'; end if;
  if p.status in ('cancelled','closed') then raise exception 'Проект закрыт или отменён'; end if;
  if p.admin_id is null then raise exception 'Не назначен администратор проекта'; end if;
  s := public.project_paid_status(p_project);
  v_price := coalesce((s->>'price')::bigint, 0); v_paid := (s->>'paid')::bigint;
  h := p.handoff;
  if coalesce((h->>'client')::boolean,false) is not true then missing := missing || 'клиент'; end if;
  if coalesce((h->>'package')::boolean,false) is not true then missing := missing || 'пакет и объём'; end if;
  if coalesce((h->>'dates')::boolean,false) is not true then missing := missing || 'даты'; end if;
  if coalesce((h->>'wishes')::boolean,false) is not true then missing := missing || 'пожелания'; end if;
  if coalesce((h->>'admin_accepted')::boolean,false) is not true then missing := missing || 'принятие администратором'; end if;
  if v_price <= 0 or v_paid < v_price then missing := missing || ('оплата ' || (v_paid/100) || ' из ' || (v_price/100)); end if;
  if array_length(missing,1) > 0 then
    if coalesce(trim(p_override_reason),'') = '' or not public.has_perm('projects.launch_override') then
      raise exception 'Допуск невозможен: %', array_to_string(missing, ', ');
    end if;
  end if;
  update public.projects set launched_at = now(), launched_by = auth.uid(), status = 'in_progress',
     launch_override_reason = case when array_length(missing,1) > 0 then p_override_reason end,
     work_start = coalesce(work_start, current_date)
   where id = p_project;
  insert into public.project_status_history(project_id, from_status, to_status, reason, actor_id)
  values (p_project, p.status, 'in_progress', coalesce(p_override_reason, 'допуск: оплата 100% и чек-лист'), auth.uid());
  perform public.audit(case when array_length(missing,1) > 0 then 'project.launch_override' else 'project.launch' end,
     'project', p_project::text, jsonb_build_object('missing', missing, 'reason', p_override_reason));
  select id into v_period from public.project_periods where project_id = p_project order by seq limit 1;
  if v_period is null then
    v_period := public.create_period(p_project, coalesce(p.work_start, current_date), 1);
  end if;
  perform public.notify_user(p.admin_id, 'project.launched', 'Проект запущен', p.name, 'project', p_project::text, 'high', 'launch:' || p_project);
  return v_period;
end $$;

-- ───────────── формирование плана периода (черновик) ─────────────
-- Распределяет единицы контента по рабочим дням периода; повторный запуск не плодит дубли
create or replace function public.generate_period_plan(p_period uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare per public.project_periods; pi record; days date[]; n int; i int; d date; created int := 0; v_wd int[];
  story_total int; per_day int; rem int; idx int;
begin
  select * into per from public.project_periods where id = p_period;
  if not found then raise exception 'Период не найден'; end if;
  if not public.can_manage_project(per.project_id) and not public.has_perm('content.plan') then raise exception 'Нет прав'; end if;
  if per.status <> 'open' then raise exception 'Период закрыт'; end if;
  if per.plan_status = 'approved' then raise exception 'План уже утверждён; изменения — через поправку'; end if;
  if (select launched_at from public.projects where id = per.project_id) is null then raise exception 'Проект не допущен к производству'; end if;
  v_wd := coalesce((select array_agg(x::int) from jsonb_array_elements_text(
            (select value::jsonb from public.app_settings where key = 'work_days')) x), '{1,2,3,4,5}');
  select array_agg(g::date order by g) into days from generate_series(greatest(per.starts_on, current_date), per.ends_on, interval '1 day') g
   where extract(isodow from g)::int = any(v_wd);
  if days is null then raise exception 'В периоде нет рабочих дней'; end if;
  for pi in select * from public.plan_items where period_id = p_period and kind not in ('story','shoot') loop
    n := pi.planned_qty;
    for i in 1..n loop
      idx := least(array_length(days,1), greatest(1, ceil(i::numeric * array_length(days,1) / n)::int));
      d := days[idx];
      insert into public.content_items(project_id, period_id, plan_item_id, occurrence_key, kind, title, publish_due, prep_due, created_by)
      values (per.project_id, p_period, pi.id, i::text, pi.kind,
        case pi.kind when 'video' then 'Видео' when 'post' then 'Пост' when 'carousel' then 'Карусель'
             when 'ad_creative' then 'Рекламный креатив' else 'Материал' end || ' #' || i,
        (d + time '18:00') at time zone 'Asia/Bishkek', ((d - 1) + time '18:00') at time zone 'Asia/Bishkek', auth.uid())
      on conflict (plan_item_id, occurrence_key) do nothing;
      if found then created := created + 1; end if;
    end loop;
  end loop;
  -- сторис по выбранному договорному методу
  select planned_qty into story_total from public.plan_items where period_id = p_period and kind = 'story';
  if coalesce(story_total,0) > 0 then
    n := (per.ends_on - per.starts_on) + 1;
    if (select stories_method from public.projects where id = per.project_id) = 'four_each_calendar_day' then
      insert into public.story_daily_plans(project_id, period_id, day, planned)
      select per.project_id, p_period, g::date, 4 from generate_series(per.starts_on, per.ends_on, interval '1 day') g
      on conflict (period_id, day) do nothing;
    else
      per_day := story_total / n; rem := story_total % n;
      insert into public.story_daily_plans(project_id, period_id, day, planned)
      select per.project_id, p_period, (per.starts_on + s)::date, per_day + case when s < rem then 1 else 0 end
        from generate_series(0, n - 1) s
      on conflict (period_id, day) do nothing;
    end if;
  end if;
  update public.project_periods set plan_status = 'draft' where id = p_period;
  perform public.audit('plan.generate', 'period', p_period::text, jsonb_build_object('created', created));
  return jsonb_build_object('created', created, 'working_days', array_length(days,1));
end $$;

create or replace function public.approve_period_plan(p_period uuid)
returns void language plpgsql security definer set search_path = public as $$
declare per public.project_periods; r record;
begin
  select * into per from public.project_periods where id = p_period;
  if not public.can_manage_project(per.project_id) and not public.has_perm('content.plan') then raise exception 'Нет прав'; end if;
  if per.plan_status <> 'draft' then raise exception 'Нет черновика плана'; end if;
  update public.project_periods set plan_status = 'approved' where id = p_period;
  perform public.audit('plan.approve', 'period', p_period::text, null);
  for r in select distinct assignee_id from public.content_items where period_id = p_period and assignee_id is not null loop
    perform public.notify_user(r.assignee_id, 'plan.approved', 'Утверждён план периода', per.label, 'period', p_period::text, 'normal', 'plan:' || p_period || ':' || r.assignee_id);
  end loop;
end $$;

-- ───────────── state machine контента ─────────────
create or replace function public.content_transition(p_id uuid, p_to public.content_status, p_note text default null, p_result_url text default null)
returns void language plpgsql security definer set search_path = public as $$
declare c public.content_items; ok boolean; is_mgr boolean; is_exec boolean; is_rev boolean;
begin
  select * into c from public.content_items where id = p_id for update;
  if not found then raise exception 'Материал не найден'; end if;
  is_mgr := public.can_manage_project(c.project_id) or public.has_perm('content.manage');
  is_exec := c.assignee_id = auth.uid();
  is_rev := c.reviewer_id = auth.uid() or is_mgr;
  if not (is_mgr or is_exec or is_rev) then raise exception 'Нет прав на материал'; end if;
  ok := case
    when p_to = 'cancelled' then is_mgr and c.status not in ('published','cancelled')
    when p_to in ('paused','blocked') then (is_mgr or is_exec) and c.status not in ('published','cancelled')
    when c.status in ('paused','blocked') then is_mgr or is_exec
    when c.status = 'planned' then p_to in ('in_progress','ready_to_shoot','editing','design')
    when c.status = 'in_progress' then p_to in ('ready_to_shoot','editing','design','review')
    when c.status = 'ready_to_shoot' then p_to in ('shot')
    when c.status = 'shot' then p_to in ('processing','editing')
    when c.status = 'processing' then p_to in ('editing','design','review')
    when c.status = 'editing' then p_to in ('design','review')
    when c.status = 'design' then p_to in ('editing','review')
    when c.status = 'revision' then p_to in ('in_progress','editing','design','review')
    when c.status = 'review' then is_rev and p_to in ('done','revision')
    when c.status = 'done' then p_to in ('published','revision') and (is_mgr or is_rev or (p_to = 'published' and is_exec))
    else false end;
  if not ok then raise exception 'Недопустимый переход: % → %', c.status, p_to; end if;
  if c.assignee_id is null and p_to not in ('cancelled','paused','blocked') then raise exception 'Сначала назначьте исполнителя'; end if;
  if p_to = 'review' and coalesce(p_result_url, c.result_url, '') = '' then raise exception 'Прикрепите результат (ссылку на файл)'; end if;
  if p_to = 'revision' and coalesce(trim(p_note),'') = '' then raise exception 'Укажите причину и список правок'; end if;
  if p_to in ('blocked','paused') and coalesce(trim(p_note),'') = '' then raise exception 'Укажите причину'; end if;
  if p_to = 'published' and not exists (select 1 from public.placements where content_id = p_id) then
    raise exception 'Добавьте размещение (ссылку на публикацию)'; end if;
  update public.content_items set status = p_to,
    result_url = coalesce(p_result_url, result_url),
    submitted_at = case when p_to = 'review' then now() else submitted_at end,
    review_due = case when p_to = 'review' then now() + make_interval(hours => coalesce((select value::int from public.app_settings where key='review_hours'), 24)) else review_due end,
    prepared_at = case when p_to = 'done' then now() when p_to = 'revision' then null else prepared_at end,
    approved_at = case when p_to = 'done' then now() else approved_at end,
    version = case when p_to = 'revision' then version + 1 else version end,
    blocked_reason = case when p_to in ('blocked','paused') then p_note else blocked_reason end
  where id = p_id;
  insert into public.content_history(content_id, from_status, to_status, actor_id, note, data)
  values (p_id, c.status, p_to, auth.uid(), p_note, case when p_result_url is not null then jsonb_build_object('result_url', p_result_url) end);
  if p_to = 'review' and c.reviewer_id is not null then
    perform public.notify_user(c.reviewer_id, 'content.review', 'Материал на проверку', c.title, 'content', p_id::text, 'high', 'rev:' || p_id || ':' || c.version);
  elsif p_to = 'revision' and c.assignee_id is not null then
    perform public.notify_user(c.assignee_id, 'content.revision', 'Правки по материалу', c.title || ': ' || left(p_note, 140), 'content', p_id::text, 'high', 'fix:' || p_id || ':' || c.version);
  elsif p_to = 'done' and c.assignee_id is not null then
    perform public.notify_user(c.assignee_id, 'content.approved', 'Материал утверждён', c.title, 'content', p_id::text, 'normal', 'ok:' || p_id || ':' || c.version);
  end if;
end $$;

-- Назначение исполнителя: ТЗ, срок и исполнитель обязательны
create or replace function public.content_assign(p_id uuid, p_assignee uuid, p_reviewer uuid, p_brief text, p_prep_due timestamptz, p_publish_due timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare c public.content_items;
begin
  select * into c from public.content_items where id = p_id for update;
  if not (public.can_manage_project(c.project_id) or public.has_perm('content.manage')) then raise exception 'Нет прав'; end if;
  if coalesce(trim(p_brief),'') = '' then raise exception 'ТЗ обязательно до назначения'; end if;
  if p_assignee is null then raise exception 'Выберите исполнителя'; end if;
  if p_prep_due is null then raise exception 'Укажите срок подготовки'; end if;
  if not public.is_active(p_assignee) then raise exception 'Исполнитель неактивен'; end if;
  update public.content_items set assignee_id = p_assignee, reviewer_id = p_reviewer, brief = p_brief,
     prep_due = p_prep_due, publish_due = coalesce(p_publish_due, publish_due) where id = p_id;
  insert into public.project_members(project_id, user_id, role) values (c.project_id, p_assignee, 'executor') on conflict do nothing;
  if p_reviewer is not null then
    insert into public.project_members(project_id, user_id, role) values (c.project_id, p_reviewer, 'reviewer') on conflict do nothing;
  end if;
  insert into public.content_history(content_id, from_status, to_status, actor_id, note, data)
  values (p_id, c.status, c.status, auth.uid(), 'назначение', jsonb_build_object('assignee', p_assignee, 'reviewer', p_reviewer,
     'prev_assignee', c.assignee_id, 'prep_due', p_prep_due));
  if p_assignee is distinct from c.assignee_id then
    perform public.notify_user(p_assignee, 'content.assigned', 'Вам назначен материал', c.title, 'content', p_id::text, 'normal', 'asg:' || p_id || ':' || p_assignee);
  end if;
end $$;

-- ───────────── задачи: переходы ─────────────
create or replace function public.task_transition(p_id uuid, p_to public.task_status, p_note text default null, p_result text default null)
returns void language plpgsql security definer set search_path = public as $$
declare t public.tasks; is_mgr boolean;
begin
  select * into t from public.tasks where id = p_id for update;
  if not found then raise exception 'Задача не найдена'; end if;
  is_mgr := public.has_perm('tasks.manage') or (t.project_id is not null and public.can_manage_project(t.project_id)) or t.created_by = auth.uid();
  if not (is_mgr or t.assignee_id = auth.uid() or t.reviewer_id = auth.uid()) then raise exception 'Нет прав на задачу'; end if;
  if p_to = 'done' and t.reviewer_id is not null and t.reviewer_id <> auth.uid() and not is_mgr then
    raise exception 'Задачу с проверяющим закрывает проверяющий — отправьте на проверку'; end if;
  if p_to in ('review','done') and coalesce(p_result, t.result_url, t.result_note, '') = '' then
    raise exception 'Укажите результат работы'; end if;
  if p_to in ('revision','blocked','cancelled') and coalesce(trim(p_note),'') = '' then raise exception 'Укажите причину'; end if;
  update public.tasks set status = p_to, completed_at = case when p_to = 'done' then now() else null end,
     result_note = coalesce(p_result, result_note) where id = p_id;
  insert into public.task_history(task_id, actor_id, kind, data) values (p_id, auth.uid(), 'status', jsonb_build_object('from', t.status, 'to', p_to, 'note', p_note));
  if p_to = 'review' and t.reviewer_id is not null then
    perform public.notify_user(t.reviewer_id, 'task.review', 'Задача на проверку', t.title, 'task', p_id::text, 'normal', 'trev:' || p_id || ':' || now()::date);
  elsif p_to = 'revision' and t.assignee_id is not null then
    perform public.notify_user(t.assignee_id, 'task.revision', 'Задача возвращена', t.title || ': ' || left(p_note, 140), 'task', p_id::text, 'high', null);
  end if;
end $$;

-- Перенос срока: исходный срок сохраняется, причина обязательна
create or replace function public.task_reschedule(p_id uuid, p_due timestamptz, p_reason text, p_assignee uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare t public.tasks;
begin
  select * into t from public.tasks where id = p_id for update;
  if not (public.has_perm('tasks.manage') or t.created_by = auth.uid() or (t.project_id is not null and public.can_manage_project(t.project_id))) then
    raise exception 'Нет прав'; end if;
  if coalesce(trim(p_reason),'') = '' then raise exception 'Укажите причину переноса'; end if;
  update public.tasks set original_due_at = coalesce(original_due_at, due_at), due_at = p_due,
     assignee_id = coalesce(p_assignee, assignee_id) where id = p_id;
  insert into public.task_history(task_id, actor_id, kind, data)
  values (p_id, auth.uid(), 'reschedule', jsonb_build_object('from', t.due_at, 'to', p_due, 'reason', p_reason, 'assignee_from', t.assignee_id, 'assignee_to', p_assignee));
  if coalesce(p_assignee, t.assignee_id) is not null then
    perform public.notify_user(coalesce(p_assignee, t.assignee_id), 'task.rescheduled', 'Изменён срок задачи', t.title || ': ' || p_reason, 'task', p_id::text, 'normal', null);
  end if;
end $$;

create or replace function public.tasks_notify_assign()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.assignee_id is not null and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id) then
    perform public.notify_user(new.assignee_id, 'task.assigned', 'Новая задача', new.title, 'task', new.id::text, new.priority, 'tasg:' || new.id || ':' || new.assignee_id);
    if new.project_id is not null then
      insert into public.project_members(project_id, user_id, role) values (new.project_id, new.assignee_id, 'executor') on conflict do nothing;
    end if;
  end if;
  return new;
end $$;
create trigger tasks_assign_trg after insert or update of assignee_id on public.tasks for each row execute function public.tasks_notify_assign();

-- ───────────── съёмки: конфликты и подтверждения ─────────────
create or replace function public.shoot_conflicts(p_user uuid, p_start timestamptz, p_end timestamptz, p_exclude uuid default null)
returns table (shoot_id uuid, title text, starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = public as $$
  select s.id, s.title, s.starts_at, s.ends_at from public.shoots s join public.shoot_participants sp on sp.shoot_id = s.id
   where sp.user_id = p_user and s.status <> 'cancelled' and s.id is distinct from p_exclude
     and tstzrange(s.starts_at, s.ends_at) && tstzrange(p_start, p_end) and sp.response <> 'declined';
$$;

create or replace function public.shoot_set_participant(p_shoot uuid, p_user uuid, p_role text, p_force boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.shoots; conflicts jsonb;
begin
  select * into s from public.shoots where id = p_shoot;
  if not (public.has_perm('shoots.manage') or public.can_manage_project(s.project_id)
          or exists (select 1 from public.projects where id = s.project_id and creative_director_id = auth.uid())) then
    raise exception 'Нет прав на состав съёмки'; end if;
  select coalesce(jsonb_agg(to_jsonb(c)), '[]') into conflicts from public.shoot_conflicts(p_user, s.starts_at, s.ends_at, p_shoot) c;
  if jsonb_array_length(conflicts) > 0 and not p_force then
    return jsonb_build_object('ok', false, 'conflicts', conflicts);
  end if;
  insert into public.shoot_participants(shoot_id, user_id, role) values (p_shoot, p_user, p_role)
  on conflict (shoot_id, user_id) do update set role = excluded.role, response = 'pending', responded_at = null;
  insert into public.project_members(project_id, user_id, role) values (s.project_id, p_user, 'shoot') on conflict do nothing;
  insert into public.shoot_history(shoot_id, actor_id, kind, data) values (p_shoot, auth.uid(), 'participant', jsonb_build_object('user', p_user, 'role', p_role, 'forced', p_force));
  perform public.notify_user(p_user, 'shoot.assigned', 'Вы назначены на съёмку', s.title || ' · ' || to_char(s.starts_at at time zone 'Asia/Bishkek', 'DD.MM HH24:MI'), 'shoot', p_shoot::text, 'high', 'sh:' || p_shoot || ':' || p_user || ':' || extract(epoch from s.starts_at)::bigint);
  return jsonb_build_object('ok', true, 'conflicts', conflicts);
end $$;

create or replace function public.shoot_respond(p_shoot uuid, p_response text, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare s public.shoots;
begin
  if p_response not in ('accepted','declined') then raise exception 'Некорректный ответ'; end if;
  if p_response = 'declined' and coalesce(trim(p_reason),'') = '' then raise exception 'Укажите причину отказа'; end if;
  update public.shoot_participants set response = p_response, responded_at = now(), decline_reason = p_reason
   where shoot_id = p_shoot and user_id = auth.uid();
  if not found then raise exception 'Вы не участник съёмки'; end if;
  select * into s from public.shoots where id = p_shoot;
  insert into public.shoot_history(shoot_id, actor_id, kind, data) values (p_shoot, auth.uid(), 'response', jsonb_build_object('response', p_response, 'reason', p_reason));
  if p_response = 'declined' then
    perform public.notify_user(coalesce((select admin_id from public.projects where id = s.project_id), s.created_by), 'shoot.declined',
      'Отказ от съёмки', s.title || ': ' || p_reason, 'shoot', p_shoot::text, 'high', null);
  end if;
end $$;

create or replace function public.shoot_reschedule(p_shoot uuid, p_start timestamptz, p_end timestamptz, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare s public.shoots; r record;
begin
  select * into s from public.shoots where id = p_shoot for update;
  if not (public.has_perm('shoots.manage') or public.can_manage_project(s.project_id)
          or exists (select 1 from public.projects where id = s.project_id and planning_director_id = auth.uid())) then
    raise exception 'Нет прав'; end if;
  if coalesce(trim(p_reason),'') = '' then raise exception 'Укажите причину переноса'; end if;
  update public.shoots set starts_at = p_start, ends_at = p_end where id = p_shoot;
  update public.shoot_participants set response = 'pending', responded_at = null where shoot_id = p_shoot;
  insert into public.shoot_history(shoot_id, actor_id, kind, data)
  values (p_shoot, auth.uid(), 'reschedule', jsonb_build_object('from', s.starts_at, 'to', p_start, 'reason', p_reason));
  for r in select user_id from public.shoot_participants where shoot_id = p_shoot loop
    perform public.notify_user(r.user_id, 'shoot.rescheduled', 'Съёмка перенесена — подтвердите участие',
      s.title || ' → ' || to_char(p_start at time zone 'Asia/Bishkek', 'DD.MM HH24:MI'), 'shoot', p_shoot::text, 'high', null);
  end loop;
end $$;

-- ───────────── план-факт ─────────────
create or replace view public.v_period_progress with (security_invoker = true) as
select pi.period_id, pi.project_id, pi.kind, pi.planned_qty as planned,
  count(c.id) filter (where c.status in ('in_progress','ready_to_shoot','shot','processing')) as in_work,
  count(c.id) filter (where c.status in ('editing','design','review','revision')) as in_post,
  count(c.id) filter (where c.status in ('done','published')) as prepared,
  count(c.id) filter (where c.status = 'published') as published,
  count(c.id) filter (where c.status = 'published' and exists (select 1 from public.placements pl where pl.content_id = c.id and pl.checked_at is not null)) as verified,
  greatest(0, pi.planned_qty - count(c.id) filter (where c.status in ('done','published'))) as left_to_prepare,
  greatest(0, pi.planned_qty - count(c.id) filter (where c.status = 'published')) as left_to_publish,
  greatest(0, count(c.id) filter (where c.status in ('done','published')) - pi.planned_qty) as overflow,
  count(c.id) filter (where c.status not in ('done','published','cancelled') and c.prep_due < now()) as overdue
from public.plan_items pi
left join public.content_items c on c.plan_item_id = pi.id and c.status <> 'cancelled'
where pi.kind not in ('story','shoot')
group by pi.id
union all
select pi.period_id, pi.project_id, pi.kind, pi.planned_qty,
  0, 0, coalesce(sum(least(s.actual, s.planned)),0)::bigint, coalesce(sum(s.actual) filter (where s.confirmed_at is not null),0)::bigint,
  coalesce(sum(s.actual) filter (where s.confirmed_at is not null),0)::bigint,
  greatest(0, pi.planned_qty - coalesce(sum(s.actual),0))::bigint, greatest(0, pi.planned_qty - coalesce(sum(s.actual) filter (where s.confirmed_at is not null),0))::bigint,
  greatest(0, coalesce(sum(s.actual),0) - pi.planned_qty)::bigint,
  count(s.id) filter (where s.day < current_date and s.actual < s.planned)
from public.plan_items pi
left join public.story_daily_plans s on s.period_id = pi.period_id
where pi.kind = 'story'
group by pi.id
union all
select pi.period_id, pi.project_id, pi.kind, pi.planned_qty, 0, 0,
  count(sh.id) filter (where sh.status = 'done'), count(sh.id) filter (where sh.status = 'done'), count(sh.id) filter (where sh.status = 'done'),
  greatest(0, pi.planned_qty - count(sh.id) filter (where sh.status = 'done')), 0,
  greatest(0, count(sh.id) filter (where sh.status = 'done') - pi.planned_qty), 0
from public.plan_items pi
left join public.shoots sh on sh.period_id = pi.period_id
where pi.kind = 'shoot'
group by pi.id;

-- Закрытие периода: долг работ фиксируется, следующий период создаётся отдельно
create or replace function public.close_period(p_period uuid, p_create_next boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare per public.project_periods; debt bigint; pr public.projects; v_next uuid;
begin
  select * into per from public.project_periods where id = p_period for update;
  if not public.can_manage_project(per.project_id) then raise exception 'Нет прав'; end if;
  if per.status <> 'open' then raise exception 'Период уже закрыт'; end if;
  select coalesce(sum(left_to_prepare),0) into debt from public.v_period_progress where period_id = p_period;
  update public.project_periods set status = case when debt > 0 then 'closed_with_debt' else 'closed' end,
     closed_at = now(), closed_by = auth.uid() where id = p_period;
  perform public.audit('period.close', 'period', p_period::text, jsonb_build_object('work_debt', debt));
  select * into pr from public.projects where id = per.project_id;
  if p_create_next and pr.kind in ('monthly','yearly') and pr.status = 'in_progress'
     and (pr.contract_end is null or per.ends_on + 1 <= pr.contract_end) then
    v_next := public.create_period(per.project_id, per.ends_on + 1, 1);
  end if;
  return jsonb_build_object('work_debt', debt, 'next_period', v_next);
end $$;

-- ───────────── секреты (Vault) ─────────────
create or replace function public.secret_create(p_project uuid, p_label text, p_platform text, p_login_hint text, p_value text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_vault uuid; v_id uuid;
begin
  if not public.has_perm('credentials.manage') then raise exception 'Нет права credentials.manage'; end if;
  if not public.recent_password_auth(900) then raise exception 'REAUTH_REQUIRED'; end if;
  v_vault := vault.create_secret(p_value, 'citadel_' || gen_random_uuid()::text, p_label);
  insert into public.project_secrets(project_id, label, platform, login_hint, vault_secret_id, created_by)
  values (p_project, p_label, p_platform, p_login_hint, v_vault, auth.uid()) returning id into v_id;
  perform public.audit('secret.create', 'project', p_project::text, jsonb_build_object('secret', v_id, 'label', p_label));
  return v_id;
end $$;

create or replace function public.secret_reveal(p_secret uuid)
returns text language plpgsql security definer set search_path = public as $$
declare s public.project_secrets; v text;
begin
  select * into s from public.project_secrets where id = p_secret;
  if not found then raise exception 'Не найдено'; end if;
  if not public.has_perm('credentials.reveal') or not public.can_view_project(s.project_id) then raise exception 'Нет права credentials.reveal'; end if;
  if not public.recent_password_auth(900) then raise exception 'REAUTH_REQUIRED'; end if;
  select decrypted_secret into v from vault.decrypted_secrets where id = s.vault_secret_id;
  insert into public.secret_access_log(secret_id, actor_id) values (p_secret, auth.uid());
  perform public.audit('secret.reveal', 'project', s.project_id::text, jsonb_build_object('secret', p_secret));
  return v;
end $$;

create or replace function public.secret_delete(p_secret uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s public.project_secrets;
begin
  if not public.has_perm('credentials.manage') then raise exception 'Нет прав'; end if;
  select * into s from public.project_secrets where id = p_secret;
  delete from vault.secrets where id = s.vault_secret_id;
  delete from public.project_secrets where id = p_secret;
  perform public.audit('secret.delete', 'project', s.project_id::text, jsonb_build_object('secret', p_secret));
end $$;

-- ───────────── RLS ─────────────
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.project_contracts enable row level security;
alter table public.project_amendments enable row level security;
alter table public.project_status_history enable row level security;
alter table public.project_periods enable row level security;
alter table public.plan_items enable row level security;
alter table public.content_items enable row level security;
alter table public.content_history enable row level security;
alter table public.placements enable row level security;
alter table public.story_daily_plans enable row level security;
alter table public.tasks enable row level security;
alter table public.task_history enable row level security;
alter table public.shoots enable row level security;
alter table public.shoot_participants enable row level security;
alter table public.shoot_history enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_metrics enable row level security;
alter table public.project_secrets enable row level security;
alter table public.secret_access_log enable row level security;
alter table public.project_admin_checks enable row level security;
alter table public.calendar_events enable row level security;
alter table public.capacity_rules enable row level security;
alter table public.attachments enable row level security;
alter table public.comments enable row level security;

create policy projects_read on public.projects for select to authenticated using (public.can_view_project(id));
create policy projects_insert on public.projects for insert to authenticated with check (public.has_perm('projects.create'));
create policy projects_update on public.projects for update to authenticated using (public.can_manage_project(id)) with check (public.can_manage_project(id));
create policy pm_read on public.project_members for select to authenticated using (public.can_view_project(project_id));
create policy pm_write on public.project_members for all to authenticated using (public.can_manage_project(project_id)) with check (public.can_manage_project(project_id));
create policy pc_read on public.project_contracts for select to authenticated using (public.has_perm('prices.view') or public.has_perm('finance.view'));
create policy pc_write on public.project_contracts for all to authenticated
  using (public.has_perm('projects.create') and public.has_perm('prices.view')) with check (public.has_perm('projects.create') and public.has_perm('prices.view'));
create policy pa_read on public.project_amendments for select to authenticated using (public.can_view_project(project_id));
create policy pa_insert on public.project_amendments for insert to authenticated with check (public.has_perm('projects.manage') and created_by = auth.uid());
create policy psh_read on public.project_status_history for select to authenticated using (public.can_view_project(project_id));
create policy periods_read on public.project_periods for select to authenticated using (public.can_view_project(project_id));
create policy plan_read on public.plan_items for select to authenticated using (public.can_view_project(project_id));
create policy plan_write on public.plan_items for update to authenticated using (public.has_perm('projects.manage')) with check (public.has_perm('projects.manage'));

create policy content_read on public.content_items for select to authenticated
  using (public.can_view_project(project_id) or assignee_id = auth.uid() or reviewer_id = auth.uid());
create policy content_insert on public.content_items for insert to authenticated
  with check (public.can_manage_project(project_id) or public.has_perm('content.manage'));
-- обновление полей без статуса (название, ТЗ, сценарий, слайды); статус — только через content_transition
create policy content_update on public.content_items for update to authenticated
  using (public.can_manage_project(project_id) or public.has_perm('content.manage') or assignee_id = auth.uid())
  with check (public.can_manage_project(project_id) or public.has_perm('content.manage') or assignee_id = auth.uid());
create or replace function public.content_guard()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated','anon') and (new.status is distinct from old.status or new.assignee_id is distinct from old.assignee_id
     or new.approved_at is distinct from old.approved_at or new.prepared_at is distinct from old.prepared_at) then
    raise exception 'Статус и исполнитель меняются только через рабочий процесс';
  end if;
  return new;
end $$;
create trigger content_guard_trg before update on public.content_items for each row execute function public.content_guard();

create policy ch_read on public.content_history for select to authenticated using (exists (select 1 from public.content_items c where c.id = content_id));
create policy placements_read on public.placements for select to authenticated using (exists (select 1 from public.content_items c where c.id = content_id));
create policy placements_insert on public.placements for insert to authenticated
  with check (created_by = auth.uid() and checked_at is null and exists (select 1 from public.content_items c where c.id = content_id
     and (c.assignee_id = auth.uid() or public.can_manage_project(c.project_id) or public.has_perm('content.publish'))));
create policy placements_check on public.placements for update to authenticated
  using (exists (select 1 from public.content_items c where c.id = content_id and public.can_manage_project(c.project_id)))
  with check (exists (select 1 from public.content_items c where c.id = content_id and public.can_manage_project(c.project_id)));

create policy story_read on public.story_daily_plans for select to authenticated using (public.can_view_project(project_id) or assignee_id = auth.uid());
create policy story_update on public.story_daily_plans for update to authenticated
  using (public.can_manage_project(project_id) or assignee_id = auth.uid() or public.has_perm('content.manage'))
  with check (public.can_manage_project(project_id) or assignee_id = auth.uid() or public.has_perm('content.manage'));
create policy story_insert on public.story_daily_plans for insert to authenticated with check (public.can_manage_project(project_id));

create policy tasks_read on public.tasks for select to authenticated
  using (assignee_id = auth.uid() or reviewer_id = auth.uid() or created_by = auth.uid() or public.has_perm('tasks.view_all')
         or (project_id is not null and public.can_view_project(project_id)));
create policy tasks_insert on public.tasks for insert to authenticated
  with check (public.is_active() and created_by = auth.uid() and (public.has_perm('tasks.manage') or (project_id is not null and public.can_manage_project(project_id)) or assignee_id = auth.uid()));
create policy tasks_update on public.tasks for update to authenticated
  using (public.has_perm('tasks.manage') or created_by = auth.uid() or (project_id is not null and public.can_manage_project(project_id)))
  with check (public.has_perm('tasks.manage') or created_by = auth.uid() or (project_id is not null and public.can_manage_project(project_id)));
create policy th_read on public.task_history for select to authenticated using (exists (select 1 from public.tasks t where t.id = task_id));

create or replace function public.is_shoot_participant(p_shoot uuid, p_role text default null)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.shoot_participants where shoot_id = p_shoot and user_id = auth.uid() and (p_role is null or role = p_role));
$$;
create policy shoots_read on public.shoots for select to authenticated
  using (public.can_view_project(project_id) or public.is_shoot_participant(id));
create policy shoots_insert on public.shoots for insert to authenticated
  with check (created_by = auth.uid() and (public.has_perm('shoots.manage') or public.can_manage_project(project_id)
    or exists (select 1 from public.projects p where p.id = project_id and p.planning_director_id = auth.uid())));
create policy shoots_update on public.shoots for update to authenticated
  using (public.has_perm('shoots.manage') or public.can_manage_project(project_id)
    or exists (select 1 from public.projects p where p.id = project_id and auth.uid() in (p.planning_director_id, p.creative_director_id))
    or public.is_shoot_participant(id, 'mobilographer'))
  with check (true);
create policy sp_read on public.shoot_participants for select to authenticated
  using (user_id = auth.uid() or exists (select 1 from public.shoots s where s.id = shoot_id));
create policy sp_delete on public.shoot_participants for delete to authenticated
  using (exists (select 1 from public.shoots s where s.id = shoot_id and (public.has_perm('shoots.manage') or public.can_manage_project(s.project_id))));
create policy shh_read on public.shoot_history for select to authenticated using (exists (select 1 from public.shoots s where s.id = shoot_id));

create policy camp_read on public.campaigns for select to authenticated using (owner_id = auth.uid() or public.has_perm('campaigns.view_all') or public.can_manage_project(project_id));
create policy camp_write on public.campaigns for insert to authenticated with check (public.has_perm('campaigns.manage') and created_by = auth.uid());
create policy camp_update on public.campaigns for update to authenticated using (owner_id = auth.uid() or public.has_perm('campaigns.manage')) with check (owner_id = auth.uid() or public.has_perm('campaigns.manage'));
create policy cm_read on public.campaign_metrics for select to authenticated using (exists (select 1 from public.campaigns c where c.id = campaign_id));
create policy cm_write on public.campaign_metrics for insert to authenticated
  with check (created_by = auth.uid() and exists (select 1 from public.campaigns c where c.id = campaign_id and (c.owner_id = auth.uid() or public.has_perm('campaigns.manage'))));
create policy cm_update on public.campaign_metrics for update to authenticated
  using (exists (select 1 from public.campaigns c where c.id = campaign_id and (c.owner_id = auth.uid() or public.has_perm('campaigns.manage'))));

-- секреты: список видят только с credentials.reveal на проекте, значение — только через secret_reveal
create policy secrets_read on public.project_secrets for select to authenticated using (public.has_perm('credentials.reveal') and public.can_view_project(project_id));
create policy sal_read on public.secret_access_log for select to authenticated using (public.has_perm('audit.view'));

create policy checks_read on public.project_admin_checks for select to authenticated using (public.can_view_project(project_id));
create policy checks_insert on public.project_admin_checks for insert to authenticated with check (admin_id = auth.uid() and public.is_project_member(project_id));
create policy checks_update on public.project_admin_checks for update to authenticated using (admin_id = auth.uid() or public.has_perm('projects.manage'));

create policy cal_read on public.calendar_events for select to authenticated using (user_id = auth.uid() or public.has_perm('calendar.view_all'));
create policy cal_write on public.calendar_events for all to authenticated
  using (user_id = auth.uid() or public.has_perm('employees.manage')) with check (user_id = auth.uid() or public.has_perm('employees.manage'));

create policy cap_read on public.capacity_rules for select to authenticated using (public.is_active());
create policy cap_write on public.capacity_rules for update to authenticated using (public.has_perm('projects.manage')) with check (public.has_perm('projects.manage'));

create policy att_read on public.attachments for select to authenticated using (created_by = auth.uid() or (project_id is not null and public.can_view_project(project_id)));
create policy att_insert on public.attachments for insert to authenticated with check (created_by = auth.uid() and public.is_active());
create policy com_read on public.comments for select to authenticated using (author_id = auth.uid() or (project_id is not null and public.can_view_project(project_id)));
create policy com_insert on public.comments for insert to authenticated with check (author_id = auth.uid() and public.is_active());
