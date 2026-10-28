-- Цитадель · 0002 · публичный сайт (CMS), тарифы, лиды/CRM, клиенты

-- ───────────── CMS ─────────────
create table public.site_blocks (
  key text primary key,
  type text not null check (type in ('hero','benefits','services','tariffs','cases','team','faq','contacts','cta')),
  sort int not null default 100,
  visible boolean not null default true,
  draft jsonb not null default '{}',
  published jsonb,
  published_at timestamptz,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
create table public.site_versions (
  id bigint generated always as identity primary key,
  snapshot jsonb not null,
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create table public.site_settings (
  id int primary key default 1 check (id = 1),
  seo_title text not null default 'SMM KADR — продвижение, продакшн и таргет в Бишкеке',
  seo_description text not null default 'Агентство SMM KADR: стратегия, съёмка Reels, сторис, таргетированная реклама.',
  phone text, email text, address text, instagram text, telegram text, whatsapp text,
  updated_at timestamptz not null default now()
);

-- Публикация: снимок всех блоков в версии, черновик → опубликовано
create or replace function public.publish_site(p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('cms.manage') then raise exception 'Нет права cms.manage'; end if;
  update public.site_blocks set published = draft, published_at = now(), updated_by = auth.uid() where true;
  insert into public.site_versions(snapshot, note, created_by)
  select jsonb_agg(to_jsonb(b) order by b.sort), p_note, auth.uid() from public.site_blocks b;
  perform public.audit('site.publish', 'site', null, jsonb_build_object('note', p_note));
end $$;

create or replace function public.restore_site_version(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare s jsonb; b jsonb;
begin
  if not public.has_perm('cms.manage') then raise exception 'Нет права cms.manage'; end if;
  select snapshot into s from public.site_versions where id = p_id;
  if s is null then raise exception 'Версия не найдена'; end if;
  for b in select * from jsonb_array_elements(s) loop
    update public.site_blocks set draft = coalesce(b->'published', b->'draft'), sort = (b->>'sort')::int,
      visible = (b->>'visible')::boolean, updated_by = auth.uid(), updated_at = now()
    where key = b->>'key';
  end loop;
  perform public.audit('site.restore_draft', 'site', p_id::text, null);
end $$;

-- ───────────── тарифы ─────────────
create table public.tariffs (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  is_public boolean not null default true,
  price_on_request boolean not null default false,
  sort int not null default 100,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.tariff_versions (
  id uuid primary key default gen_random_uuid(),
  tariff_id uuid not null references public.tariffs(id) on delete cascade,
  version int not null,
  price_minor bigint not null check (price_minor >= 0),
  currency text not null default 'KGS',
  period_type text not null check (period_type in ('one_time','monthly','yearly')),
  period_months int not null default 1,
  composition jsonb not null default '{}', -- {"video":5,"story":0,"post":0,"carousel":0,"shoot":null,...}
  stories_method text check (stories_method in ('fixed_per_period','four_each_calendar_day')),
  description text,
  notes text,
  is_current boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (tariff_id, version)
);
create unique index tariff_versions_current on public.tariff_versions(tariff_id) where is_current;

-- Новая версия тарифа: прошлые заказы ссылаются на свою версию и не меняются
create or replace function public.new_tariff_version(p_tariff uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_ver int;
begin
  if not public.has_perm('tariffs.manage') then raise exception 'Нет права tariffs.manage'; end if;
  select coalesce(max(version),0)+1 into v_ver from public.tariff_versions where tariff_id = p_tariff;
  update public.tariff_versions set is_current = false where tariff_id = p_tariff and is_current;
  insert into public.tariff_versions(tariff_id, version, price_minor, currency, period_type, period_months, composition,
     stories_method, description, notes, created_by)
  values (p_tariff, v_ver, (p->>'price_minor')::bigint, coalesce(p->>'currency','KGS'), p->>'period_type',
     coalesce((p->>'period_months')::int, 1), coalesce(p->'composition','{}'), nullif(p->>'stories_method',''),
     p->>'description', p->>'notes', auth.uid())
  returning id into v_id;
  perform public.audit('tariff.version', 'tariff', p_tariff::text, p);
  return v_id;
end $$;

-- Опубликованный прайс для сайта: только публичные тарифы и текущие версии
create or replace function public.public_tariffs()
returns table (id uuid, code text, name text, sort int, price_on_request boolean, price_minor bigint, currency text,
  period_type text, period_months int, composition jsonb, description text, stories_method text)
language sql stable security definer set search_path = public as $$
  select t.id, t.code, t.name, t.sort, t.price_on_request,
         case when t.price_on_request then null else v.price_minor end,
         v.currency, v.period_type, v.period_months, v.composition, v.description, v.stories_method
    from public.tariffs t join public.tariff_versions v on v.tariff_id = t.id and v.is_current
   where t.is_public and t.archived_at is null
   order by t.sort;
$$;
grant execute on function public.public_tariffs() to anon, authenticated;

-- ───────────── клиенты ─────────────
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  contact_name text,
  phone text,
  email text,
  niche text,
  address text,
  socials jsonb not null default '{}',
  source text,
  notes text,
  manager_id uuid references public.profiles(id),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create trigger clients_touch before update on public.clients for each row execute function public.touch_updated_at();

-- ───────────── лиды / CRM ─────────────
create type public.lead_stage as enum ('new','contacted','qualified','proposal','negotiation','contract','awaiting_payment','won','lost');
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity,
  name text not null,
  phone text not null,
  email text,
  business text,
  service text,
  comment text,
  preferred_time text,
  consent boolean not null,
  source text not null default 'site',
  utm jsonb not null default '{}',
  ip_hash text,
  idempotency_key text unique,
  stage public.lead_stage not null default 'new',
  assignee_id uuid references public.profiles(id),
  client_id uuid references public.clients(id),
  tariff_id uuid references public.tariffs(id),
  expected_minor bigint,
  next_action text,
  next_action_at timestamptz,
  lost_reason text,
  first_opened_by uuid references public.profiles(id),
  first_opened_at timestamptz,
  taken_at timestamptz,
  first_response_at timestamptz,
  escalated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index leads_stage_idx on public.leads(stage, created_at desc);
create index leads_phone_idx on public.leads(phone, created_at desc);
create trigger leads_touch before update on public.leads for each row execute function public.touch_updated_at();

create table public.lead_events (
  id bigint generated always as identity primary key,
  lead_id uuid not null references public.leads(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  kind text not null, -- created, stage, comment, call, assign, opened, converted
  data jsonb,
  created_at timestamptz not null default now()
);
create index lead_events_lead_idx on public.lead_events(lead_id, created_at);

-- Публичная отправка формы: валидация, honeypot, rate limit, идемпотентность, атомарная запись лида + уведомлений
create or replace function public.submit_lead(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_key text := nullif(p->>'idempotency_key',''); v_phone text; v_ip text := nullif(p->>'ip_hash','');
begin
  if coalesce(p->>'website','') <> '' then return jsonb_build_object('ok', true); end if; -- honeypot: молча игнор
  if v_key is not null then
    select id into v_id from public.leads where idempotency_key = v_key;
    if found then return jsonb_build_object('ok', true, 'id', v_id, 'duplicate', true); end if;
  end if;
  v_phone := regexp_replace(coalesce(p->>'phone',''), '[^0-9+]', '', 'g');
  if length(trim(coalesce(p->>'name',''))) < 2 or length(p->>'name') > 120 then raise exception 'Укажите имя'; end if;
  if length(v_phone) < 9 or length(v_phone) > 16 then raise exception 'Укажите корректный телефон'; end if;
  if coalesce((p->>'consent')::boolean, false) is not true then raise exception 'Нужно согласие на обработку данных'; end if;
  if length(coalesce(p->>'comment','')) > 2000 then raise exception 'Комментарий слишком длинный'; end if;
  if coalesce(p->>'email','') <> '' and p->>'email' !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Некорректный email'; end if;
  -- лимиты частоты
  if v_ip is not null and (select count(*) from public.leads where ip_hash = v_ip and created_at > now() - interval '10 minutes') >= 5 then
    raise exception 'Слишком много заявок, попробуйте позже'; end if;
  if (select count(*) from public.leads where phone = v_phone and created_at > now() - interval '10 minutes') >= 3 then
    raise exception 'Заявка с этим номером уже получена'; end if;
  if (select count(*) from public.leads where created_at > now() - interval '1 minute') >= 30 then
    raise exception 'Сервис перегружен, попробуйте через минуту'; end if;

  insert into public.leads(name, phone, email, business, service, comment, preferred_time, consent, source, utm, ip_hash, idempotency_key)
  values (trim(p->>'name'), v_phone, nullif(trim(coalesce(p->>'email','')),''), left(nullif(p->>'business',''),200),
    left(nullif(p->>'service',''),120), nullif(p->>'comment',''), left(nullif(p->>'preferred_time',''),120), true,
    coalesce(nullif(p->>'source',''),'site'), coalesce(p->'utm','{}'), v_ip, v_key)
  returning id into v_id;
  insert into public.lead_events(lead_id, kind, data) values (v_id, 'created', jsonb_build_object('source', coalesce(p->>'source','site')));
  perform public.notify_perm('leads.receive', 'lead.new', 'Новая заявка с сайта',
    trim(p->>'name') || coalesce(' · ' || nullif(p->>'service',''), '') || ' · ' || v_phone,
    'lead', v_id::text, 'critical', 'lead:' || v_id);
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;
revoke execute on function public.submit_lead(jsonb) from public;
grant execute on function public.submit_lead(jsonb) to anon, authenticated;

-- Смена стадии с историей
create or replace function public.lead_set_stage(p_lead uuid, p_stage public.lead_stage, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare l public.leads;
begin
  select * into l from public.leads where id = p_lead for update;
  if not found then raise exception 'Лид не найден'; end if;
  if not (public.has_perm('leads.manage') or (public.has_perm('leads.view') and l.assignee_id = auth.uid())) then
    raise exception 'Нет прав на изменение лида (возьмите его в работу)'; end if;
  if p_stage = 'lost' and coalesce(trim(p_note),'') = '' then raise exception 'Укажите причину отказа'; end if;
  update public.leads set stage = p_stage,
     lost_reason = case when p_stage = 'lost' then p_note else lost_reason end,
     first_response_at = case when first_response_at is null and p_stage <> 'new' then now() else first_response_at end
   where id = p_lead;
  insert into public.lead_events(lead_id, actor_id, kind, data)
  values (p_lead, auth.uid(), 'stage', jsonb_build_object('from', l.stage, 'to', p_stage, 'note', p_note));
end $$;

create or replace function public.lead_take(p_lead uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('leads.view') and not public.has_perm('leads.manage') then raise exception 'Нет прав'; end if;
  update public.leads set assignee_id = coalesce(assignee_id, auth.uid()), taken_at = coalesce(taken_at, now())
   where id = p_lead and (assignee_id is null or assignee_id = auth.uid() or public.has_perm('leads.manage'));
  if not found then raise exception 'Лид уже взят другим менеджером'; end if;
  insert into public.lead_events(lead_id, actor_id, kind) values (p_lead, auth.uid(), 'assign');
end $$;

create or replace function public.lead_mark_opened(p_lead uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.has_perm('leads.view') or public.has_perm('leads.manage') or public.has_perm('leads.receive')) then return; end if;
  update public.leads set first_opened_by = auth.uid(), first_opened_at = now() where id = p_lead and first_opened_at is null;
  if found then insert into public.lead_events(lead_id, actor_id, kind) values (p_lead, auth.uid(), 'opened'); end if;
end $$;

-- Конвертация лида в клиента без дублей
create or replace function public.lead_convert(p_lead uuid, p_company text)
returns uuid language plpgsql security definer set search_path = public as $$
declare l public.leads; v_client uuid;
begin
  if not public.has_perm('clients.manage') then raise exception 'Нет права clients.manage'; end if;
  select * into l from public.leads where id = p_lead for update;
  if l.client_id is not null then return l.client_id; end if;
  select id into v_client from public.clients where phone = l.phone and archived_at is null limit 1;
  if v_client is null then
    insert into public.clients(company_name, contact_name, phone, email, niche, source, manager_id, created_by)
    values (coalesce(nullif(p_company,''), l.business, l.name), l.name, l.phone, l.email, l.business, l.source,
            coalesce(l.assignee_id, auth.uid()), auth.uid())
    returning id into v_client;
  end if;
  update public.leads set client_id = v_client where id = p_lead;
  insert into public.lead_events(lead_id, actor_id, kind, data) values (p_lead, auth.uid(), 'converted', jsonb_build_object('client_id', v_client));
  return v_client;
end $$;

-- ───────────── RLS ─────────────
alter table public.site_blocks enable row level security;
alter table public.site_versions enable row level security;
alter table public.site_settings enable row level security;
alter table public.tariffs enable row level security;
alter table public.tariff_versions enable row level security;
alter table public.clients enable row level security;
alter table public.leads enable row level security;
alter table public.lead_events enable row level security;

create policy site_public_read on public.site_blocks for select to anon, authenticated using (true);
create policy site_write on public.site_blocks for update to authenticated using (public.has_perm('cms.manage')) with check (public.has_perm('cms.manage'));
create policy site_versions_read on public.site_versions for select to authenticated using (public.has_perm('cms.manage'));
create policy site_settings_read on public.site_settings for select to anon, authenticated using (true);
create policy site_settings_write on public.site_settings for update to authenticated using (public.has_perm('cms.manage')) with check (public.has_perm('cms.manage'));

create policy tariffs_read on public.tariffs for select to authenticated using (public.is_active());
create policy tariffs_write on public.tariffs for all to authenticated using (public.has_perm('tariffs.manage')) with check (public.has_perm('tariffs.manage'));
create policy tv_read on public.tariff_versions for select to authenticated using (public.has_perm('prices.view') or public.has_perm('tariffs.manage'));

create policy clients_read on public.clients for select to authenticated using (public.has_perm('clients.view') or manager_id = auth.uid() or public.has_perm('clients.manage'));
create policy clients_write on public.clients for insert to authenticated with check (public.has_perm('clients.manage'));
create policy clients_update on public.clients for update to authenticated using (public.has_perm('clients.manage')) with check (public.has_perm('clients.manage'));

create policy leads_read on public.leads for select to authenticated
  using (public.has_perm('leads.manage') or public.has_perm('leads.receive') or (public.has_perm('leads.view') and (assignee_id = auth.uid() or assignee_id is null)));
create policy leads_update on public.leads for update to authenticated
  using (public.has_perm('leads.manage') or (public.has_perm('leads.view') and assignee_id = auth.uid()))
  with check (public.has_perm('leads.manage') or (public.has_perm('leads.view') and assignee_id = auth.uid()));
create policy lead_events_read on public.lead_events for select to authenticated
  using (exists (select 1 from public.leads l where l.id = lead_id));
create policy lead_events_insert on public.lead_events for insert to authenticated
  with check (actor_id = auth.uid() and kind in ('comment','call') and exists (select 1 from public.leads l where l.id = lead_id));
