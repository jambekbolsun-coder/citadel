-- 0014. Рабочее место таргетолога: креативы, журнал расходов без перезаписи, история статусов и бюджетов,
-- доступ только к назначенным проектам. Интеграций с рекламными API нет: всё — ручной учёт сотрудника.
--
-- Канонический источник фактического расхода — campaign_spend_entries (действующие записи: superseded_at is null).
-- campaign_metrics больше не пишется; её строки перенесены как source='legacy' (нераспределённый расход кампании).

-- ───────────── права на кампанию ─────────────
create or replace function public.campaign_can_view(p_campaign uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_active() and exists (
    select 1 from public.campaigns c where c.id = p_campaign and (
      c.owner_id = auth.uid() or public.has_perm('campaigns.view_all') or public.can_manage_project(c.project_id)
      or (public.has_perm('campaigns.manage') and public.is_project_member(c.project_id))));
$$;

create or replace function public.campaign_can_edit(p_campaign uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_active() and exists (
    select 1 from public.campaigns c where c.id = p_campaign and (
      public.can_manage_project(c.project_id)
      or (public.has_perm('campaigns.manage') and (c.owner_id = auth.uid() or public.is_project_member(c.project_id) or public.has_perm('campaigns.view_all')))));
$$;

-- Таргетолог проекта (по кампании или назначению) — видит клиента своего проекта
create or replace function public.is_ad_member(p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_active() and public.has_perm('campaigns.manage') and (
    exists (select 1 from public.campaigns c where c.project_id = p_project and c.owner_id = auth.uid())
    or exists (select 1 from public.project_members m where m.project_id = p_project and m.user_id = auth.uid()));
$$;

create or replace function public.bishkek_today()
returns date language sql stable as $$ select (now() at time zone 'Asia/Bishkek')::date $$;

-- ───────────── кампании: новые поля ─────────────
alter table public.campaigns
  add column if not exists daily_budget_minor bigint check (daily_budget_minor is null or daily_budget_minor >= 0),
  add column if not exists started_on date,
  add column if not exists stopped_on date,
  add column if not exists history_from date,
  add column if not exists status_changed_at timestamptz,
  add column if not exists status_changed_by uuid references public.profiles(id);
alter table public.campaigns drop constraint if exists campaigns_budget_nonneg;
alter table public.campaigns add constraint campaigns_budget_nonneg check (budget_minor >= 0);
alter table public.campaigns drop constraint if exists campaigns_currency_fmt;
alter table public.campaigns add constraint campaigns_currency_fmt check (currency ~ '^[A-Z]{3}$');
-- для уже существующих кампаний история пауз до миграции неизвестна — считаем активные дни только с сегодняшнего дня
update public.campaigns set history_from = public.bishkek_today() where history_from is null;

create index if not exists campaigns_owner_idx on public.campaigns(owner_id, status);
create index if not exists campaigns_project_idx on public.campaigns(project_id, status);

-- ───────────── креативы (рекламные видео) ─────────────
create table if not exists public.campaign_creatives (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  seq int not null,
  title text not null check (length(trim(title)) > 0),
  kind text not null default 'video' check (kind in ('video','static','carousel','story','other')),
  content_item_id uuid references public.content_items(id) on delete set null,
  url text check (url is null or url ~* '^https?://'),
  status text not null default 'active' check (status in ('active','paused','off')),
  daily_budget_minor bigint not null default 0 check (daily_budget_minor >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  limit_minor bigint check (limit_minor is null or limit_minor >= 0),
  assignee_id uuid references public.profiles(id),
  note text,
  pause_reason text,
  started_on date,
  status_changed_at timestamptz,
  status_changed_by uuid references public.profiles(id),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, seq)
);
create index if not exists creatives_campaign_idx on public.campaign_creatives(campaign_id, status);
create index if not exists creatives_content_idx on public.campaign_creatives(content_item_id) where content_item_id is not null;
create trigger creatives_touch before update on public.campaign_creatives for each row execute function public.touch_updated_at();

-- ───────────── история статусов (для активных дней) и дневных бюджетов ─────────────
create table if not exists public.ad_status_history (
  id bigint generated always as identity primary key,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  creative_id uuid references public.campaign_creatives(id) on delete cascade,
  from_status text,
  to_status text not null,
  effective_on date not null,
  reason text,
  actor_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists ad_status_hist_idx on public.ad_status_history(campaign_id, creative_id, effective_on);

create table if not exists public.ad_budget_history (
  id bigint generated always as identity primary key,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  creative_id uuid references public.campaign_creatives(id) on delete cascade,
  daily_budget_minor bigint not null check (daily_budget_minor >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  effective_from date not null,
  reason text,
  actor_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists ad_budget_hist_idx on public.ad_budget_history(campaign_id, creative_id, effective_from);

-- прочие правки (лимит, ответственный, название, заметки) — журнал «кто/что/когда»
create table if not exists public.ad_change_log (
  id bigint generated always as identity primary key,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  creative_id uuid references public.campaign_creatives(id) on delete cascade,
  field text not null,
  old_value text,
  new_value text,
  actor_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists ad_change_log_idx on public.ad_change_log(campaign_id, created_at desc);

-- ───────────── журнал фактических расходов (append-only) ─────────────
create table if not exists public.campaign_spend_entries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  creative_id uuid references public.campaign_creatives(id) on delete cascade, -- креативы не удаляются (только «Выключен»); каскад — при удалении всей кампании
  day date not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  spend_minor bigint not null default 0 check (spend_minor >= 0),
  leads int not null default 0 check (leads >= 0),
  impressions int check (impressions is null or impressions >= 0),
  clicks int check (clicks is null or clicks >= 0),
  note text,
  source text not null default 'manual' check (source in ('manual','legacy','allocation','correction')),
  replaces_id uuid references public.campaign_spend_entries(id),
  superseded_at timestamptz,
  superseded_by uuid references public.profiles(id),
  supersede_reason text,
  legacy_metric_id uuid unique,
  idempotency_key text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (campaign_id, idempotency_key)
);
create index if not exists spend_campaign_day_idx on public.campaign_spend_entries(campaign_id, day) where superseded_at is null;
create index if not exists spend_creative_idx on public.campaign_spend_entries(creative_id, day) where superseded_at is null and creative_id is not null;

-- перенос прежних дневных метрик: один раз, без удвоения (legacy_metric_id unique)
insert into public.campaign_spend_entries(campaign_id, day, currency, spend_minor, leads, impressions, clicks, note, source, legacy_metric_id, created_by, created_at)
select m.campaign_id, m.day, c.currency, m.spend_minor, m.leads, m.impressions, m.clicks, m.note, 'legacy', m.id, m.created_by, m.created_at
  from public.campaign_metrics m join public.campaigns c on c.id = m.campaign_id
on conflict (legacy_metric_id) do nothing;
comment on table public.campaign_metrics is 'Устарело с 0014: только чтение. Канонический факт — campaign_spend_entries (строки перенесены как source=legacy).';

-- ───────────── защита полей: статус и дневной бюджет — только через RPC ─────────────
create or replace function public.campaigns_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare f text;
begin
  if tg_op = 'INSERT' then
    new.history_from := public.bishkek_today();
    new.status_changed_at := now();
    new.status_changed_by := auth.uid();
    if new.status = 'active' then new.started_on := coalesce(new.started_on, least(coalesce(new.starts_on, public.bishkek_today()), public.bishkek_today())); end if;
    return new;
  end if;
  if coalesce(current_setting('citadel.bypass', true), '') <> 'on' then
    if new.status is distinct from old.status then raise exception 'Статус кампании меняется кнопкой «Статус» (с датой и причиной)'; end if;
    if new.daily_budget_minor is distinct from old.daily_budget_minor then raise exception 'Дневной бюджет меняется через «Изменить бюджет» (с датой действия)'; end if;
    if new.currency is distinct from old.currency and exists (select 1 from public.campaign_spend_entries where campaign_id = old.id) then
      raise exception 'Валюта кампании с записанными расходами не меняется';
    end if;
    if new.history_from is distinct from old.history_from or new.started_on is distinct from old.started_on or new.stopped_on is distinct from old.stopped_on then
      raise exception 'Служебные даты кампании меняются только вместе со статусом';
    end if;
  end if;
  foreach f in array array['name','platform','goal','ad_account_id','budget_minor','currency','owner_id','starts_on','ends_on','target_leads','check_every_days','notes'] loop
    if (to_jsonb(new)->f) is distinct from (to_jsonb(old)->f) then
      insert into public.ad_change_log(campaign_id, field, old_value, new_value, actor_id)
      values (old.id, f, to_jsonb(old)->>f, to_jsonb(new)->>f, auth.uid());
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists campaigns_guard_trg on public.campaigns;
create trigger campaigns_guard_trg before insert or update on public.campaigns for each row execute function public.campaigns_guard();

-- после создания/смены таргетолога: первая запись истории и назначение в проект
create or replace function public.campaigns_after()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.ad_status_history(campaign_id, to_status, effective_on, reason, actor_id)
    values (new.id, new.status, coalesce(new.started_on, public.bishkek_today()), 'Создание кампании', auth.uid());
    if new.daily_budget_minor is not null then
      insert into public.ad_budget_history(campaign_id, daily_budget_minor, currency, effective_from, reason, actor_id)
      values (new.id, new.daily_budget_minor, new.currency, coalesce(new.started_on, public.bishkek_today()), 'Создание кампании', auth.uid());
    end if;
  end if;
  if new.owner_id is not null and (tg_op = 'INSERT' or new.owner_id is distinct from old.owner_id) then
    insert into public.project_members(project_id, user_id, role) values (new.project_id, new.owner_id, 'targetologist') on conflict do nothing;
  end if;
  if tg_op = 'UPDATE' and old.owner_id is not null and new.owner_id is distinct from old.owner_id
     and not exists (select 1 from public.campaigns c where c.project_id = old.project_id and c.owner_id = old.owner_id and c.id <> old.id) then
    delete from public.project_members where project_id = old.project_id and user_id = old.owner_id and role = 'targetologist';
  end if;
  return null;
end $$;
drop trigger if exists campaigns_after_trg on public.campaigns;
create trigger campaigns_after_trg after insert or update of owner_id on public.campaigns for each row execute function public.campaigns_after();

create or replace function public.creatives_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare c public.campaigns; f text;
begin
  select * into c from public.campaigns where id = new.campaign_id;
  if tg_op = 'INSERT' then
    if new.seq is null then
      select coalesce(max(seq), 0) + 1 into new.seq from public.campaign_creatives where campaign_id = new.campaign_id;
    end if;
    new.currency := coalesce(new.currency, c.currency);
    new.status_changed_at := now();
    new.status_changed_by := auth.uid();
    if new.status = 'active' then new.started_on := coalesce(new.started_on, public.bishkek_today()); end if;
  elsif coalesce(current_setting('citadel.bypass', true), '') <> 'on' then
    if new.status is distinct from old.status then raise exception 'Статус креатива меняется кнопкой «Статус» (с датой)'; end if;
    if new.daily_budget_minor is distinct from old.daily_budget_minor then raise exception 'Дневной бюджет меняется через «Изменить бюджет» (с датой действия)'; end if;
    if new.currency is distinct from old.currency then raise exception 'Валюта креатива не меняется — создайте новый креатив'; end if;
    if new.campaign_id is distinct from old.campaign_id then raise exception 'Креатив нельзя перенести в другую кампанию'; end if;
  end if;
  if new.content_item_id is not null and not exists (
       select 1 from public.content_items ci where ci.id = new.content_item_id and ci.project_id = c.project_id) then
    raise exception 'Материал должен относиться к проекту этой кампании';
  end if;
  if tg_op = 'UPDATE' then
    foreach f in array array['title','kind','content_item_id','url','limit_minor','assignee_id','note'] loop
      if (to_jsonb(new)->f) is distinct from (to_jsonb(old)->f) then
        insert into public.ad_change_log(campaign_id, creative_id, field, old_value, new_value, actor_id)
        values (old.campaign_id, old.id, f, to_jsonb(old)->>f, to_jsonb(new)->>f, auth.uid());
      end if;
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists creatives_guard_trg on public.campaign_creatives;
create trigger creatives_guard_trg before insert or update on public.campaign_creatives for each row execute function public.creatives_guard();

create or replace function public.creatives_after()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.ad_status_history(campaign_id, creative_id, to_status, effective_on, reason, actor_id)
  values (new.campaign_id, new.id, new.status, coalesce(new.started_on, public.bishkek_today()), 'Добавлен креатив', auth.uid());
  insert into public.ad_budget_history(campaign_id, creative_id, daily_budget_minor, currency, effective_from, reason, actor_id)
  values (new.campaign_id, new.id, new.daily_budget_minor, new.currency, coalesce(new.started_on, public.bishkek_today()), 'Добавлен креатив', auth.uid());
  return null;
end $$;
drop trigger if exists creatives_after_trg on public.campaign_creatives;
create trigger creatives_after_trg after insert on public.campaign_creatives for each row execute function public.creatives_after();

-- журнал расходов неизменяем напрямую: правки — только новыми записями через RPC
create or replace function public.spend_guard()
returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('citadel.bypass', true), '') = 'on' then
    if tg_op = 'UPDATE' and (new.spend_minor, new.leads, new.impressions, new.clicks, new.day, new.currency, new.campaign_id, new.creative_id)
        is distinct from (old.spend_minor, old.leads, old.impressions, old.clicks, old.day, old.currency, old.campaign_id, old.creative_id) then
      raise exception 'Суммы записанного расхода не меняются — создаётся исправление';
    end if;
    return coalesce(new, old);
  end if;
  -- каскадное удаление вместе с кампанией/проектом (вложенный триггер внешнего ключа) разрешено
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then return old; end if;
  raise exception 'Расходы записываются и исправляются только через журнал (с историей)';
end $$;
drop trigger if exists spend_guard_trg on public.campaign_spend_entries;
create trigger spend_guard_trg before update or delete on public.campaign_spend_entries for each row execute function public.spend_guard();

-- ───────────── RPC: статусы и бюджеты ─────────────
create or replace function public.campaign_set_status(p_campaign uuid, p_status text, p_effective_on date default null, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.campaigns; d date := coalesce(p_effective_on, public.bishkek_today());
begin
  if not public.campaign_can_edit(p_campaign) then raise exception 'Недостаточно прав на эту кампанию'; end if;
  if p_status not in ('draft','active','paused','finished') then raise exception 'Недопустимый статус'; end if;
  if d > public.bishkek_today() then raise exception 'Дата действия не может быть в будущем'; end if;
  select * into c from public.campaigns where id = p_campaign for update;
  if c.status = p_status then return jsonb_build_object('id', c.id, 'status', c.status, 'changed', false); end if;
  if p_status in ('paused','finished') and coalesce(trim(p_reason), '') = '' then raise exception 'Укажите причину паузы или завершения'; end if;
  if exists (select 1 from public.ad_status_history h where h.campaign_id = p_campaign and h.creative_id is null and h.effective_on > d) then
    raise exception 'Дата действия раньше последнего изменения статуса — историю задним числом не переписываем';
  end if;
  perform set_config('citadel.bypass', 'on', true);
  update public.campaigns set status = p_status, status_changed_at = now(), status_changed_by = auth.uid(),
    started_on = case when p_status = 'active' then coalesce(started_on, d) else started_on end,
    stopped_on = case when p_status = 'finished' then d when p_status = 'active' then null else stopped_on end
   where id = p_campaign;
  perform set_config('citadel.bypass', 'off', true);
  insert into public.ad_status_history(campaign_id, from_status, to_status, effective_on, reason, actor_id)
  values (p_campaign, c.status, p_status, d, nullif(trim(p_reason), ''), auth.uid());
  perform public.audit('campaign.status', 'campaign', p_campaign::text, jsonb_build_object('from', c.status, 'to', p_status, 'on', d));
  return jsonb_build_object('id', p_campaign, 'status', p_status, 'changed', true);
end $$;

create or replace function public.creative_set_status(p_creative uuid, p_status text, p_effective_on date default null, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare k public.campaign_creatives; d date := coalesce(p_effective_on, public.bishkek_today());
begin
  select * into k from public.campaign_creatives where id = p_creative for update;
  if not found then raise exception 'Креатив не найден'; end if;
  if not public.campaign_can_edit(k.campaign_id) then raise exception 'Недостаточно прав на эту кампанию'; end if;
  if p_status not in ('active','paused','off') then raise exception 'Недопустимый статус'; end if;
  if d > public.bishkek_today() then raise exception 'Дата действия не может быть в будущем'; end if;
  if k.status = p_status then return jsonb_build_object('id', k.id, 'status', k.status, 'changed', false); end if;
  if p_status in ('paused','off') and coalesce(trim(p_reason), '') = '' then raise exception 'Укажите причину паузы или отключения'; end if;
  if exists (select 1 from public.ad_status_history h where h.creative_id = p_creative and h.effective_on > d) then
    raise exception 'Дата действия раньше последнего изменения статуса — историю задним числом не переписываем';
  end if;
  perform set_config('citadel.bypass', 'on', true);
  update public.campaign_creatives set status = p_status, status_changed_at = now(), status_changed_by = auth.uid(),
    pause_reason = case when p_status = 'active' then null else nullif(trim(p_reason), '') end,
    started_on = case when p_status = 'active' then coalesce(started_on, d) else started_on end
   where id = p_creative;
  perform set_config('citadel.bypass', 'off', true);
  insert into public.ad_status_history(campaign_id, creative_id, from_status, to_status, effective_on, reason, actor_id)
  values (k.campaign_id, p_creative, k.status, p_status, d, nullif(trim(p_reason), ''), auth.uid());
  return jsonb_build_object('id', p_creative, 'status', p_status, 'changed', true);
end $$;

-- Новый дневной бюджет действует с указанной даты; прошлые периоды не пересчитываются
create or replace function public.ad_set_daily_budget(p_campaign uuid, p_creative uuid, p_amount bigint, p_effective_from date default null, p_reason text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d date := coalesce(p_effective_from, public.bishkek_today()); cur text; k public.campaign_creatives;
begin
  if not public.campaign_can_edit(p_campaign) then raise exception 'Недостаточно прав на эту кампанию'; end if;
  if p_amount is null or p_amount < 0 then raise exception 'Бюджет не может быть отрицательным'; end if;
  if d > public.bishkek_today() then raise exception 'Дата действия не может быть в будущем'; end if;
  if exists (select 1 from public.ad_budget_history h where h.campaign_id = p_campaign and h.creative_id is not distinct from p_creative and h.effective_from > d) then
    raise exception 'Есть изменение бюджета с более поздней даты — задним числом не меняем';
  end if;
  perform set_config('citadel.bypass', 'on', true);
  if p_creative is null then
    select currency into cur from public.campaigns where id = p_campaign;
    update public.campaigns set daily_budget_minor = p_amount where id = p_campaign;
  else
    select * into k from public.campaign_creatives where id = p_creative and campaign_id = p_campaign;
    if not found then raise exception 'Креатив не относится к кампании'; end if;
    cur := k.currency;
    update public.campaign_creatives set daily_budget_minor = p_amount where id = p_creative;
  end if;
  perform set_config('citadel.bypass', 'off', true);
  insert into public.ad_budget_history(campaign_id, creative_id, daily_budget_minor, currency, effective_from, reason, actor_id)
  values (p_campaign, p_creative, p_amount, cur, d, nullif(trim(p_reason), ''), auth.uid());
  return jsonb_build_object('campaign', p_campaign, 'creative', p_creative, 'daily_budget_minor', p_amount, 'from', d);
end $$;

-- ───────────── RPC: журнал расходов ─────────────
-- p_from_unallocated: расход по видео берётся из уже записанного общего (нераспределённого) расхода этого дня,
-- итог кампании за день не меняется ($20 → $12 + $8, а не $40).
create or replace function public.ad_spend_add(p_campaign uuid, p_creative uuid, p_day date, p_currency text, p_spend bigint,
  p_leads int, p_impressions int, p_clicks int, p_note text, p_key text, p_from_unallocated boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c public.campaigns; k public.campaign_creatives; v_id uuid; cur text; u record; v_rem_spend bigint; v_rem_leads int; v_rem_impr int; v_rem_clicks int;
begin
  if not public.campaign_can_edit(p_campaign) then raise exception 'Недостаточно прав на эту кампанию'; end if;
  if coalesce(trim(p_key), '') = '' then raise exception 'Нет ключа повторной отправки'; end if;
  select id into v_id from public.campaign_spend_entries where campaign_id = p_campaign and idempotency_key = p_key;
  if found then return jsonb_build_object('id', v_id, 'duplicate', true); end if;
  select * into c from public.campaigns where id = p_campaign;
  if p_day is null or p_day > public.bishkek_today() then raise exception 'Дата расхода не может быть в будущем'; end if;
  if coalesce(p_spend, 0) < 0 or coalesce(p_leads, 0) < 0 or coalesce(p_impressions, 0) < 0 or coalesce(p_clicks, 0) < 0 then raise exception 'Значения не могут быть отрицательными'; end if;
  if coalesce(p_spend, 0) = 0 and coalesce(p_leads, 0) = 0 and coalesce(p_impressions, 0) = 0 and coalesce(p_clicks, 0) = 0 then raise exception 'Пустая запись: укажите расход или показатели'; end if;
  cur := upper(coalesce(nullif(trim(p_currency), ''), c.currency));
  if p_creative is not null then
    select * into k from public.campaign_creatives where id = p_creative and campaign_id = p_campaign;
    if not found then raise exception 'Креатив не относится к кампании'; end if;
    if k.currency <> cur then raise exception 'Валюта расхода (%) не совпадает с валютой креатива (%)', cur, k.currency; end if;
  end if;

  if p_from_unallocated and p_creative is not null then
    select coalesce(sum(spend_minor), 0) s, coalesce(sum(leads), 0)::int l, coalesce(sum(impressions), 0)::int i, coalesce(sum(clicks), 0)::int k, count(*) n into u
      from public.campaign_spend_entries
     where campaign_id = p_campaign and day = p_day and currency = cur and creative_id is null and superseded_at is null;
    if u.n = 0 then raise exception 'За % нет общего расхода кампании для распределения', to_char(p_day, 'DD.MM.YYYY'); end if;
    if u.s < coalesce(p_spend, 0) then raise exception 'Нераспределено за день только %.% — меньше указанной суммы', u.s / 100, lpad((u.s % 100)::text, 2, '0'); end if;
    if u.l < coalesce(p_leads, 0) then raise exception 'Обращений в общей записи меньше, чем указано для видео'; end if;
    v_rem_spend := u.s - coalesce(p_spend, 0);
    v_rem_leads := u.l - coalesce(p_leads, 0);
    v_rem_impr := greatest(u.i - coalesce(p_impressions, 0), 0);
    v_rem_clicks := greatest(u.k - coalesce(p_clicks, 0), 0);
    perform set_config('citadel.bypass', 'on', true);
    update public.campaign_spend_entries set superseded_at = now(), superseded_by = auth.uid(), supersede_reason = 'Распределено по креативам'
     where campaign_id = p_campaign and day = p_day and currency = cur and creative_id is null and superseded_at is null;
    perform set_config('citadel.bypass', 'off', true);
    insert into public.campaign_spend_entries(campaign_id, creative_id, day, currency, spend_minor, leads, impressions, clicks, note, source, idempotency_key, created_by)
    values (p_campaign, p_creative, p_day, cur, coalesce(p_spend, 0), coalesce(p_leads, 0), p_impressions, p_clicks, nullif(trim(p_note), ''), 'allocation', p_key, auth.uid())
    returning id into v_id;
    if v_rem_spend > 0 or v_rem_leads > 0 or v_rem_impr > 0 or v_rem_clicks > 0 then
      insert into public.campaign_spend_entries(campaign_id, day, currency, spend_minor, leads, impressions, clicks, note, source, created_by)
      values (p_campaign, p_day, cur, v_rem_spend, v_rem_leads, nullif(v_rem_impr, 0), nullif(v_rem_clicks, 0), 'Остаток после распределения', 'allocation', auth.uid());
    end if;
  else
    insert into public.campaign_spend_entries(campaign_id, creative_id, day, currency, spend_minor, leads, impressions, clicks, note, source, idempotency_key, created_by)
    values (p_campaign, p_creative, p_day, cur, coalesce(p_spend, 0), coalesce(p_leads, 0), p_impressions, p_clicks, nullif(trim(p_note), ''), 'manual', p_key, auth.uid())
    returning id into v_id;
  end if;
  perform public.audit('campaign.spend', 'campaign', p_campaign::text, jsonb_build_object('entry', v_id, 'day', p_day, 'spend', p_spend, 'currency', cur, 'creative', p_creative));
  return jsonb_build_object('id', v_id, 'duplicate', false);
end $$;

-- Исправление: старая запись остаётся в истории (superseded), действует новая; без суммы — аннулирование
create or replace function public.ad_spend_correct(p_entry uuid, p_spend bigint, p_leads int, p_impressions int, p_clicks int, p_note text, p_reason text, p_void boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e public.campaign_spend_entries; v_id uuid;
begin
  select * into e from public.campaign_spend_entries where id = p_entry for update;
  if not found then raise exception 'Запись не найдена'; end if;
  if not public.campaign_can_edit(e.campaign_id) then raise exception 'Недостаточно прав на эту кампанию'; end if;
  if e.superseded_at is not null then raise exception 'Запись уже исправлена — обновите страницу'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Укажите причину исправления'; end if;
  if not p_void and (coalesce(p_spend, 0) < 0 or coalesce(p_leads, 0) < 0 or coalesce(p_impressions, 0) < 0 or coalesce(p_clicks, 0) < 0) then raise exception 'Значения не могут быть отрицательными'; end if;
  perform set_config('citadel.bypass', 'on', true);
  update public.campaign_spend_entries set superseded_at = now(), superseded_by = auth.uid(), supersede_reason = trim(p_reason) where id = p_entry;
  perform set_config('citadel.bypass', 'off', true);
  if not p_void then
    insert into public.campaign_spend_entries(campaign_id, creative_id, day, currency, spend_minor, leads, impressions, clicks, note, source, replaces_id, created_by)
    values (e.campaign_id, e.creative_id, e.day, e.currency, coalesce(p_spend, 0), coalesce(p_leads, 0), p_impressions, p_clicks, coalesce(nullif(trim(p_note), ''), e.note), 'correction', e.id, auth.uid())
    returning id into v_id;
  end if;
  perform public.audit('campaign.spend_correct', 'campaign', e.campaign_id::text,
    jsonb_build_object('entry', p_entry, 'new', v_id, 'old_spend', e.spend_minor, 'new_spend', case when p_void then 0 else p_spend end, 'reason', p_reason));
  return jsonb_build_object('id', coalesce(v_id, p_entry), 'voided', p_void);
end $$;

-- напоминание о плановой проверке: таргетологу, если по активной кампании нет записей дольше регламента
create or replace function public.ad_check_reminders()
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; t date := public.bishkek_today();
begin
  for r in
    select c.id, c.name, c.owner_id, c.check_every_days,
           (select max(day) from public.campaign_spend_entries e where e.campaign_id = c.id and e.superseded_at is null) last_day,
           coalesce(c.started_on, c.created_at::date) since
      from public.campaigns c where c.status = 'active' and c.owner_id is not null
  loop
    if coalesce(r.last_day, r.since) + r.check_every_days <= t then
      perform public.notify_user(r.owner_id, 'campaign.check_due', 'Пора проверить кампанию',
        r.name || ': нет записей с ' || to_char(coalesce(r.last_day, r.since), 'DD.MM') || ' (регламент — каждые ' || r.check_every_days || ' дн.)',
        'campaign', r.id::text, 'normal', 'adcheck:' || r.id || ':' || t);
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;
revoke execute on function public.ad_check_reminders() from public, anon, authenticated;
select cron.schedule('citadel-ad-checks', '0 4 * * *', $$select public.ad_check_reminders();$$);

-- ───────────── RLS ─────────────
alter table public.campaign_creatives enable row level security;
alter table public.ad_status_history enable row level security;
alter table public.ad_budget_history enable row level security;
alter table public.ad_change_log enable row level security;
alter table public.campaign_spend_entries enable row level security;

drop policy if exists camp_read on public.campaigns;
drop policy if exists camp_write on public.campaigns;
drop policy if exists camp_update on public.campaigns;
create policy camp_read on public.campaigns for select to authenticated using (
  public.is_active() and (owner_id = auth.uid() or public.has_perm('campaigns.view_all') or public.can_manage_project(project_id)
    or (public.has_perm('campaigns.manage') and public.is_project_member(project_id))));
create policy camp_write on public.campaigns for insert to authenticated with check (
  public.has_perm('campaigns.manage') and created_by = auth.uid()
  and (public.can_manage_project(project_id) or public.has_perm('campaigns.view_all') or public.is_project_member(project_id)));
create policy camp_update on public.campaigns for update to authenticated using (public.campaign_can_edit(id)) with check (public.campaign_can_edit(id));

-- старые метрики — только чтение
drop policy if exists cm_write on public.campaign_metrics;
drop policy if exists cm_update on public.campaign_metrics;
drop policy if exists cm_read on public.campaign_metrics;
create policy cm_read on public.campaign_metrics for select to authenticated using (public.campaign_can_view(campaign_id));

create policy cr_read on public.campaign_creatives for select to authenticated using (public.campaign_can_view(campaign_id));
create policy cr_insert on public.campaign_creatives for insert to authenticated with check (public.campaign_can_edit(campaign_id) and created_by = auth.uid());
create policy cr_update on public.campaign_creatives for update to authenticated using (public.campaign_can_edit(campaign_id)) with check (public.campaign_can_edit(campaign_id));
create policy ash_read on public.ad_status_history for select to authenticated using (public.campaign_can_view(campaign_id));
create policy abh_read on public.ad_budget_history for select to authenticated using (public.campaign_can_view(campaign_id));
create policy acl_read on public.ad_change_log for select to authenticated using (public.campaign_can_view(campaign_id));
create policy spend_read on public.campaign_spend_entries for select to authenticated using (public.campaign_can_view(campaign_id));
-- записи расходов, истории и журнала создаются только RPC/триггерами (security definer)

-- таргетолог назначенного проекта видит карточку клиента этого проекта
drop policy if exists clients_read on public.clients;
create policy clients_read on public.clients for select to authenticated using (
  public.has_perm('clients.view') or manager_id = auth.uid() or public.has_perm('clients.manage')
  or exists (select 1 from public.projects p where p.client_id = clients.id and public.is_ad_member(p.id)));

-- секреты: добавлять и удалять — только в проекте, который сотрудник видит
create or replace function public.secret_create(p_project uuid, p_label text, p_platform text, p_login_hint text, p_value text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_vault uuid; v_id uuid;
begin
  if not public.has_perm('credentials.manage') or not public.can_view_project(p_project) then raise exception 'Нет права credentials.manage на этот проект'; end if;
  if not public.recent_password_auth(900) then raise exception 'REAUTH_REQUIRED'; end if;
  if coalesce(trim(p_value), '') = '' then raise exception 'Пустое значение'; end if;
  v_vault := vault.create_secret(p_value, 'citadel_' || gen_random_uuid()::text, p_label);
  insert into public.project_secrets(project_id, label, platform, login_hint, vault_secret_id, created_by)
  values (p_project, p_label, p_platform, p_login_hint, v_vault, auth.uid()) returning id into v_id;
  perform public.audit('secret.create', 'project', p_project::text, jsonb_build_object('secret', v_id, 'label', p_label));
  return v_id;
end $$;

create or replace function public.secret_delete(p_secret uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s public.project_secrets;
begin
  select * into s from public.project_secrets where id = p_secret;
  if not found then raise exception 'Не найдено'; end if;
  if not public.has_perm('credentials.manage') or not public.can_view_project(s.project_id) then raise exception 'Нет прав'; end if;
  delete from vault.secrets where id = s.vault_secret_id;
  delete from public.project_secrets where id = p_secret;
  perform public.audit('secret.delete', 'project', s.project_id::text, jsonb_build_object('secret', p_secret));
end $$;

revoke execute on function public.campaign_set_status(uuid, text, date, text) from public, anon;
revoke execute on function public.creative_set_status(uuid, text, date, text) from public, anon;
revoke execute on function public.ad_set_daily_budget(uuid, uuid, bigint, date, text) from public, anon;
revoke execute on function public.ad_spend_add(uuid, uuid, date, text, bigint, int, int, int, text, text, boolean) from public, anon;
revoke execute on function public.ad_spend_correct(uuid, bigint, int, int, int, text, text, boolean) from public, anon;
grant execute on function public.campaign_set_status(uuid, text, date, text) to authenticated;
grant execute on function public.creative_set_status(uuid, text, date, text) to authenticated;
grant execute on function public.ad_set_daily_budget(uuid, uuid, bigint, date, text) to authenticated;
grant execute on function public.ad_spend_add(uuid, uuid, date, text, bigint, int, int, int, text, text, boolean) to authenticated;
grant execute on function public.ad_spend_correct(uuid, bigint, int, int, int, text, text, boolean) to authenticated;
revoke execute on function public.campaigns_guard() from public, anon, authenticated;
revoke execute on function public.campaigns_after() from public, anon, authenticated;
revoke execute on function public.creatives_guard() from public, anon, authenticated;
revoke execute on function public.creatives_after() from public, anon, authenticated;

