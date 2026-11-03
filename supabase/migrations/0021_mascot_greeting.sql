-- 0021. Илбирс и приветствие: обращение и день рождения в профиле, фразы владельца, «настроение» по своим делам.
-- Только добавления: новые необязательные поля и функции. Пол сотрудника по имени не определяется — только его выбор.

alter table public.profiles add column if not exists greet_name text;
alter table public.profiles add column if not exists address_form text not null default 'none';
alter table public.profiles add column if not exists birth_date date;
alter table public.profiles drop constraint if exists profiles_address_form_check;
alter table public.profiles add constraint profiles_address_form_check check (address_form in ('he', 'she', 'none'));
alter table public.profiles drop constraint if exists profiles_greet_name_len;
alter table public.profiles add constraint profiles_greet_name_len check (greet_name is null or length(greet_name) <= 40);

-- Фразы илбирса (JSON {emotion: [варианты]}), пусто — фразы по умолчанию из приложения. Меняет владелец.
insert into public.app_settings(key, value, label) values ('mascot_phrases', '', 'Фразы илбирса')
on conflict (key) do nothing;

-- Сводка своих дел для илбирса: только задачи и материалы текущего сотрудника (security invoker — работает RLS).
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
    'birthday', coalesce((select to_char(birth_date, 'MM-DD') = to_char((select d from b), 'MM-DD') from public.profiles where id = auth.uid()), false)
  );
$$;
revoke execute on function public.my_mood() from public, anon;
grant execute on function public.my_mood() to authenticated;
