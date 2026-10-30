-- 0018. SMM KADR: мастер «Добавить проект» (клиент + проект одной транзакцией), база клиентов без дублей,
-- заявки с сайта с тарифом и подробным уведомлением.
-- Только добавления: новые колонки и функции. Существующие данные не удаляются.

-- ───────────── телефоны ─────────────
-- Приводит номер к виду +996XXXXXXXXX (Кыргызстан) или +<код><номер> (международный).
create or replace function public.normalize_phone(p text)
returns text language plpgsql immutable set search_path = public as $$
declare d text := regexp_replace(coalesce(p, ''), '\D', '', 'g'); plus boolean := btrim(coalesce(p, '')) like '+%';
begin
  if d = '' then return null; end if;
  if not plus then
    if length(d) = 9 then return '+996' || d; end if;
    if length(d) = 10 and left(d, 1) = '0' then return '+996' || substr(d, 2); end if;
    if length(d) = 12 and left(d, 3) = '996' then return '+' || d; end if;
  end if;
  if length(d) between 10 and 15 then return '+' || d; end if;
  raise exception 'Некорректный номер телефона: укажите +996 XXX XXX XXX или международный номер с кодом страны';
end $$;

-- Ключ сравнения номеров: последние 9 цифр (0555…, 555…, +996555… — один клиент)
create or replace function public.phone_key(p text)
returns text language sql immutable set search_path = public as $$
  select nullif(right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 9), '');
$$;

alter table public.clients add column if not exists whatsapp text;
alter table public.clients add column if not exists phone_key text generated always as (public.phone_key(phone)) stored;
create index if not exists clients_phone_key_idx on public.clients(phone_key) where archived_at is null;
create index if not exists clients_company_lower_idx on public.clients(lower(company_name)) where archived_at is null;

alter table public.projects add column if not exists idempotency_key text;
alter table public.projects add column if not exists niche text;
create unique index if not exists projects_idempotency_key_idx on public.projects(idempotency_key) where idempotency_key is not null;

-- ───────────── поиск клиента в мастере ─────────────
create or replace function public.client_lookup(p_q text)
returns table (id uuid, company_name text, contact_name text, phone text, whatsapp text, niche text, socials jsonb,
  address text, source text, notes text, projects int, match text)
