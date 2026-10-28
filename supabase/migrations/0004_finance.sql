-- Цитадель · 0004 · финансы, расходы, имущество, зарплаты, настройки, напоминания
-- Все суммы — bigint в минимальных единицах валюты (тыйын/цент). Никаких float.

create table public.app_settings (
  key text primary key,
  value text not null,
  label text,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

-- ───────────── счета и движения ─────────────
create table public.financial_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'cash' check (kind in ('cash','bank','card','other')),
  currency text not null default 'KGS',
  opening_balance_minor bigint not null default 0,
  opening_date date not null default current_date,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.money_transactions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.financial_accounts(id),
  direction text not null check (direction in ('in','out')),
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null default 'KGS',
  occurred_on date not null,
  source_type text not null, -- payment, refund, expense, salary, adjustment, reversal
  source_id uuid,
  description text,
  reverses_id uuid references public.money_transactions(id),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (source_type, source_id, direction)
);
create index mt_account_idx on public.money_transactions(account_id, occurred_on);

-- ───────────── клиентские счета и оплаты ─────────────
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity,
  project_id uuid not null references public.projects(id),
  period_id uuid references public.project_periods(id),
  title text not null,
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null default 'KGS',
  issued_on date not null default current_date,
  due_on date not null,
  status text not null default 'open' check (status in ('open','void')),
  void_reason text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index invoices_project_idx on public.invoices(project_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references public.invoices(id),
  project_id uuid not null references public.projects(id),
  kind text not null default 'payment' check (kind in ('payment','refund')),
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null default 'KGS',
  paid_on date not null default current_date,
  method text,
  account_id uuid references public.financial_accounts(id),
  document_path text,
  note text,
  status text not null default 'pending' check (status in ('pending','confirmed','rejected')),
  created_by uuid not null references public.profiles(id),
  confirmed_by uuid references public.profiles(id),
  confirmed_at timestamptz,
  reject_reason text,
  created_at timestamptz not null default now()
);
create index payments_project_idx on public.payments(project_id, status);

create or replace function public.payments_guard()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated','anon') then
    if tg_op = 'INSERT' then
      new.status := 'pending'; new.confirmed_by := null; new.confirmed_at := null; new.created_by := auth.uid();
    elsif tg_op = 'UPDATE' and (old.status <> 'pending' or new.status is distinct from old.status
       or new.confirmed_by is distinct from old.confirmed_by or new.amount_minor is distinct from old.amount_minor) then
      raise exception 'Подтверждённые платежи не редактируются; статус меняется только через подтверждение';
    end if;
  end if;
  return new;
end $$;
create trigger payments_guard_trg before insert or update on public.payments for each row execute function public.payments_guard();

create or replace function public.project_paid_status(p_project uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'invoiced', coalesce((select sum(amount_minor) from public.invoices where project_id = p_project and status <> 'void'), 0),
    'paid', coalesce((select sum(case when kind='refund' then -amount_minor else amount_minor end) from public.payments
                      where project_id = p_project and status = 'confirmed'), 0),
    'pending', coalesce((select sum(amount_minor) from public.payments where project_id = p_project and status = 'pending' and kind = 'payment'), 0),
    'price', (select price_minor from public.project_contracts where project_id = p_project));
$$;

-- Подтверждение: независимое (не автор), отражается движением по счёту
create or replace function public.payment_confirm(p_id uuid, p_account uuid)
returns void language plpgsql security definer set search_path = public as $$
declare p public.payments;
begin
  if not public.has_perm('payments.confirm') then raise exception 'Нет права payments.confirm'; end if;
  select * into p from public.payments where id = p_id for update;
  if not found or p.status <> 'pending' then raise exception 'Платёж не ожидает подтверждения'; end if;
  if p.created_by = auth.uid() and not public.is_owner() then
    raise exception 'Нельзя подтвердить собственноручно внесённый платёж — нужно независимое подтверждение'; end if;
  if coalesce(p_account, p.account_id) is null then raise exception 'Выберите счёт/кассу поступления'; end if;
  update public.payments set status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = now(), account_id = coalesce(p_account, account_id) where id = p_id;
  insert into public.money_transactions(account_id, direction, amount_minor, currency, occurred_on, source_type, source_id, description, created_by)
  values (coalesce(p_account, p.account_id), case when p.kind = 'refund' then 'out' else 'in' end, p.amount_minor, p.currency, p.paid_on,
          p.kind, p.id, 'Проект: ' || (select name from public.projects where id = p.project_id), auth.uid());
  perform public.audit('payment.confirm', 'payment', p_id::text, jsonb_build_object('amount', p.amount_minor, 'kind', p.kind));
  perform public.notify_user(p.created_by, 'payment.confirmed', 'Платёж подтверждён', (p.amount_minor / 100)::text || ' ' || p.currency, 'project', p.project_id::text, 'normal', 'pc:' || p_id);
