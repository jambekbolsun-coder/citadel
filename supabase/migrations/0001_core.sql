-- Цитадель · 0001 · ядро: профили, отделы, роли, права, приглашения, устройства, аудит, уведомления
create extension if not exists pgcrypto with schema extensions;

-- ───────────── справочники ─────────────
create table public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  head_id uuid,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create type public.profile_status as enum ('pending_approval','active','blocked');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text,
  phone text,
  avatar_url text,
  about text,
  job_title text,
  department_id uuid references public.departments(id),
  manager_id uuid references public.profiles(id),
  responsibilities text,
  work_schedule jsonb not null default '{"days":[1,2,3,4,5],"start":"09:00","end":"18:00"}',
  start_date date,
  status public.profile_status not null default 'pending_approval',
  theme text not null default 'system',
  locale text not null default 'ru',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.departments add constraint departments_head_fk foreign key (head_id) references public.profiles(id);

create table public.roles (
  code text primary key,
  name text not null,
  description text,
  is_system boolean not null default false,
  sort int not null default 100
);

create table public.permissions (
  code text primary key,
  name text not null,
  module text not null,
  sensitive boolean not null default false
);

create table public.role_permissions (
  role_code text not null references public.roles(code) on delete cascade,
  permission_code text not null references public.permissions(code) on delete cascade,
  primary key (role_code, permission_code)
);

create table public.user_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_code text not null references public.roles(code),
  granted_by uuid references public.profiles(id),
  granted_at timestamptz not null default now(),
  primary key (user_id, role_code)
);

-- Индивидуальные права сверх ролей (resource_grants)
create table public.user_permissions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  permission_code text not null references public.permissions(code) on delete cascade,
  granted_by uuid references public.profiles(id),
  granted_at timestamptz not null default now(),
  primary key (user_id, permission_code)
);

-- ───────────── аудит ─────────────
create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  entity_type text not null,
  entity_id text,
  data jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_entity_idx on public.audit_log(entity_type, entity_id);
create index audit_log_created_idx on public.audit_log(created_at desc);

create or replace function public.audit(p_action text, p_entity text, p_id text, p_data jsonb default null)
returns void language sql security definer set search_path = public as $$
  insert into public.audit_log(actor_id, action, entity_type, entity_id, data)
  values (auth.uid(), p_action, p_entity, p_id, p_data);
$$;
revoke execute on function public.audit(text,text,text,jsonb) from public, anon, authenticated;

-- ───────────── функции прав ─────────────
create or replace function public.is_owner(uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles ur join public.profiles p on p.id = ur.user_id
    where ur.user_id = uid and ur.role_code = 'owner' and p.status = 'active');
$$;

create or replace function public.is_active(uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = uid and status = 'active');
$$;

