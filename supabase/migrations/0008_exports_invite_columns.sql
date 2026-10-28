-- Цитадель · 0008 · журнал экспортов; зарплатные условия и хэш токена в приглашениях скрыты на уровне колонок
create table public.export_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id),
  kind text not null,
  params jsonb,
  created_at timestamptz not null default now()
);
alter table public.export_history enable row level security;
create policy export_insert on public.export_history for insert to authenticated with check (user_id = auth.uid() and public.is_active());
create policy export_read on public.export_history for select to authenticated using (user_id = auth.uid() or public.has_perm('audit.view'));

-- Приглашения: salary видно только через payroll-права (на сервере), token_hash — никому
revoke select on public.employee_invites from authenticated, anon;
grant select (id, full_name, email, phone, department_id, job_title, role_codes, manager_id, responsibilities, start_date,
  status, expires_at, created_by, created_at, used_by, used_at, revoked_at) on public.employee_invites to authenticated;