end $$;

create or replace function public.payment_reject(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_perm('payments.confirm') then raise exception 'Нет права payments.confirm'; end if;
  if coalesce(trim(p_reason),'') = '' then raise exception 'Укажите причину'; end if;
  update public.payments set status = 'rejected', reject_reason = p_reason, confirmed_by = auth.uid(), confirmed_at = now()
   where id = p_id and status = 'pending';
  if not found then raise exception 'Платёж не ожидает подтверждения'; end if;
  perform public.audit('payment.reject', 'payment', p_id::text, jsonb_build_object('reason', p_reason));
end $$;

create or replace function public.notify_new_payment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.notify_perm('payments.confirm', 'payment.pending', 'Платёж ожидает подтверждения',
    (new.amount_minor / 100)::text || ' ' || new.currency || ' · ' || (select name from public.projects where id = new.project_id),
    'project', new.project_id::text, 'high', 'pp:' || new.id);
  return new;
end $$;
create trigger payments_notify after insert on public.payments for each row execute function public.notify_new_payment();

create or replace view public.v_invoice_status with (security_invoker = true) as
select i.*, coalesce(sum(p.amount_minor) filter (where p.status = 'confirmed' and p.kind = 'payment'), 0)
          - coalesce(sum(p.amount_minor) filter (where p.status = 'confirmed' and p.kind = 'refund'), 0) as paid_minor,
  case when i.status = 'void' then 'void'
       when coalesce(sum(p.amount_minor) filter (where p.status = 'confirmed' and p.kind = 'payment'), 0)
          - coalesce(sum(p.amount_minor) filter (where p.status = 'confirmed' and p.kind = 'refund'), 0) >= i.amount_minor then 'paid'
       when i.due_on < current_date then 'overdue'
       when coalesce(sum(p.amount_minor) filter (where p.status = 'confirmed' and p.kind = 'payment'), 0) > 0 then 'partial'
       else 'unpaid' end as pay_state
from public.invoices i left join public.payments p on p.invoice_id = i.id
group by i.id;

-- ───────────── расходы и имущество ─────────────
create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  parent_id uuid references public.expense_categories(id),
  requires_project boolean not null default false,
  sort int not null default 100,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null default 'KGS',
  purchased_on date not null default current_date,
  paid_on date,
  vendor text,
  description text not null,
  category_id uuid not null references public.expense_categories(id),
  tags text[] not null default '{}',
  project_id uuid references public.projects(id),
  department_id uuid references public.departments(id),
  account_id uuid references public.financial_accounts(id),
  method text,
  receipt_path text,
  responsible_id uuid references public.profiles(id),
  status text not null default 'pending' check (status in ('draft','pending','confirmed','cancelled')),
  recurrence text check (recurrence in ('monthly','weekly','yearly')),
  is_asset boolean not null default false,
  cancel_reason text,
  created_by uuid not null references public.profiles(id),
  confirmed_by uuid references public.profiles(id),
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);
create index expenses_date_idx on public.expenses(purchased_on);

create table public.asset_register (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid unique references public.expenses(id),
  name text not null,
  type text,
  model text,
  serial text,
  price_minor bigint,
  currency text default 'KGS',
  acquired_on date,
  location text,
  responsible_id uuid references public.profiles(id),
  status text not null default 'in_use' check (status in ('in_use','repair','storage','written_off','lost')),
  notes text,
  created_at timestamptz not null default now()
);

