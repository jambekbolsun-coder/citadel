-- 0009: Web Push при закрытом приложении, серии повторов задач/съёмок, перенос сроков контента.

create extension if not exists pg_net with schema extensions;

-- ═════════════ Web Push ═════════════
-- Ключи VAPID создаёт edge-функция push-dispatch при первом запуске и хранит в Vault.
-- Секрет вызова функции генерируется здесь и никогда не покидает базу.
do $$ begin
  if not exists (select 1 from vault.secrets where name = 'push_dispatch_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'push_dispatch_secret', 'Web Push: секрет вызова edge-функции');
  end if;
end $$;

insert into public.app_settings(key, value, label) values
  ('push_function_url', 'https://cdnveemxxgghhvrydtid.supabase.co/functions/v1/push-dispatch', 'Адрес функции отправки push'),
  ('push_subject', 'https://cdnveemxxgghhvrydtid.supabase.co', 'VAPID subject (mailto: или https://)')
on conflict (key) do nothing;

alter table public.push_subscriptions add column if not exists user_agent text;
alter table public.push_subscriptions add column if not exists last_success_at timestamptz;
alter table public.notifications add column if not exists push_claimed_at timestamptz;
alter table public.notifications drop constraint if exists notifications_push_status_check;
alter table public.notifications add constraint notifications_push_status_check
  check (push_status in ('pending','sending','sent','failed','skipped'));
create index if not exists notifications_push_idx on public.notifications(push_status, created_at) where push_status in ('pending','sending');

-- Уведомления, созданные до включения push, не рассылаем задним числом
update public.notifications set push_status = 'skipped' where push_status = 'pending';

create or replace function public.push_config()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_dispatch_secret'),
    'public', (select decrypted_secret from vault.decrypted_secrets where name = 'vapid_public'),
    'private', (select decrypted_secret from vault.decrypted_secrets where name = 'vapid_private'),
    'subject', coalesce((select value from public.app_settings where key = 'push_subject'), 'https://cdnveemxxgghhvrydtid.supabase.co'));
$$;

create or replace function public.push_init_vapid(p_public text, p_private text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from vault.secrets where name = 'vapid_public') then return; end if;
  perform vault.create_secret(p_public, 'vapid_public', 'Web Push: публичный ключ VAPID');
  perform vault.create_secret(p_private, 'vapid_private', 'Web Push: приватный ключ VAPID');
end $$;

create or replace function public.push_public_key()
returns text language sql stable security definer set search_path = public as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'vapid_public' and public.is_active();
$$;

create or replace function public.push_subscribe(p_endpoint text, p_p256dh text, p_auth text, p_ua text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_active() then raise exception 'Нет доступа'; end if;
  if coalesce(p_endpoint,'') !~ '^https://' or coalesce(p_p256dh,'') = '' or coalesce(p_auth,'') = '' then
    raise exception 'Некорректная подписка браузера'; end if;
  delete from public.push_subscriptions where endpoint = p_endpoint;
  insert into public.push_subscriptions(user_id, endpoint, keys, user_agent)
  values (auth.uid(), p_endpoint, jsonb_build_object('p256dh', p_p256dh, 'auth', p_auth), left(p_ua, 200));
end $$;

create or replace function public.push_test()
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_active() then raise exception 'Нет доступа'; end if;
  if not exists (select 1 from public.push_subscriptions where user_id = auth.uid()) then
    raise exception 'На этом аккаунте нет подписанных устройств — сначала включите уведомления'; end if;
  perform public.notify_user(auth.uid(), 'push.test', 'Проверка уведомлений', 'Push-уведомления работают на этом устройстве', null, null, 'normal', null);
end $$;

-- Забрать пачку на отправку (только edge-функция под service_role)
create or replace function public.push_claim(p_limit int default 50)
returns jsonb language plpgsql security definer set search_path = public as $$
declare res jsonb;
begin
  update public.notifications n set push_status = 'skipped'
   where n.push_status in ('pending','sending')
     and (n.created_at < now() - interval '1 day'
          or not exists (select 1 from public.push_subscriptions s where s.user_id = n.user_id));
  with c as (
    select n.id from public.notifications n
     where (n.push_status = 'pending' or (n.push_status = 'sending' and n.push_claimed_at < now() - interval '5 minutes'))
       and n.retry_count < 5
     order by n.created_at limit greatest(1, least(p_limit, 200))
     for update skip locked),
  upd as (
    update public.notifications n set push_status = 'sending', push_claimed_at = now(), retry_count = n.retry_count + 1
      from c where n.id = c.id returning n.*)
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', u.id, 'title', u.title, 'body', u.body, 'priority', u.priority,
      'url', case
        when u.entity_id is null then '/app/notifications'
        when u.entity_type = 'lead' then '/app/leads/' || u.entity_id
        when u.entity_type = 'project' then '/app/projects/' || u.entity_id
        when u.entity_type = 'content' then '/app/content/' || u.entity_id
        when u.entity_type = 'task' then '/app/tasks/' || u.entity_id
        when u.entity_type = 'shoot' then '/app/shoots/' || u.entity_id
        when u.entity_type = 'profile' then '/app/team/' || u.entity_id
        when u.entity_type = 'payroll' then '/app/payroll'
        else '/app/notifications' end,
      'subs', (select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'keys', s.keys)) from public.push_subscriptions s where s.user_id = u.user_id))), '[]'::jsonb)
    into res from upd u;
  return res;