create or replace function public.has_perm(p_code text, uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_active(uid) and (
    public.is_owner(uid)
    or exists (select 1 from public.user_roles ur join public.role_permissions rp on rp.role_code = ur.role_code
               where ur.user_id = uid and rp.permission_code = p_code)
    or exists (select 1 from public.user_permissions up where up.user_id = uid and up.permission_code = p_code));
$$;

create or replace function public.my_permissions()
returns setof text language sql stable security definer set search_path = public as $$
  select code from public.permissions where public.has_perm(code);
$$;

-- Недавний вход паролем (для чувствительных операций): по claim amr в JWT
create or replace function public.recent_password_auth(max_age_sec int default 900)
returns boolean language sql stable as $$
  select coalesce((
    select max((e->>'timestamp')::bigint) from jsonb_array_elements(coalesce(auth.jwt()->'amr','[]'::jsonb)) e
    where e->>'method' in ('password','otp','magiclink','recovery')
  ), 0) >= extract(epoch from now())::bigint - max_age_sec;
$$;

-- ───────────── профили: триггеры ─────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();

-- Сотрудник не может сам менять статус, отдел, руководителя, должность
create or replace function public.profiles_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or current_setting('citadel.bypass', true) = 'on' then return new; end if; -- служебные вызовы
  if not public.has_perm('employees.manage') then
    if new.status is distinct from old.status or new.department_id is distinct from old.department_id
       or new.manager_id is distinct from old.manager_id or new.job_title is distinct from old.job_title
       or new.email is distinct from old.email or new.start_date is distinct from old.start_date then
      raise exception 'Недостаточно прав для изменения служебных полей профиля';
    end if;
  end if;
  if new.status is distinct from old.status then
    if public.is_owner(old.id) and new.status <> 'active' and
       (select count(*) from public.user_roles ur join public.profiles p on p.id=ur.user_id
         where ur.role_code='owner' and p.status='active') <= 1 then
      raise exception 'Нельзя заблокировать единственного владельца';
    end if;
    perform public.audit('profile.status', 'profile', old.id::text, jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  return new;
end $$;
create trigger profiles_guard_trg before update on public.profiles for each row execute function public.profiles_guard();

-- Защита ролей: owner назначает только owner; нельзя снять последнего owner
create or replace function public.user_roles_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare r text := coalesce(new.role_code, old.role_code);
begin
  if auth.uid() is not null and coalesce(current_setting('citadel.bypass', true),'') <> 'on' then
    if r = 'owner' and not public.is_owner() then raise exception 'Роль владельца может назначать/снимать только владелец'; end if;
    if not public.has_perm('roles.manage') then raise exception 'Недостаточно прав для управления ролями'; end if;
  end if;
  if tg_op = 'DELETE' and old.role_code = 'owner' and
     (select count(*) from public.user_roles where role_code='owner') <= 1 then
    raise exception 'Нельзя снять роль с единственного владельца';
  end if;
  perform public.audit(case when tg_op='DELETE' then 'role.revoke' else 'role.grant' end, 'profile',
    coalesce(new.user_id, old.user_id)::text, jsonb_build_object('role', r));
  return coalesce(new, old);
end $$;
create trigger user_roles_guard_ins before insert on public.user_roles for each row execute function public.user_roles_guard();
create trigger user_roles_guard_del before delete on public.user_roles for each row execute function public.user_roles_guard();

create or replace function public.user_perms_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.has_perm('roles.manage') then raise exception 'Недостаточно прав'; end if;
  perform public.audit(case when tg_op='DELETE' then 'perm.revoke' else 'perm.grant' end, 'profile',
    coalesce(new.user_id, old.user_id)::text, jsonb_build_object('perm', coalesce(new.permission_code, old.permission_code)));
  return coalesce(new, old);
end $$;
create trigger user_perms_guard_trg before insert or delete on public.user_permissions for each row execute function public.user_perms_guard();

create or replace function public.role_perms_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_owner() then raise exception 'Матрицу прав меняет только владелец'; end if;
  perform public.audit(case when tg_op='DELETE' then 'matrix.revoke' else 'matrix.grant' end, 'role',
    coalesce(new.role_code, old.role_code), jsonb_build_object('perm', coalesce(new.permission_code, old.permission_code)));
  return coalesce(new, old);
end $$;
create trigger role_perms_guard_trg before insert or delete on public.role_permissions for each row execute function public.role_perms_guard();

-- Первый владелец: доступно только пока владельцев нет
create or replace function public.claim_first_owner(p_full_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Требуется вход'; end if;
  perform pg_advisory_xact_lock(42);
  if exists (select 1 from public.user_roles where role_code = 'owner') then
    raise exception 'Владелец уже назначен';
  end if;
  if (select email_confirmed_at from auth.users where id = auth.uid()) is null then
    raise exception 'Сначала подтвердите email';
  end if;
  perform set_config('citadel.bypass', 'on', true);
  update public.profiles set status = 'active', full_name = coalesce(nullif(p_full_name,''), full_name), job_title = 'Владелец'
   where id = auth.uid();
  insert into public.user_roles(user_id, role_code) values (auth.uid(), 'owner');
  perform public.audit('owner.claim', 'profile', auth.uid()::text, null);
end $$;

create or replace function public.owner_exists()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where role_code = 'owner');
$$;

-- ───────────── приглашения ─────────────
create type public.invite_status as enum ('active','used','revoked');
create table public.employee_invites (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  full_name text not null,
  email text not null,
  phone text,
  department_id uuid references public.departments(id),
  job_title text,
  role_codes text[] not null default '{}',
  manager_id uuid references public.profiles(id),
  responsibilities text,
  start_date date,
  salary jsonb, -- условия зарплаты до регистрации, переносятся в salary_terms
  status public.invite_status not null default 'active',
  expires_at timestamptz not null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  used_by uuid references public.profiles(id),
  used_at timestamptz,
  revoked_at timestamptz
);

-- Создание приглашения: токен генерируется на сервере, хранится только хэш
create or replace function public.create_invite(p jsonb, p_ttl_hours int default 72)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_token text; v_id uuid; r text;
begin
  if not public.has_perm('employees.invite') then raise exception 'Нет права employees.invite'; end if;
  if coalesce(p->>'email','') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Укажите корректный email'; end if;
  if coalesce(trim(p->>'full_name'),'') = '' then raise exception 'Укажите ФИО'; end if;
  foreach r in array coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p->'role_codes','[]')) x), '{}') loop
    if r = 'owner' then raise exception 'Роль владельца нельзя выдать через приглашение'; end if;
    if not exists (select 1 from public.roles where code = r) then raise exception 'Неизвестная роль %', r; end if;
  end loop;
  v_token := encode(gen_random_bytes(24), 'hex');
  insert into public.employee_invites(token_hash, full_name, email, phone, department_id, job_title, role_codes,
     manager_id, responsibilities, start_date, salary, expires_at, created_by)
  values (encode(digest(v_token, 'sha256'), 'hex'), trim(p->>'full_name'), lower(trim(p->>'email')), nullif(p->>'phone',''),
     nullif(p->>'department_id','')::uuid, nullif(p->>'job_title',''),
     coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p->'role_codes','[]')) x), '{}'),
     nullif(p->>'manager_id','')::uuid, nullif(p->>'responsibilities',''), nullif(p->>'start_date','')::date,
     p->'salary', now() + make_interval(hours => greatest(1, least(p_ttl_hours, 720))), auth.uid())
  returning id into v_id;
  perform public.audit('invite.create', 'invite', v_id::text, jsonb_build_object('email', p->>'email'));
  return jsonb_build_object('id', v_id, 'token', v_token);