create or replace function public.expenses_guard()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated','anon') then
    if tg_op = 'INSERT' then
      if new.status not in ('draft','pending') then new.status := 'pending'; end if;
      new.confirmed_by := null; new.confirmed_at := null; new.created_by := auth.uid();
    elsif old.status in ('confirmed','cancelled') or new.status in ('confirmed','cancelled') then
      raise exception 'Подтверждённые расходы меняются только через подтверждение/сторно';
    end if;
  end if;
  if (select requires_project from public.expense_categories where id = new.category_id) and new.project_id is null then
    raise exception 'Для этой категории требуется проект';
  end if;
  return new;
end $$;
create trigger expenses_guard_trg before insert or update on public.expenses for each row execute function public.expenses_guard();

create or replace function public.expense_confirm(p_id uuid, p_account uuid, p_asset jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
declare e public.expenses;
begin
  if not public.has_perm('expenses.confirm') then raise exception 'Нет права expenses.confirm'; end if;
  select * into e from public.expenses where id = p_id for update;
  if not found or e.status not in ('pending','draft') then raise exception 'Расход не ожидает подтверждения'; end if;
  if coalesce(p_account, e.account_id) is null then raise exception 'Выберите счёт/кассу оплаты'; end if;
  update public.expenses set status = 'confirmed', confirmed_by = auth.uid(), confirmed_at = now(),
     account_id = coalesce(p_account, account_id), paid_on = coalesce(paid_on, purchased_on) where id = p_id;
  insert into public.money_transactions(account_id, direction, amount_minor, currency, occurred_on, source_type, source_id, description, created_by)
  values (coalesce(p_account, e.account_id), 'out', e.amount_minor, e.currency, coalesce(e.paid_on, e.purchased_on), 'expense', e.id, e.description, auth.uid());
  -- имущество: связанная карточка, без второго списания
  if e.is_asset then
    insert into public.asset_register(expense_id, name, type, model, serial, price_minor, currency, acquired_on, location, responsible_id)
    values (e.id, coalesce(nullif(p_asset->>'name',''), e.description), p_asset->>'type', p_asset->>'model', p_asset->>'serial',
            e.amount_minor, e.currency, e.purchased_on, p_asset->>'location', coalesce(nullif(p_asset->>'responsible_id','')::uuid, e.responsible_id))
    on conflict (expense_id) do nothing;
  end if;
  perform public.audit('expense.confirm', 'expense', p_id::text, jsonb_build_object('amount', e.amount_minor));
end $$;

-- Сторно: подтверждённое движение не удаляется, создаётся компенсирующая запись
create or replace function public.expense_cancel(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare e public.expenses; t public.money_transactions;
begin
  if not public.has_perm('expenses.confirm') then raise exception 'Нет прав'; end if;
  if coalesce(trim(p_reason),'') = '' then raise exception 'Укажите причину'; end if;
  select * into e from public.expenses where id = p_id for update;
  if e.status = 'cancelled' then raise exception 'Уже отменён'; end if;
  if e.status = 'confirmed' then
    select * into t from public.money_transactions where source_type = 'expense' and source_id = p_id and direction = 'out';
    insert into public.money_transactions(account_id, direction, amount_minor, currency, occurred_on, source_type, source_id, description, reverses_id, created_by)
    values (t.account_id, 'in', t.amount_minor, t.currency, current_date, 'reversal', p_id, 'Сторно: ' || p_reason, t.id, auth.uid());
  end if;
  update public.expenses set status = 'cancelled', cancel_reason = p_reason where id = p_id;
  perform public.audit('expense.cancel', 'expense', p_id::text, jsonb_build_object('reason', p_reason));
end $$;

-- ───────────── зарплаты ─────────────
create type public.pay_type as enum ('fixed','piecework','mixed');
create table public.salary_terms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  pay_type public.pay_type not null,
  base_minor bigint not null default 0 check (base_minor >= 0),
  piece_rules jsonb not null default '[]', -- [{"kind":"video","rate_minor":100000}]
  bonus_rules text,
  pay_days int[] not null default '{5}',   -- одна или две даты (аванс + основная)
  currency text not null default 'KGS',
  effective_from date not null,
  contract_end date,
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (user_id, effective_from)
);

create table public.payroll_accruals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  period_month date not null check (extract(day from period_month) = 1),
  terms_id uuid references public.salary_terms(id),
  base_minor bigint not null default 0,
  piece_minor bigint not null default 0,
  piece_detail jsonb not null default '[]',
  bonus_minor bigint not null default 0,
  deduction_minor bigint not null default 0,
  total_minor bigint generated always as (base_minor + piece_minor + bonus_minor - deduction_minor) stored,
  currency text not null default 'KGS',
  status text not null default 'draft' check (status in ('draft','approved')),
  note text,
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (user_id, period_month)
);