end $$;

create or replace function public.push_result(p_id uuid, p_ok boolean, p_gone text[] default '{}')
returns void language plpgsql security definer set search_path = public as $$
declare n public.notifications;
begin
  if coalesce(array_length(p_gone, 1), 0) > 0 then
    delete from public.push_subscriptions where endpoint = any(p_gone);
  end if;
  select * into n from public.notifications where id = p_id;
  if not found then return; end if;
  if p_ok then
    update public.push_subscriptions set last_success_at = now() where user_id = n.user_id and not (endpoint = any(p_gone));
  end if;
  update public.notifications set push_status = case
      when p_ok then 'sent'
      when not exists (select 1 from public.push_subscriptions s where s.user_id = n.user_id) then 'skipped'
      when n.retry_count >= 5 then 'failed'
      else 'pending' end
   where id = p_id;
end $$;

-- Разбудить edge-функцию (асинхронно, через pg_net). Ошибка вызова никогда не ломает исходную операцию.
create or replace function public.push_kick()
returns void language plpgsql security definer set search_path = public as $$
declare url text; secret text;
begin
  select value into url from public.app_settings where key = 'push_function_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'push_dispatch_secret';
  if url is null or secret is null then return; end if;
  perform net.http_post(url := url, body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-dispatch-secret', secret),
    timeout_milliseconds := 10000);
exception when others then null;
end $$;

create or replace function public.push_kick_if_pending()
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.notifications where created_at > now() - interval '1 day' and retry_count < 5
               and (push_status = 'pending' or (push_status = 'sending' and push_claimed_at < now() - interval '5 minutes'))) then
    perform public.push_kick();
  end if;
end $$;

create or replace function public.notifications_push_trg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from new_rows n where n.push_status = 'pending'
               and exists (select 1 from public.push_subscriptions s where s.user_id = n.user_id)) then
    perform public.push_kick();
  end if;
  return null;
end $$;
drop trigger if exists notifications_push on public.notifications;
create trigger notifications_push after insert on public.notifications
  referencing new table as new_rows for each statement execute function public.notifications_push_trg();

select cron.unschedule('citadel-push-retry') where exists (select 1 from cron.job where jobname = 'citadel-push-retry');
select cron.schedule('citadel-push-retry', '* * * * *', $$select public.push_kick_if_pending();$$);

revoke execute on function public.push_config() from public, anon, authenticated;
revoke execute on function public.push_init_vapid(text, text) from public, anon, authenticated;
revoke execute on function public.push_claim(int) from public, anon, authenticated;
revoke execute on function public.push_result(uuid, boolean, text[]) from public, anon, authenticated;
revoke execute on function public.push_kick() from public, anon, authenticated;
revoke execute on function public.push_kick_if_pending() from public, anon, authenticated;
revoke execute on function public.notifications_push_trg() from public, anon, authenticated;
grant execute on function public.push_config() to service_role;
grant execute on function public.push_init_vapid(text, text) to service_role;
grant execute on function public.push_claim(int) to service_role;
grant execute on function public.push_result(uuid, boolean, text[]) to service_role;
revoke execute on function public.push_public_key() from public, anon;
revoke execute on function public.push_subscribe(text, text, text, text) from public, anon;
revoke execute on function public.push_test() from public, anon;
grant execute on function public.push_public_key() to authenticated;
grant execute on function public.push_subscribe(text, text, text, text) to authenticated;
grant execute on function public.push_test() to authenticated;