language sql stable security definer set search_path = public as $$
  with q as (select btrim(coalesce(p_q, '')) s, regexp_replace(coalesce(p_q, ''), '\D', '', 'g') d)
  select c.id, c.company_name, c.contact_name, c.phone, c.whatsapp, c.niche, c.socials, c.address, c.source, c.notes,
         (select count(*) from public.projects pr where pr.client_id = c.id)::int,
         case when length(q.d) >= 6 and c.phone_key = public.phone_key(q.d) then 'phone' else 'name' end
    from public.clients c, q
   where c.archived_at is null
     and (public.has_perm('projects.create') or public.has_perm('clients.view') or public.has_perm('clients.manage'))
     and length(q.s) >= 2
     and ((length(q.d) >= 6 and (c.phone_key = public.phone_key(q.d) or regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') like '%' || q.d || '%'))
          or c.company_name ilike '%' || q.s || '%' or c.contact_name ilike '%' || q.s || '%')
   order by (length(q.d) >= 6 and c.phone_key = public.phone_key(q.d)) desc, c.company_name
   limit 8;
$$;
revoke execute on function public.client_lookup(text) from public, anon;
grant execute on function public.client_lookup(text) to authenticated;

-- ───────────── мастер проекта: всё в одной транзакции ─────────────
-- Клиент (новый или выбранный) → проект (draft) → договор со снимком тарифа → команда → счета → заявленный платёж (pending).
-- Запуск в производство по-прежнему только через launch_project (100% подтверждённой оплаты или исключение с правом).
create or replace function public.project_wizard_create(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v_key text := nullif(btrim(coalesce(p->>'idempotency_key', '')), '');
  c jsonb := coalesce(p->'client', '{}');
  v_client uuid := nullif(p->>'client_id', '')::uuid;
  v_client_created boolean := false;
  v_phone text; v_wa text; v_socials jsonb; v_dup record; v_ex record; r record;
  v_project uuid; v_name text; v_kind text := coalesce(nullif(p->>'kind', ''), 'monthly');
  v_tv uuid := nullif(p->>'tariff_version_id', '')::uuid; v_snap jsonb; v_comp jsonb := '{}';
  v_price bigint; v_cur text := coalesce(nullif(p->>'currency', ''), 'KGS');
  v_paid bigint := coalesce(nullif(p->>'paid_minor', '')::bigint, 0);
  v_due date; v_next date; v_inv uuid; v_inv2 uuid; v_pay uuid;
  v_admin uuid := nullif(p->>'admin_id', '')::uuid; v_manager uuid := nullif(p->>'manager_id', '')::uuid;
  v_cd uuid := nullif(p->>'creative_director_id', '')::uuid; v_pd uuid := nullif(p->>'planning_director_id', '')::uuid;
  v_sm text;
begin
  if uid is null or not public.is_active() then raise exception 'Требуется активный вход'; end if;
  if not public.has_perm('projects.create') then raise exception 'Недостаточно прав: нужно право projects.create'; end if;
  if v_key is null then raise exception 'Нет ключа операции — обновите страницу и повторите'; end if;

  -- идемпотентность: повторное нажатие/повтор запроса возвращает уже созданный проект
  perform pg_advisory_xact_lock(hashtext('project_wizard:' || v_key));
  select id, client_id into v_ex from public.projects where idempotency_key = v_key;
  if found then return jsonb_build_object('ok', true, 'project_id', v_ex.id, 'client_id', v_ex.client_id, 'repeat', true); end if;

  -- ── 1. клиент ──
  select coalesce(jsonb_object_agg(key, btrim(value)), '{}') into v_socials
    from jsonb_each_text(coalesce(c->'socials', '{}')) where btrim(value) <> '' and key in ('instagram', 'tiktok', 'facebook', 'telegram', 'youtube', 'website');
  if v_client is not null then
    if not exists (select 1 from public.clients where id = v_client and archived_at is null) then raise exception 'Клиент не найден в базе'; end if;
    -- профиль существующего клиента меняется только явно (флажок «обновить данные клиента»)
    if coalesce((p->>'update_client')::boolean, false) then
      if not public.has_perm('clients.manage') then raise exception 'Обновлять профиль клиента может сотрудник с правом clients.manage'; end if;
      v_phone := public.normalize_phone(nullif(c->>'phone', ''));
      v_wa := public.normalize_phone(nullif(c->>'whatsapp', ''));
      if v_phone is not null and exists (select 1 from public.clients where phone_key = public.phone_key(v_phone) and id <> v_client and archived_at is null) then
        raise exception 'Этот номер уже принадлежит другому клиенту в базе';
      end if;
      update public.clients set
        contact_name = coalesce(nullif(btrim(c->>'contact_name'), ''), contact_name),
        company_name = coalesce(nullif(btrim(c->>'company_name'), ''), company_name),
        phone = coalesce(v_phone, phone), whatsapp = coalesce(v_wa, whatsapp),
        niche = coalesce(nullif(btrim(c->>'niche'), ''), niche),
        address = coalesce(nullif(btrim(c->>'address'), ''), address),
        source = coalesce(nullif(btrim(c->>'source'), ''), source),
        socials = socials || v_socials
       where id = v_client;
      perform public.audit('client.update', 'client', v_client::text, c - 'notes');
    end if;
  else
    if length(btrim(coalesce(c->>'contact_name', ''))) < 2 then raise exception 'Укажите ФИО контактного лица'; end if;
    v_phone := public.normalize_phone(nullif(c->>'phone', ''));
    if v_phone is null then raise exception 'Укажите номер телефона клиента'; end if;
    v_wa := coalesce(public.normalize_phone(nullif(c->>'whatsapp', '')), case when coalesce((c->>'whatsapp_same')::boolean, false) then v_phone end);
    if not coalesce((p->>'force_new_client')::boolean, false) then
      select id, company_name, contact_name into v_dup from public.clients where phone_key = public.phone_key(v_phone) and archived_at is null limit 1;
      if found then
        return jsonb_build_object('ok', false, 'duplicate_client', jsonb_build_object('id', v_dup.id, 'company_name', v_dup.company_name, 'contact_name', v_dup.contact_name));
      end if;
    end if;
    insert into public.clients(company_name, contact_name, phone, whatsapp, niche, address, socials, source, notes, manager_id, created_by)
    values (coalesce(nullif(btrim(c->>'company_name'), ''), btrim(c->>'contact_name')), btrim(c->>'contact_name'), v_phone, v_wa,
            nullif(btrim(c->>'niche'), ''), nullif(btrim(c->>'address'), ''), v_socials, nullif(btrim(c->>'source'), ''),
            left(nullif(btrim(c->>'notes'), ''), 2000), coalesce(v_manager, uid), uid)
    returning id into v_client;
    v_client_created := true;
  end if;

  -- ── 2. проект и условия ──
  if v_kind not in ('one_time', 'monthly', 'yearly', 'custom', 'one_time_shoot') then raise exception 'Неизвестный тип проекта'; end if;
  if v_cur not in ('KGS', 'USD') then raise exception 'Валюта договора: KGS или USD'; end if;
  v_name := coalesce(nullif(btrim(p->>'name'), ''), (select company_name from public.clients where id = v_client));
  if v_tv is not null then
    select to_jsonb(v) || jsonb_build_object('tariffs', jsonb_build_object('name', t.name, 'code', t.code), 'snapshot_at', now())
      into v_snap from public.tariff_versions v join public.tariffs t on t.id = v.tariff_id where v.id = v_tv;
    if v_snap is null then raise exception 'Версия тарифа не найдена'; end if;
  end if;
  for r in select key, value from jsonb_each_text(coalesce(p->'composition', '{}')) loop
    if r.key in ('video', 'story', 'post', 'carousel', 'ad_creative', 'shoot') and r.value ~ '^\d{1,5}$' and r.value::int > 0 then
      v_comp := v_comp || jsonb_build_object(r.key, r.value::int);
    end if;
  end loop;
  if v_comp = '{}'::jsonb and v_snap is not null then v_comp := coalesce(v_snap->'composition', '{}'); end if;
  v_price := coalesce(nullif(p->>'price_minor', '')::bigint, (v_snap->>'price_minor')::bigint);
  if v_price is null or v_price < 0 then raise exception 'Укажите стоимость договора'; end if;
  if v_price > 0 and not (public.has_perm('prices.view') or public.has_perm('finance.view')) then raise exception 'Нет права видеть и задавать цены (prices.view)'; end if;
  if v_paid < 0 then raise exception 'Сумма оплаты не может быть отрицательной'; end if;
  if v_paid > v_price then raise exception 'Заявленная оплата больше стоимости договора'; end if;
  if v_paid > 0 and not public.has_perm('payments.create') then raise exception 'Вносить оплату может сотрудник с правом payments.create'; end if;
  v_sm := coalesce(nullif(p->>'stories_method', ''), v_snap->>'stories_method');
  if v_sm is not null and v_sm not in ('fixed_per_period', 'four_each_calendar_day') then raise exception 'Неизвестный метод сторис'; end if;
  for r in select x from unnest(array[v_admin, v_manager, v_cd, v_pd]) x where x is not null loop
    if not public.is_active(r.x) then raise exception 'Назначенный сотрудник не активен'; end if;
  end loop;

  insert into public.projects(name, client_id, lead_id, kind, status, tariff_version_id, contract_start, contract_end, work_start,
    platforms, wishes, socials, stories_method, requires_publication, admin_id, manager_id, planning_director_id, creative_director_id,
    niche, idempotency_key, created_by)
  values (v_name, v_client, nullif(p->>'lead_id', '')::uuid, v_kind::public.project_kind, 'draft', v_tv,
    nullif(p->>'contract_start', '')::date, nullif(p->>'contract_end', '')::date, nullif(p->>'work_start', '')::date,
    coalesce((select array_agg(x) from jsonb_array_elements_text(p->'platforms') x where x in ('instagram', 'tiktok', 'facebook', 'youtube', 'telegram')), '{instagram}'),
    left(nullif(btrim(p->>'wishes'), ''), 4000), v_socials, v_sm, coalesce((p->>'requires_publication')::boolean, true),
    v_admin, coalesce(v_manager, uid), v_pd, v_cd, nullif(btrim(p->>'niche'), ''), v_key, uid)
  returning id into v_project;

  -- снимок тарифа: изменение публичного прайса завтра не меняет этот договор
  insert into public.project_contracts(project_id, price_minor, currency, tariff_snapshot, composition, extra_services, payment_terms)
  values (v_project, v_price, v_cur, v_snap, v_comp, left(nullif(btrim(p->>'extra_services'), ''), 1000), left(nullif(btrim(p->>'payment_terms'), ''), 2000));

  -- ── 3. команда ──
  for r in select (m->>'user_id')::uuid uid2, coalesce(nullif(m->>'role', ''), 'member') role2 from jsonb_array_elements(coalesce(p->'team', '[]')) m loop
    if r.role2 not in ('member', 'targetologist', 'mobilographer', 'designer', 'scriptwriter', 'editor', 'ambassador', 'marketer') then raise exception 'Неизвестная роль в проекте: %', r.role2; end if;
    if not public.is_active(r.uid2) then raise exception 'Назначенный сотрудник не активен'; end if;
    insert into public.project_members(project_id, user_id, role) values (v_project, r.uid2, r.role2) on conflict do nothing;
    perform public.notify_user(r.uid2, 'project.member', 'Вас добавили в проект', v_name, 'project', v_project::text, 'normal', 'pm:' || v_project || ':' || r.uid2);
  end loop;
  if v_admin is not null then
    perform public.notify_user(v_admin, 'project.assigned', 'Вы — администратор проекта', v_name, 'project', v_project::text, 'high', 'padm:' || v_project);
  else
    -- администратора можно назначить позже — создаём напоминание автору
    insert into public.tasks(project_id, title, description, type, priority, assignee_id, created_by, due_at)
    values (v_project, 'Назначить администратора проекта «' || v_name || '»',
      'Проект создан без администратора. Без него проект нельзя допустить к производству.', 'general', 'high', uid, uid, now() + interval '1 day');
  end if;

  -- ── 4. счета и заявленная оплата (только pending — в кассу попадает после независимого подтверждения) ──
  if v_price > 0 then
    v_due := coalesce(nullif(p->>'first_due', '')::date, nullif(p->>'contract_start', '')::date, current_date);
    v_next := nullif(p->>'next_payment_on', '')::date;
    if v_paid > 0 and v_paid < v_price then
      insert into public.invoices(project_id, title, amount_minor, currency, due_on, created_by)
      values (v_project, 'Предоплата по договору', v_paid, v_cur, least(v_due, current_date), uid) returning id into v_inv;
      insert into public.invoices(project_id, title, amount_minor, currency, due_on, created_by)
      values (v_project, 'Остаток по договору', v_price - v_paid, v_cur, coalesce(v_next, v_due), uid) returning id into v_inv2;
    else
      insert into public.invoices(project_id, title, amount_minor, currency, due_on, created_by)
      values (v_project, 'Оплата по договору', v_price, v_cur, coalesce(v_next, v_due), uid) returning id into v_inv;
    end if;
    if v_paid > 0 then
      insert into public.payments(invoice_id, project_id, kind, amount_minor, currency, paid_on, method, note, status, created_by)
      values (v_inv, v_project, 'payment', v_paid, v_cur, coalesce(nullif(p->>'paid_on', '')::date, current_date),
        nullif(btrim(p->>'paid_method'), ''), 'Заявлено при создании проекта', 'pending', uid)
      returning id into v_pay;
    end if;
  end if;

  -- ── 5. связь с заявкой ──
  if nullif(p->>'lead_id', '') is not null then
    update public.leads set client_id = coalesce(client_id, v_client) where id = (p->>'lead_id')::uuid;
    insert into public.lead_events(lead_id, actor_id, kind, data)
    select (p->>'lead_id')::uuid, uid, 'converted', jsonb_build_object('client_id', v_client, 'project_id', v_project)
     where exists (select 1 from public.leads where id = (p->>'lead_id')::uuid);
  end if;

  perform public.audit('project.create_wizard', 'project', v_project::text, jsonb_build_object(
    'client_id', v_client, 'client_created', v_client_created, 'tariff_version_id', v_tv, 'kind', v_kind,
    'price_minor', v_price, 'currency', v_cur, 'declared_paid_minor', v_paid));
  return jsonb_build_object('ok', true, 'project_id', v_project, 'client_id', v_client, 'client_created', v_client_created,
    'payment_id', v_pay, 'invoice_id', v_inv, 'invoice2_id', v_inv2);
end $$;
revoke execute on function public.project_wizard_create(jsonb) from public, anon;
grant execute on function public.project_wizard_create(jsonb) to authenticated;

-- конвертация заявки: дубли ищем по ключу телефона, а не по точному совпадению строки
create or replace function public.lead_convert(p_lead uuid, p_company text)
returns uuid language plpgsql security definer set search_path = public as $$
declare l public.leads; v_client uuid;
begin
  if not public.has_perm('clients.manage') then raise exception 'Нет права clients.manage'; end if;
  select * into l from public.leads where id = p_lead for update;
  if l.client_id is not null then return l.client_id; end if;
  select id into v_client from public.clients where phone_key = public.phone_key(l.phone) and archived_at is null limit 1;
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

-- ───────────── заявка с сайта: тариф и подробное уведомление ─────────────
create or replace function public.submit_lead(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_key text := nullif(p->>'idempotency_key',''); v_phone text; v_ip text := nullif(p->>'ip_hash','');
  v_tariff uuid; v_tname text; v_service text; v_body text;
begin
  if coalesce(p->>'website','') <> '' then return jsonb_build_object('ok', true); end if; -- honeypot: молча игнор
  if v_key is not null then
    select id into v_id from public.leads where idempotency_key = v_key;
    if found then return jsonb_build_object('ok', true, 'id', v_id, 'duplicate', true); end if;
  end if;
  v_phone := regexp_replace(coalesce(p->>'phone',''), '[^0-9+]', '', 'g');
  if length(trim(coalesce(p->>'name',''))) < 2 or length(p->>'name') > 120 then raise exception 'Укажите имя'; end if;
  if length(regexp_replace(v_phone, '\D', '', 'g')) < 9 or length(v_phone) > 16 then raise exception 'Укажите корректный телефон'; end if;
  if coalesce((p->>'consent')::boolean, false) is not true then raise exception 'Нужно согласие на обработку данных'; end if;
  if length(coalesce(p->>'comment','')) > 2000 then raise exception 'Комментарий слишком длинный'; end if;
  if coalesce(p->>'email','') <> '' and p->>'email' !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Некорректный email'; end if;
  if v_ip is not null and (select count(*) from public.leads where ip_hash = v_ip and created_at > now() - interval '10 minutes') >= 5 then
    raise exception 'Слишком много заявок, попробуйте позже'; end if;
  if (select count(*) from public.leads where phone = v_phone and created_at > now() - interval '10 minutes') >= 3 then
    raise exception 'Заявка с этим номером уже получена'; end if;
  if (select count(*) from public.leads where created_at > now() - interval '1 minute') >= 30 then
    raise exception 'Сервис перегружен, попробуйте через минуту'; end if;

  select t.id, t.name into v_tariff, v_tname from public.tariffs t
   where t.code = nullif(p->>'tariff_code','') and t.is_public and t.archived_at is null;
  v_service := left(coalesce(nullif(p->>'service',''), case when v_tname is not null then 'Тариф «' || v_tname || '»' end), 120);

  insert into public.leads(name, phone, email, business, service, comment, preferred_time, consent, source, utm, ip_hash, idempotency_key, tariff_id)
  values (trim(p->>'name'), v_phone, nullif(trim(coalesce(p->>'email','')),''), left(nullif(trim(coalesce(p->>'business','')),''),200),
    v_service, nullif(p->>'comment',''), left(nullif(p->>'preferred_time',''),120), true,
    coalesce(nullif(p->>'source',''),'site'), coalesce(p->'utm','{}'), v_ip, v_key, v_tariff)
  returning id into v_id;
  insert into public.lead_events(lead_id, kind, data) values (v_id, 'created', jsonb_build_object('source', coalesce(p->>'source','site'), 'tariff', v_tname));
  v_body := trim(p->>'name')
    || coalesce(' · ' || nullif(left(trim(coalesce(p->>'business','')), 80), ''), '')
    || coalesce(' · ' || v_service, '')
    || ' · ' || v_phone;
  perform public.notify_perm('leads.receive', 'lead.new', 'Новая заявка с сайта', v_body, 'lead', v_id::text, 'critical', 'lead:' || v_id);
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;
revoke execute on function public.submit_lead(jsonb) from public;
grant execute on function public.submit_lead(jsonb) to anon, authenticated;