create table public.payroll_adjustments (
  id uuid primary key default gen_random_uuid(),
  accrual_id uuid not null references public.payroll_accruals(id),
  amount_minor bigint not null check (amount_minor <> 0),
  reason text not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.salary_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  accrual_id uuid references public.payroll_accruals(id),
  kind text not null default 'salary' check (kind in ('advance','salary','bonus','offset')),
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null default 'KGS',
  paid_on date not null default current_date,
  account_id uuid references public.financial_accounts(id),
  note text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create or replace function public.accruals_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'approved' then raise exception 'Утверждённое начисление нельзя удалить — используйте корректировку'; end if;
    return old;
  end if;
  if old.status = 'approved' then raise exception 'Утверждённое начисление не меняется — используйте корректировку'; end if;
  return new;
end $$;
create trigger accruals_guard_trg before update or delete on public.payroll_accruals for each row execute function public.accruals_guard();

-- Расчёт черновика начисления по действующим на месяц условиям
create or replace function public.payroll_compute(p_user uuid, p_month date)
returns uuid language plpgsql security definer set search_path = public as $$
declare m date := date_trunc('month', p_month)::date; t public.salary_terms; v_piece bigint := 0; v_detail jsonb := '[]'; r jsonb; cnt int; v_id uuid;
begin
  if not public.has_perm('payroll.manage') then raise exception 'Нет права payroll.manage'; end if;
  select * into t from public.salary_terms where user_id = p_user and effective_from <= (m + interval '1 month - 1 day')::date
   order by effective_from desc limit 1;
  if not found then raise exception 'У сотрудника нет зарплатных условий на этот месяц'; end if;
  if t.pay_type in ('piecework','mixed') then
    for r in select * from jsonb_array_elements(t.piece_rules) loop
      select count(*) into cnt from public.content_items
       where assignee_id = p_user and kind::text = r->>'kind' and status in ('done','published')
         and approved_at >= m and approved_at < m + interval '1 month';
      v_piece := v_piece + cnt * coalesce((r->>'rate_minor')::bigint, 0);
      v_detail := v_detail || jsonb_build_object('kind', r->>'kind', 'count', cnt, 'rate_minor', (r->>'rate_minor')::bigint);
    end loop;
  end if;
  insert into public.payroll_accruals(user_id, period_month, terms_id, base_minor, piece_minor, piece_detail, currency, created_by)
  values (p_user, m, t.id, case when t.pay_type in ('fixed','mixed') then t.base_minor else 0 end, v_piece, v_detail, t.currency, auth.uid())
  on conflict (user_id, period_month) do update set terms_id = excluded.terms_id, base_minor = excluded.base_minor,
     piece_minor = excluded.piece_minor, piece_detail = excluded.piece_detail
  returning id into v_id;
  perform public.audit('payroll.compute', 'accrual', v_id::text, null);
  return v_id;
end $$;

create or replace function public.payroll_approve(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare a public.payroll_accruals;
begin
  if not public.has_perm('payroll.approve') then raise exception 'Нет права payroll.approve'; end if;
  select * into a from public.payroll_accruals where id = p_id;
  if a.created_by = auth.uid() and not public.is_owner() then raise exception 'Начисление утверждает другой уполномоченный'; end if;
  update public.payroll_accruals set status = 'approved', approved_by = auth.uid(), approved_at = now() where id = p_id and status = 'draft';
  if not found then raise exception 'Начисление уже утверждено'; end if;
  perform public.audit('payroll.approve', 'accrual', p_id::text, jsonb_build_object('total', a.total_minor));
  perform public.notify_user(a.user_id, 'payroll.approved', 'Начисление утверждено', to_char(a.period_month, 'MM.YYYY'), 'payroll', p_id::text, 'normal', 'pa:' || p_id);
end $$;

create or replace function public.salary_pay(p_user uuid, p_accrual uuid, p_kind text, p_amount bigint, p_date date, p_account uuid, p_note text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; a public.payroll_accruals;
begin
  if not public.has_perm('payroll.pay') then raise exception 'Нет права payroll.pay'; end if;
  if p_account is null and p_kind <> 'offset' then raise exception 'Выберите счёт выплаты'; end if;
  if coalesce(p_amount,0) <= 0 then raise exception 'Сумма должна быть больше нуля'; end if;
  if p_accrual is not null then
    select * into a from public.payroll_accruals where id = p_accrual and user_id = p_user;
    if not found then raise exception 'Начисление не найдено'; end if;
    if a.status <> 'approved' and p_kind <> 'advance' then raise exception 'Основная выплата — только по утверждённому начислению'; end if;
  end if;
  insert into public.salary_payments(user_id, accrual_id, kind, amount_minor, paid_on, account_id, note, created_by)
  values (p_user, p_accrual, p_kind, p_amount, coalesce(p_date, current_date), p_account, p_note, auth.uid()) returning id into v_id;
  if p_kind <> 'offset' then
    insert into public.money_transactions(account_id, direction, amount_minor, occurred_on, source_type, source_id, description, created_by)
    values (p_account, 'out', p_amount, coalesce(p_date, current_date), 'salary', v_id, 'Зарплата: ' || (select full_name from public.profiles where id = p_user), auth.uid());
  end if;
  perform public.audit('salary.pay', 'profile', p_user::text, jsonb_build_object('amount', p_amount, 'kind', p_kind));
  perform public.notify_user(p_user, 'salary.paid', 'Зарегистрирована выплата', (p_amount/100)::text || ' сом', 'payroll', v_id::text, 'normal', 'sp:' || v_id);
  return v_id;
end $$;

-- Баланс по сотруднику: утверждённые начисления + корректировки − выплаты
create or replace view public.v_payroll_balance with (security_invoker = true) as
select p.id as user_id, p.full_name,
  coalesce((select sum(total_minor) from public.payroll_accruals a where a.user_id = p.id and a.status = 'approved'), 0)
  + coalesce((select sum(adj.amount_minor) from public.payroll_adjustments adj join public.payroll_accruals a on a.id = adj.accrual_id where a.user_id = p.id), 0) as accrued_minor,
  coalesce((select sum(amount_minor) from public.salary_payments s where s.user_id = p.id), 0) as paid_minor
from public.profiles p
where exists (select 1 from public.salary_terms t where t.user_id = p.id);

create or replace view public.v_account_balances with (security_invoker = true) as
select a.id, a.name, a.kind, a.currency, a.opening_balance_minor,
  coalesce(sum(t.amount_minor) filter (where t.direction = 'in'), 0) as inflow_minor,
  coalesce(sum(t.amount_minor) filter (where t.direction = 'out'), 0) as outflow_minor,
  a.opening_balance_minor + coalesce(sum(t.amount_minor) filter (where t.direction = 'in'), 0)
    - coalesce(sum(t.amount_minor) filter (where t.direction = 'out'), 0) as balance_minor
from public.financial_accounts a left join public.money_transactions t on t.account_id = a.id
where a.archived_at is null
group by a.id;

-- ───────────── напоминания и эскалации (идемпотентно, по крону) ─────────────
create or replace function public.run_reminders()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; sla int := coalesce((select value::int from public.app_settings where key = 'lead_sla_minutes'), 15);
  pay_ahead int := coalesce((select value::int from public.app_settings where key = 'payroll_notify_days'), 3);
begin
  -- съёмки за 24 ч и за 2 ч
  for r in select s.id, s.title, s.starts_at, sp.user_id, sp.response from public.shoots s join public.shoot_participants sp on sp.shoot_id = s.id
            where s.status = 'planned' and s.starts_at between now() and now() + interval '24 hours' loop
    perform public.notify_user(r.user_id, 'shoot.soon', case when r.starts_at < now() + interval '2 hours' then 'Съёмка через 2 часа' else 'Съёмка в ближайшие 24 часа' end,
      r.title || ' · ' || to_char(r.starts_at at time zone 'Asia/Bishkek', 'DD.MM HH24:MI') || case when r.response = 'pending' then ' · подтвердите участие' else '' end,
      'shoot', r.id::text, 'high', 'soon:' || r.id || ':' || r.user_id || ':' || case when r.starts_at < now() + interval '2 hours' then '2h' else '24h' end);
    n := n + 1;
  end loop;
  -- просроченные материалы (раз в сутки)
  for r in select c.id, c.title, c.assignee_id, p.admin_id from public.content_items c join public.projects p on p.id = c.project_id
            where c.status not in ('done','published','cancelled','paused','review') and c.prep_due < now() and c.assignee_id is not null loop
    perform public.notify_user(r.assignee_id, 'content.overdue', 'Просрочен материал', r.title, 'content', r.id::text, 'high', 'od:' || r.id || ':' || current_date);
    if r.admin_id is not null then
      perform public.notify_user(r.admin_id, 'content.overdue', 'Просрочка у исполнителя', r.title, 'content', r.id::text, 'high', 'oda:' || r.id || ':' || current_date);
    end if;
    n := n + 1;
  end loop;
  -- просроченная проверка
  for r in select c.id, c.title, coalesce(c.reviewer_id, p.admin_id) as rev from public.content_items c join public.projects p on p.id = c.project_id
            where c.status = 'review' and c.review_due < now() loop
    if r.rev is not null then
      perform public.notify_user(r.rev, 'review.overdue', 'Просрочена проверка', r.title, 'content', r.id::text, 'high', 'rod:' || r.id || ':' || current_date);
    end if;
  end loop;
  -- просроченные задачи
  for r in select id, title, assignee_id from public.tasks where status in ('todo','in_progress','revision') and due_at < now() and assignee_id is not null loop
    perform public.notify_user(r.assignee_id, 'task.overdue', 'Просрочена задача', r.title, 'task', r.id::text, 'high', 'tod:' || r.id || ':' || current_date);
  end loop;
  -- эскалация невзятых заявок (однократно)
  for r in select id, name, phone from public.leads where stage = 'new' and assignee_id is null and escalated_at is null
            and created_at < now() - make_interval(mins => sla) loop
    perform public.notify_perm('leads.manage', 'lead.escalation', 'Заявка не взята в работу > ' || sla || ' мин', r.name || ' · ' || r.phone, 'lead', r.id::text, 'critical', 'esc:' || r.id);
    update public.leads set escalated_at = now() where id = r.id;
  end loop;
  -- счета: срок оплаты и просрочка
  for r in select id, title, due_on, pay_state, project_id from public.v_invoice_status where pay_state in ('unpaid','partial','overdue') and due_on <= current_date + 2 loop
    perform public.notify_perm('finance.manage', 'invoice.due', case when r.pay_state = 'overdue' then 'Просрочена оплата счёта' else 'Скоро срок оплаты' end,
      r.title || ' · до ' || to_char(r.due_on, 'DD.MM'), 'project', r.project_id::text, 'high', 'inv:' || r.id || ':' || r.pay_state || ':' || current_date);
  end loop;
  -- дни выплат зарплаты (только финуполномоченным)
  for r in select distinct on (t.user_id) t.user_id, p.full_name, d as day
             from public.salary_terms t join public.profiles p on p.id = t.user_id and p.status = 'active', unnest(t.pay_days) d
            where t.effective_from <= current_date and (t.contract_end is null or t.contract_end >= current_date)
              and d between extract(day from current_date)::int and extract(day from current_date)::int + pay_ahead
            order by t.user_id, t.effective_from desc loop
    perform public.notify_perm('payroll.pay', 'payroll.due', 'Скоро выплата зарплаты', r.full_name || ' · ' || r.day || '-е число', 'payroll', r.user_id::text, 'normal', 'pd:' || r.user_id || ':' || to_char(current_date, 'YYYY-MM') || ':' || r.day);
  end loop;
  -- ежедневные проверки администратора
  insert into public.project_admin_checks(project_id, admin_id, day, due_at)
  select p.id, p.admin_id, (now() at time zone 'Asia/Bishkek')::date, ((now() at time zone 'Asia/Bishkek')::date + time '20:00') at time zone 'Asia/Bishkek'
    from public.projects p where p.status = 'in_progress' and p.admin_id is not null
  on conflict (project_id, day) do nothing;
  return jsonb_build_object('processed', n);
end $$;
revoke execute on function public.run_reminders() from public, anon, authenticated;

-- ───────────── RLS ─────────────
alter table public.app_settings enable row level security;
alter table public.financial_accounts enable row level security;
alter table public.money_transactions enable row level security;
alter table public.invoices enable row level security;
alter table public.payments enable row level security;
alter table public.expense_categories enable row level security;
alter table public.expenses enable row level security;
alter table public.asset_register enable row level security;
alter table public.salary_terms enable row level security;
alter table public.payroll_accruals enable row level security;
alter table public.payroll_adjustments enable row level security;
alter table public.salary_payments enable row level security;

create policy settings_read on public.app_settings for select to authenticated using (public.is_active());
create policy settings_write on public.app_settings for update to authenticated using (public.is_owner()) with check (public.is_owner());

create policy fa_read on public.financial_accounts for select to authenticated
  using (public.has_perm('finance.view') or public.has_perm('payments.confirm') or public.has_perm('expenses.create') or public.has_perm('payroll.pay'));
create policy fa_write on public.financial_accounts for all to authenticated using (public.has_perm('finance.manage')) with check (public.has_perm('finance.manage'));
create policy mt_read on public.money_transactions for select to authenticated using (public.has_perm('finance.view'));
create policy mt_adjust on public.money_transactions for insert to authenticated
  with check (public.has_perm('finance.manage') and source_type = 'adjustment' and created_by = auth.uid());

create policy invoices_read on public.invoices for select to authenticated using (public.has_perm('finance.view') or public.has_perm('payments.create'));
create policy invoices_insert on public.invoices for insert to authenticated with check (public.has_perm('finance.manage') and created_by = auth.uid());
create policy invoices_update on public.invoices for update to authenticated using (public.has_perm('finance.manage')) with check (public.has_perm('finance.manage'));

create policy payments_read on public.payments for select to authenticated
  using (public.has_perm('finance.view') or public.has_perm('payments.confirm') or created_by = auth.uid());
create policy payments_insert on public.payments for insert to authenticated with check (public.has_perm('payments.create'));
create policy payments_update on public.payments for update to authenticated using (created_by = auth.uid() and status = 'pending');

create policy ec_read on public.expense_categories for select to authenticated using (public.has_perm('expenses.create') or public.has_perm('finance.view'));
create policy ec_write on public.expense_categories for all to authenticated using (public.has_perm('finance.manage')) with check (public.has_perm('finance.manage'));
create policy exp_read on public.expenses for select to authenticated using (public.has_perm('finance.view') or created_by = auth.uid());
create policy exp_insert on public.expenses for insert to authenticated with check (public.has_perm('expenses.create'));
create policy exp_update on public.expenses for update to authenticated using (created_by = auth.uid() or public.has_perm('finance.manage'));
create policy assets_read on public.asset_register for select to authenticated using (public.has_perm('finance.view') or responsible_id = auth.uid());
create policy assets_write on public.asset_register for all to authenticated using (public.has_perm('finance.manage')) with check (public.has_perm('finance.manage'));

-- зарплаты: сотрудник видит только своё утверждённое; остальные — по правам
create policy st_read on public.salary_terms for select to authenticated using (user_id = auth.uid() or public.has_perm('payroll.view'));
create policy st_insert on public.salary_terms for insert to authenticated with check (public.has_perm('payroll.manage') and created_by = auth.uid());
create policy pa_acc_read on public.payroll_accruals for select to authenticated using ((user_id = auth.uid() and status = 'approved') or public.has_perm('payroll.view'));
create policy pa_acc_update on public.payroll_accruals for update to authenticated using (public.has_perm('payroll.manage')) with check (public.has_perm('payroll.manage'));
create policy padj_read on public.payroll_adjustments for select to authenticated
  using (public.has_perm('payroll.view') or exists (select 1 from public.payroll_accruals a where a.id = accrual_id and a.user_id = auth.uid() and a.status = 'approved'));
create policy padj_insert on public.payroll_adjustments for insert to authenticated with check (public.has_perm('payroll.approve') and created_by = auth.uid());
create policy sp_pay_read on public.salary_payments for select to authenticated using (user_id = auth.uid() or public.has_perm('payroll.view'));