end $$;

-- Перевыпуск: старый токен перестаёт работать
create or replace function public.reissue_invite(p_id uuid, p_ttl_hours int default 72)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v_token text;
begin
  if not public.has_perm('employees.invite') then raise exception 'Нет права employees.invite'; end if;
  v_token := encode(gen_random_bytes(24), 'hex');
  update public.employee_invites set token_hash = encode(digest(v_token,'sha256'),'hex'), status = 'active',
    expires_at = now() + make_interval(hours => greatest(1, least(p_ttl_hours, 720))), revoked_at = null
   where id = p_id and status <> 'used';
  if not found then raise exception 'Приглашение не найдено или уже использовано'; end if;
  perform public.audit('invite.reissue', 'invite', p_id::text, null);
  return jsonb_build_object('id', p_id, 'token', v_token);
end $$;

create or replace function public.revoke_invite(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('employees.invite') then raise exception 'Нет права employees.invite'; end if;
  update public.employee_invites set status = 'revoked', revoked_at = now() where id = p_id and status = 'active';
  perform public.audit('invite.revoke', 'invite', p_id::text, null);
end $$;

-- Публичный предпросмотр приглашения по токену (без лишних данных)
create or replace function public.invite_preview(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare i public.employee_invites;
begin
  select * into i from public.employee_invites where token_hash = encode(digest(p_token,'sha256'),'hex');
  if not found then return jsonb_build_object('valid', false, 'reason', 'not_found'); end if;
  if i.status = 'revoked' then return jsonb_build_object('valid', false, 'reason', 'revoked'); end if;
  if i.status = 'used' then return jsonb_build_object('valid', false, 'reason', 'used'); end if;
  if i.expires_at < now() then return jsonb_build_object('valid', false, 'reason', 'expired'); end if;
  return jsonb_build_object('valid', true, 'full_name', i.full_name, 'job_title', i.job_title,
    'email_hint', regexp_replace(i.email, '^(.).*(@.*)$', '\1***\2'),
    'department', (select name from public.departments where id = i.department_id),
    'roles', (select coalesce(jsonb_agg(name), '[]') from public.roles where code = any(i.role_codes)));
end $$;
grant execute on function public.invite_preview(text) to anon, authenticated;

-- Принятие приглашения авторизованным пользователем с подтверждённым email
create or replace function public.accept_invite(p_token text, p_phone text, p_about text, p_responsibilities text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare i public.employee_invites; u auth.users; r text;
begin
  if auth.uid() is null then raise exception 'Требуется вход'; end if;
  select * into u from auth.users where id = auth.uid();
  if u.email_confirmed_at is null then raise exception 'Подтвердите email по ссылке из письма'; end if;
  select * into i from public.employee_invites where token_hash = encode(digest(p_token,'sha256'),'hex') for update;
  if not found or i.status <> 'active' or i.expires_at < now() then raise exception 'Приглашение недействительно'; end if;
  if lower(u.email) <> i.email then raise exception 'Email аккаунта не совпадает с приглашением'; end if;
  if exists (select 1 from public.user_roles where user_id = auth.uid()) then raise exception 'Аккаунт уже привязан'; end if;
  perform set_config('citadel.bypass', 'on', true);

  update public.profiles set full_name = i.full_name, phone = coalesce(nullif(p_phone,''), i.phone),
    about = p_about, responsibilities = coalesce(nullif(p_responsibilities,''), i.responsibilities),
    department_id = i.department_id, manager_id = i.manager_id, job_title = i.job_title, start_date = i.start_date,
    status = 'pending_approval'
  where id = auth.uid();
  foreach r in array i.role_codes loop
    insert into public.user_roles(user_id, role_code, granted_by) values (auth.uid(), r, i.created_by) on conflict do nothing;
  end loop;
  if i.salary is not null and (i.salary->>'type') is not null then
    insert into public.salary_terms(user_id, pay_type, base_minor, piece_rules, pay_days, currency, effective_from, created_by)
    values (auth.uid(), (i.salary->>'type')::public.pay_type, coalesce((i.salary->>'base_minor')::bigint, 0),
      coalesce(i.salary->'piece_rules', '[]'), coalesce((select array_agg(x::int) from jsonb_array_elements_text(i.salary->'pay_days') x), '{5}'),
      coalesce(i.salary->>'currency', 'KGS'), coalesce(i.start_date, current_date), i.created_by);
  end if;
  update public.employee_invites set status = 'used', used_by = auth.uid(), used_at = now() where id = i.id;
  perform public.audit('invite.accept', 'invite', i.id::text, null);
  perform public.notify_perm('employees.manage', 'employee.joined', 'Сотрудник принял приглашение',
     i.full_name || ' ожидает утверждения доступа', 'profile', auth.uid()::text, 'high', 'join:' || auth.uid());
end $$;

-- ───────────── доверенные устройства и PIN ─────────────
create table public.device_pins (
  user_id uuid not null references public.profiles(id) on delete cascade,
  device_id text not null,
  device_name text,
  pin_hash text not null,
  failed_attempts int not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  primary key (user_id, device_id)
);

create or replace function public.set_device_pin(p_device text, p_pin text, p_name text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if auth.uid() is null then raise exception 'Требуется вход'; end if;
  if p_pin !~ '^\d{4}$' then raise exception 'PIN — ровно 4 цифры'; end if;
  if p_pin in ('0000','1111','1234','4321','2222','3333','4444','5555','6666','7777','8888','9999','1212') then
    raise exception 'Слишком простой PIN'; end if;
  if length(p_device) < 16 then raise exception 'Некорректное устройство'; end if;
  insert into public.device_pins(user_id, device_id, device_name, pin_hash)
  values (auth.uid(), p_device, left(p_name, 120), crypt(p_pin, gen_salt('bf', 8)))
  on conflict (user_id, device_id) do update set pin_hash = excluded.pin_hash, failed_attempts = 0, locked_until = null,
     device_name = excluded.device_name;
  perform public.audit('pin.set', 'device', p_device, null);
end $$;

-- Возвращает ok | wrong:<осталось> | locked | reset (PIN сброшен, нужен полный вход) | none
create or replace function public.verify_device_pin(p_device text, p_pin text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare d public.device_pins;
begin
  if auth.uid() is null then return 'none'; end if;
  select * into d from public.device_pins where user_id = auth.uid() and device_id = p_device for update;
  if not found then return 'none'; end if;
  if d.locked_until is not null and d.locked_until > now() then return 'locked'; end if;
  if d.pin_hash = crypt(p_pin, d.pin_hash) then
    update public.device_pins set failed_attempts = 0, locked_until = null, last_used_at = now()
     where user_id = d.user_id and device_id = d.device_id;
    return 'ok';
  end if;
  if d.failed_attempts + 1 >= 5 then
    delete from public.device_pins where user_id = d.user_id and device_id = d.device_id;
    perform public.audit('pin.reset_bruteforce', 'device', p_device, null);
    return 'reset';
  end if;
  update public.device_pins set failed_attempts = failed_attempts + 1,
     locked_until = case when failed_attempts + 1 >= 3 then now() + interval '1 minute' else null end
   where user_id = d.user_id and device_id = d.device_id;
  return 'wrong:' || (4 - d.failed_attempts)::text;
end $$;

-- ───────────── уведомления и outbox ─────────────
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  entity_type text,
  entity_id text,
  priority text not null default 'normal' check (priority in ('low','normal','high','critical')),
  idempotency_key text,
  read_at timestamptz,
  archived_at timestamptz,
  push_status text not null default 'pending' check (push_status in ('pending','sent','failed','skipped')),
  retry_count int not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);
create index notifications_user_idx on public.notifications(user_id, created_at desc);

create table public.event_outbox (
  id bigint generated always as identity primary key,
  type text not null,
  payload jsonb not null,
  status text not null default 'pending',
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  keys jsonb not null,
  created_at timestamptz not null default now()
);

create or replace function public.notify_user(p_user uuid, p_type text, p_title text, p_body text,
  p_entity_type text, p_entity_id text, p_priority text default 'normal', p_key text default null)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications(user_id, type, title, body, entity_type, entity_id, priority, idempotency_key)
  values (p_user, p_type, p_title, p_body, p_entity_type, p_entity_id, p_priority, p_key)
  on conflict (user_id, idempotency_key) do nothing;
$$;

-- Уведомить всех активных пользователей с правом (и владельцев)
create or replace function public.notify_perm(p_perm text, p_type text, p_title text, p_body text,
  p_entity_type text, p_entity_id text, p_priority text default 'normal', p_key text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications(user_id, type, title, body, entity_type, entity_id, priority, idempotency_key)
  select p.id, p_type, p_title, p_body, p_entity_type, p_entity_id, p_priority, p_key
    from public.profiles p where p.status = 'active' and public.has_perm(p_perm, p.id)
  on conflict (user_id, idempotency_key) do nothing;
  insert into public.event_outbox(type, payload) values (p_type, jsonb_build_object('perm', p_perm, 'entity', p_entity_type, 'id', p_entity_id));
end $$;
revoke execute on function public.notify_user(uuid,text,text,text,text,text,text,text) from public, anon, authenticated;
revoke execute on function public.notify_perm(text,text,text,text,text,text,text,text) from public, anon, authenticated;

-- ───────────── RLS ─────────────
alter table public.departments enable row level security;
alter table public.profiles enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_roles enable row level security;
alter table public.user_permissions enable row level security;
alter table public.audit_log enable row level security;
alter table public.employee_invites enable row level security;
alter table public.device_pins enable row level security;
alter table public.notifications enable row level security;
alter table public.event_outbox enable row level security;
alter table public.push_subscriptions enable row level security;

create policy dep_read on public.departments for select to authenticated using (public.is_active());
create policy dep_write on public.departments for all to authenticated using (public.has_perm('employees.manage')) with check (public.has_perm('employees.manage'));

create policy prof_read on public.profiles for select to authenticated
  using (id = auth.uid() or (public.is_active() and (public.has_perm('employees.view') or status = 'active')));
create policy prof_update_self on public.profiles for update to authenticated
  using (id = auth.uid() or public.has_perm('employees.manage')) with check (id = auth.uid() or public.has_perm('employees.manage'));

create policy roles_read on public.roles for select to authenticated using (true);
create policy roles_write on public.roles for all to authenticated using (public.is_owner()) with check (public.is_owner());
create policy perms_read on public.permissions for select to authenticated using (true);
create policy rp_read on public.role_permissions for select to authenticated using (public.is_active());
create policy rp_write on public.role_permissions for all to authenticated using (public.is_owner()) with check (public.is_owner());
create policy ur_read on public.user_roles for select to authenticated using (user_id = auth.uid() or public.has_perm('employees.view'));
create policy ur_write on public.user_roles for all to authenticated using (public.has_perm('roles.manage')) with check (public.has_perm('roles.manage'));
create policy up_read on public.user_permissions for select to authenticated using (user_id = auth.uid() or public.has_perm('employees.view'));
create policy up_write on public.user_permissions for all to authenticated using (public.has_perm('roles.manage')) with check (public.has_perm('roles.manage'));

create policy audit_read on public.audit_log for select to authenticated using (public.has_perm('audit.view'));
create policy inv_read on public.employee_invites for select to authenticated using (public.has_perm('employees.invite'));
create policy pins_read on public.device_pins for select to authenticated using (user_id = auth.uid());
create policy pins_delete on public.device_pins for delete to authenticated using (user_id = auth.uid());
create policy notif_read on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notif_update on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy push_own on public.push_subscriptions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
-- event_outbox: доступ только служебный (нет политик)
