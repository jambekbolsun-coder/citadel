-- 0026 · Этап 2 исправлений (docs/SECURITY_FIX_PLAN.md): утечки и мелкие лазейки.
-- Только добавления и уточнения: права на колонки, новые триггеры-сторожа, create or replace функций, уточнение политик.
-- Данные не меняются.

-- ───────────── 2. Дата рождения — своя: функция (права на колонку — в части Б ниже) ─────────────
create or replace function public.my_birth_date()
returns date language sql stable security definer set search_path = public as $$
  select birth_date from public.profiles where id = auth.uid();
$$;
revoke execute on function public.my_birth_date() from public, anon;
grant execute on function public.my_birth_date() to authenticated;

-- Илбирс: день рождения — через my_birth_date (my_mood работает с правами сотрудника и колонку больше не читает).
create or replace function public.my_mood()
returns jsonb language sql stable security invoker set search_path = public as $$
  with b as (
    select (now() at time zone 'Asia/Bishkek')::date d
  ), bounds as (
    select (d::timestamp at time zone 'Asia/Bishkek') day_start, ((d + 1)::timestamp at time zone 'Asia/Bishkek') day_end from b
  ), t as (
    select status, due_at, completed_at from public.tasks where assignee_id = auth.uid()
  ), c as (
    select status, prep_due, submitted_at, prepared_at from public.content_items where assignee_id = auth.uid()
  ), open_items as (
    select due_at as due from t where status not in ('done', 'cancelled', 'review')
    union all
    select prep_due from c where status not in ('done', 'published', 'cancelled', 'paused', 'review')
  ), finished as (
    select completed_at as at, due_at as due from t where status = 'done' and completed_at is not null
    union all
    select coalesce(submitted_at, prepared_at), prep_due from c where coalesce(submitted_at, prepared_at) is not null
  )
  select jsonb_build_object(
    'overdue', (select count(*) from open_items where due < now()),
    'max_overdue_days', coalesce((select floor(extract(epoch from now() - min(due)) / 86400)::int from open_items where due < now()), 0),
    'due_today', (select count(*) from open_items, bounds where due >= now() and due < day_end),
    'done_today', (select count(*) from finished, bounds where at >= day_start and at < day_end),
    'open_total', (select count(*) from open_items),
    'late_recent', (select count(*) from finished where at > now() - interval '7 days' and due is not null and at > due),
    'done_recent', (select count(*) from finished where at > now() - interval '7 days'),
    'birthday', coalesce(to_char(public.my_birth_date(), 'MM-DD') = to_char((select d from b), 'MM-DD'), false)
  );
$$;

-- ───────────── 3. Сторис: исполнитель отмечает факт, но не план и не подтверждение ─────────────
create or replace function public.story_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user not in ('authenticated','anon') then return new; end if;
  if public.can_manage_project(old.project_id) or public.has_perm('content.manage') then return new; end if;
  if new.planned is distinct from old.planned or new.confirmed_at is distinct from old.confirmed_at
     or new.confirmed_by is distinct from old.confirmed_by or new.assignee_id is distinct from old.assignee_id
     or new.day is distinct from old.day or new.period_id is distinct from old.period_id or new.project_id is distinct from old.project_id then
    raise exception 'План, исполнителя и подтверждение сторис меняет руководитель проекта';
  end if;
  return new;
end $$;
create trigger story_guard_trg before update on public.story_daily_plans for each row execute function public.story_guard();

-- ───────────── 4. Комментарии и вложения — только к своим проектам и объектам ─────────────
alter policy com_insert on public.comments
  with check (author_id = auth.uid() and public.is_active() and project_id is not null and public.can_view_project(project_id)
    and case entity_type
      when 'content' then exists (select 1 from public.content_items c where c.id = entity_id and c.project_id = comments.project_id)
      when 'shoot' then exists (select 1 from public.shoots s where s.id = entity_id and s.project_id = comments.project_id)
      when 'project' then entity_id = project_id
      else false end);
alter policy att_insert on public.attachments
  with check (created_by = auth.uid() and public.is_active() and project_id is not null and public.can_view_project(project_id));

-- ───────────── 5. Заявки: стадия и служебные отметки — только функциями ─────────────
create or replace function public.leads_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user not in ('authenticated','anon') then return new; end if;
  if new.stage is distinct from old.stage or new.lost_reason is distinct from old.lost_reason
     or new.client_id is distinct from old.client_id or new.taken_at is distinct from old.taken_at
     or new.first_opened_by is distinct from old.first_opened_by or new.first_opened_at is distinct from old.first_opened_at
     or new.first_response_at is distinct from old.first_response_at or new.escalated_at is distinct from old.escalated_at
     or new.consent is distinct from old.consent or new.source is distinct from old.source
     or new.ip_hash is distinct from old.ip_hash or new.idempotency_key is distinct from old.idempotency_key then
    raise exception 'Стадия заявки меняется только кнопками воронки';
  end if;
  return new;
end $$;
create trigger leads_guard_trg before update on public.leads for each row execute function public.leads_guard();

-- ───────────── 6. Таймер писем: отметку нельзя подделать ─────────────
-- Отметка об отправке принимается, только если Supabase действительно отправил письмо в последние 2 минуты
-- (время письма в auth.users). Отметка «упёрлись в лимит» — только если за час уже было реальное письмо.
create or replace function public.mail_quota_note(p_kind text)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if p_kind not in ('signup', 'resend', 'recovery', 'limit') then return; end if;
  if (select count(*) from public.mail_sends where created_at > now() - interval '1 hour') >= 6 then return; end if;
  if p_kind = 'limit' then
    if exists (select 1 from public.mail_sends where kind = 'limit' and created_at > now() - interval '2 minutes') then return; end if;
    if not exists (select 1 from auth.users where greatest(confirmation_sent_at, recovery_sent_at, email_change_sent_at) > now() - interval '1 hour') then return; end if;
  elsif p_kind = 'recovery' then
    if not exists (select 1 from auth.users where recovery_sent_at > now() - interval '2 minutes') then return; end if;
  else
    if not exists (select 1 from auth.users where confirmation_sent_at > now() - interval '2 minutes') then return; end if;
  end if;
  insert into public.mail_sends(kind) values (p_kind);
  delete from public.mail_sends where created_at < now() - interval '7 days';
end $$;

revoke execute on function public.story_guard() from public, anon, authenticated;
revoke execute on function public.leads_guard() from public, anon, authenticated;

-- ═════════════ Часть Б — применяется после выкладки кода 0.9.1 ═════════════
-- Код 0.9.1 читает профиль и блоки сайта списком колонок; если закрыть колонки раньше, старая версия сайта упадёт.

-- ───────────── 1. Черновики сайта не видны посетителям ─────────────
-- Посетитель (anon) читает только опубликованную версию блоков; черновик и автор правки — только сотрудникам.
revoke select on public.site_blocks from anon;
grant select (key, type, sort, visible, published, published_at, updated_at) on public.site_blocks to anon;

-- Дата рождения — только своя (колонка закрыта, своя дата — my_birth_date()).
-- Коллеги видят друг у друга имя, фото, должность, но не дату рождения. Свою дату сотрудник получает функцией.
-- ВАЖНО: права на колонки profiles выданы списком — новую колонку profiles нужно добавлять в grant в её миграции.
revoke select on public.profiles from anon, authenticated;
grant select (id, full_name, email, phone, avatar_url, about, job_title, department_id, manager_id, responsibilities,
  work_schedule, start_date, status, theme, locale, created_at, updated_at, greet_name, address_form)
  on public.profiles to anon, authenticated;

