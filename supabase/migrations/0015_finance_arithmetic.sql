-- 0015. Арифметика финансов: валюты не смешиваются, черновики не создают долг.
--
-- 1) v_payroll_balance: корректировки учитываются только у УТВЕРЖДЁННЫХ начислений (раньше — у всех, включая черновики),
--    баланс считается отдельно по каждой валюте.
-- 2) Движение по кассе всегда в валюте кассы: платёж/расход/выплата в другой валюте отклоняется (без молчаливой конвертации).
-- 3) Платёж по счёту — только в валюте счёта.
-- 4) Выплата зарплаты записывается в валюте начисления/условий, а не всегда в KGS.

-- ───────────── 1. баланс по зарплате ─────────────
drop view if exists public.v_payroll_balance;
create view public.v_payroll_balance with (security_invoker = true) as
select p.id as user_id, p.full_name, cur.currency,
  coalesce((select sum(a.total_minor) from public.payroll_accruals a
             where a.user_id = p.id and a.status = 'approved' and a.currency = cur.currency), 0)
  + coalesce((select sum(adj.amount_minor) from public.payroll_adjustments adj join public.payroll_accruals a on a.id = adj.accrual_id
             where a.user_id = p.id and a.status = 'approved' and a.currency = cur.currency), 0) as accrued_minor,
  coalesce((select sum(s.amount_minor) from public.salary_payments s where s.user_id = p.id and s.currency = cur.currency), 0) as paid_minor
from public.profiles p
cross join lateral (
  select t.currency from public.salary_terms t where t.user_id = p.id
  union select a.currency from public.payroll_accruals a where a.user_id = p.id
  union select s.currency from public.salary_payments s where s.user_id = p.id
) cur
where exists (select 1 from public.salary_terms t where t.user_id = p.id);
comment on view public.v_payroll_balance is
  'Долг компании сотруднику = утверждённые начисления + корректировки к ним − все выплаты (аванс, зарплата, бонус, зачёт). Черновики не учитываются. По валютам раздельно.';

-- ───────────── 2. касса и валюта движения ─────────────
create or replace function public.money_tx_currency_guard()
returns trigger language plpgsql as $$
declare acc_cur text;
begin
  select currency into acc_cur from public.financial_accounts where id = new.account_id;
  if acc_cur is null then raise exception 'Счёт/касса не найдены'; end if;
  -- ручная корректировка вводится в валюте выбранной кассы
  if new.source_type = 'adjustment' then new.currency := acc_cur; end if;
  if new.currency is distinct from acc_cur then
    raise exception 'Валюта операции (%) не совпадает с валютой кассы (%). Выберите кассу в % — конвертация не выполняется автоматически.', new.currency, acc_cur, new.currency;
  end if;
  return new;
end $$;
drop trigger if exists money_tx_currency_trg on public.money_transactions;
create trigger money_tx_currency_trg before insert on public.money_transactions for each row execute function public.money_tx_currency_guard();

-- ───────────── 3. платёж по счёту — в валюте счёта ─────────────
create or replace function public.payments_currency_guard()
returns trigger language plpgsql as $$
declare inv_cur text;
begin
  if new.invoice_id is not null then
    select currency into inv_cur from public.invoices where id = new.invoice_id;
    if inv_cur is distinct from new.currency then
      raise exception 'Валюта платежа (%) не совпадает с валютой счёта (%)', new.currency, inv_cur;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists payments_currency_trg on public.payments;
create trigger payments_currency_trg before insert or update of currency, invoice_id on public.payments for each row execute function public.payments_currency_guard();

-- ───────────── 4. выплата зарплаты в правильной валюте ─────────────
create or replace function public.salary_pay(p_user uuid, p_accrual uuid, p_kind text, p_amount bigint, p_date date, p_account uuid, p_note text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; a public.payroll_accruals; v_cur text; acc_cur text;
begin
  if not public.has_perm('payroll.pay') then raise exception 'Нет права payroll.pay'; end if;
  if p_kind not in ('advance','salary','bonus','offset') then raise exception 'Недопустимый вид выплаты'; end if;
  if p_account is null and p_kind <> 'offset' then raise exception 'Выберите счёт выплаты'; end if;
  if coalesce(p_amount,0) <= 0 then raise exception 'Сумма должна быть больше нуля'; end if;
  if p_accrual is not null then
    select * into a from public.payroll_accruals where id = p_accrual and user_id = p_user;
    if not found then raise exception 'Начисление не найдено'; end if;
    if a.status <> 'approved' and p_kind <> 'advance' then raise exception 'Основная выплата — только по утверждённому начислению'; end if;
    v_cur := a.currency;
  else
    v_cur := coalesce((select currency from public.salary_terms where user_id = p_user and effective_from <= coalesce(p_date, current_date)
                        order by effective_from desc limit 1), 'KGS');
  end if;
  if p_kind <> 'offset' then
    select currency into acc_cur from public.financial_accounts where id = p_account;
    if acc_cur is distinct from v_cur then raise exception 'Зарплата в %, а касса в % — выберите кассу в %', v_cur, acc_cur, v_cur; end if;
  end if;
  insert into public.salary_payments(user_id, accrual_id, kind, amount_minor, currency, paid_on, account_id, note, created_by)
  values (p_user, p_accrual, p_kind, p_amount, v_cur, coalesce(p_date, current_date), p_account, p_note, auth.uid()) returning id into v_id;
  -- зачёт (offset) уменьшает долг, но деньги не двигаются — движения по кассе нет
  if p_kind <> 'offset' then
    insert into public.money_transactions(account_id, direction, amount_minor, currency, occurred_on, source_type, source_id, description, created_by)
    values (p_account, 'out', p_amount, v_cur, coalesce(p_date, current_date), 'salary', v_id, 'Зарплата: ' || (select full_name from public.profiles where id = p_user), auth.uid());
  end if;
  perform public.audit('salary.pay', 'profile', p_user::text, jsonb_build_object('amount', p_amount, 'kind', p_kind, 'currency', v_cur));
  perform public.notify_user(p_user, 'salary.paid', 'Зарегистрирована выплата',
    (p_amount / 100)::text || ' ' || case when v_cur = 'KGS' then 'сом' else v_cur end, 'payroll', v_id::text, 'normal', 'sp:' || v_id);
  return v_id;
end $$;
