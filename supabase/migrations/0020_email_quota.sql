-- 0020. Лимит встроенной почты Supabase: 2 письма в час на весь проект (регистрация, повторное письмо, сброс пароля).
-- Приложение считает отправленные письма и показывает таймер «следующее письмо можно через …», чтобы
-- сотрудники не упирались в ошибку 429 и не теряли попытки. Только добавления, существующие данные не меняются.

create table if not exists public.mail_sends (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('signup', 'resend', 'recovery', 'limit')),
  created_at timestamptz not null default now()
);
create index if not exists mail_sends_created_idx on public.mail_sends(created_at desc);
alter table public.mail_sends enable row level security; -- прямой доступ закрыт, только функции ниже

-- Отметка об отправке (или об ошибке лимита) из серверных действий входа/регистрации.
-- Не больше 6 отметок в час — посторонний не сможет «забить» таймер бесконечно.
create or replace function public.mail_quota_note(p_kind text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_kind not in ('signup', 'resend', 'recovery', 'limit') then return; end if;
  if (select count(*) from public.mail_sends where created_at > now() - interval '1 hour') >= 6 then return; end if;
  if p_kind = 'limit' and exists (select 1 from public.mail_sends where kind = 'limit' and created_at > now() - interval '2 minutes') then return; end if;
  insert into public.mail_sends(kind) values (p_kind);
  delete from public.mail_sends where created_at < now() - interval '7 days';
end $$;

-- Сколько писем ушло за последний час и когда освободится место.
-- Источники: отметки приложения + время последних писем в auth.users (на случай писем из панели Supabase).
-- Отметки ближе 30 секунд друг к другу считаются одним письмом. Возвращает только числа и время — без email.
create or replace function public.email_quota()
returns jsonb language sql stable security definer set search_path = public, auth as $$
  with raw as (
    select created_at t from public.mail_sends where kind <> 'limit' and created_at > now() - interval '1 hour'
    union all select confirmation_sent_at from auth.users where confirmation_sent_at > now() - interval '1 hour'
    union all select recovery_sent_at from auth.users where recovery_sent_at > now() - interval '1 hour'
    union all select email_change_sent_at from auth.users where email_change_sent_at > now() - interval '1 hour'
  ), b as (
    select max(t) t from raw group by floor(extract(epoch from t) / 30)
  ), ranked as (
    select t, row_number() over (order by t desc) n from b
  ), lim as (
    select max(created_at) t from public.mail_sends where kind = 'limit' and created_at > now() - interval '1 hour'
  )
  select jsonb_build_object(
    'limit', 2,
    'window_minutes', 60,
    'used', (select count(*) from b),
    'next_free_at', greatest(
      (select t + interval '1 hour' from ranked where n = 2),
      (select t + interval '20 minutes' from lim)
    ),
    'now', now());
$$;
revoke execute on function public.mail_quota_note(text) from public;
revoke execute on function public.email_quota() from public;
grant execute on function public.mail_quota_note(text) to anon, authenticated;
grant execute on function public.email_quota() to anon, authenticated;