-- ═════════════ Серии повторов ═════════════
create table if not exists public.recurrence_series (
  id uuid primary key default gen_random_uuid(),
  entity text not null check (entity in ('task','shoot')),
  rule jsonb not null,
  summary text not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
alter table public.recurrence_series enable row level security;
create policy series_read on public.recurrence_series for select to authenticated using (public.is_active());
create policy series_insert on public.recurrence_series for insert to authenticated with check (public.is_active() and created_by = auth.uid());

alter table public.tasks add column if not exists series_id uuid references public.recurrence_series(id) on delete set null;
alter table public.shoots add column if not exists series_id uuid references public.recurrence_series(id) on delete set null;
create index if not exists tasks_series_idx on public.tasks(series_id) where series_id is not null;
create index if not exists shoots_series_idx on public.shoots(series_id) where series_id is not null;

-- Одна запись «Новая задача» на всю серию, а не по уведомлению на каждый повтор
create or replace function public.tasks_notify_assign()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.assignee_id is not null and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id) then
    if new.series_id is not null and tg_op = 'INSERT' then
      perform public.notify_user(new.assignee_id, 'task.assigned', 'Новая повторяющаяся задача', new.title, 'task', new.id::text, new.priority,
        'tser:' || new.series_id || ':' || new.assignee_id);
    else
      perform public.notify_user(new.assignee_id, 'task.assigned', 'Новая задача', new.title, 'task', new.id::text, new.priority, 'tasg:' || new.id || ':' || new.assignee_id);
    end if;
    if new.project_id is not null then
      insert into public.project_members(project_id, user_id, role) values (new.project_id, new.assignee_id, 'executor') on conflict do nothing;
    end if;
  end if;
  return new;
end $$;

-- Отменить будущие повторы серии (начиная с p_from включительно)
create or replace function public.series_cancel(p_series uuid, p_from timestamptz, p_reason text)
returns int language plpgsql security definer set search_path = public as $$
declare ser public.recurrence_series; r record; n int := 0;
begin
  select * into ser from public.recurrence_series where id = p_series;
  if not found then raise exception 'Серия не найдена'; end if;
  if coalesce(trim(p_reason),'') = '' then raise exception 'Укажите причину'; end if;
  if ser.entity = 'task' then
    for r in select id from public.tasks where series_id = p_series and due_at >= p_from and status not in ('done','cancelled') loop
      perform public.task_transition(r.id, 'cancelled', 'Серия остановлена: ' || p_reason, null);
      n := n + 1;
    end loop;
  else
    for r in select s.* from public.shoots s where s.series_id = p_series and s.starts_at >= p_from and s.status = 'planned' loop
      if not (public.has_perm('shoots.manage') or public.can_manage_project(r.project_id)
              or exists (select 1 from public.projects where id = r.project_id and planning_director_id = auth.uid())) then
        raise exception 'Нет прав'; end if;
      update public.shoots set status = 'cancelled', cancel_reason = 'Серия остановлена: ' || p_reason where id = r.id;
      insert into public.shoot_history(shoot_id, actor_id, kind, data) values (r.id, auth.uid(), 'cancel', jsonb_build_object('reason', p_reason, 'series', p_series));
      perform public.notify_user(sp.user_id, 'shoot.cancelled', 'Съёмка отменена', r.title || ': ' || p_reason, 'shoot', r.id::text, 'normal', 'scan:' || r.id || ':' || sp.user_id)
        from public.shoot_participants sp where sp.shoot_id = r.id;
      n := n + 1;
    end loop;
  end if;
  return n;
end $$;
revoke execute on function public.series_cancel(uuid, timestamptz, text) from public, anon;
grant execute on function public.series_cancel(uuid, timestamptz, text) to authenticated;

-- ═════════════ Перенос сроков контента (календарь, перетаскивание) ═════════════
create or replace function public.content_reschedule(p_id uuid, p_prep_due timestamptz, p_publish_due timestamptz, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare c public.content_items;
begin
  select * into c from public.content_items where id = p_id for update;
  if not found then raise exception 'Материал не найден'; end if;
  if not (public.can_manage_project(c.project_id) or public.has_perm('content.manage')) then raise exception 'Нет прав'; end if;
  if coalesce(trim(p_reason),'') = '' then raise exception 'Укажите причину переноса'; end if;
  if p_prep_due is null and p_publish_due is null then raise exception 'Не указан новый срок'; end if;
  if c.status in ('published','cancelled') then raise exception 'Материал уже опубликован или отменён'; end if;
  update public.content_items set prep_due = coalesce(p_prep_due, prep_due), publish_due = coalesce(p_publish_due, publish_due) where id = p_id;
  insert into public.content_history(content_id, from_status, to_status, actor_id, note, data)
  values (p_id, c.status, c.status, auth.uid(), 'перенос: ' || p_reason,
          jsonb_build_object('prep_from', c.prep_due, 'prep_to', p_prep_due, 'publish_from', c.publish_due, 'publish_to', p_publish_due));
  if c.assignee_id is not null and c.assignee_id <> auth.uid() then
    perform public.notify_user(c.assignee_id, 'content.rescheduled', 'Изменён срок материала', c.title || ': ' || left(p_reason, 140), 'content', p_id::text, 'normal', null);
  end if;
end $$;
revoke execute on function public.content_reschedule(uuid, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.content_reschedule(uuid, timestamptz, timestamptz, text) to authenticated;
