// Финансовые сводки. Источник истины — подтверждённые движения по кассам (money_transactions), одна запись на событие.
// Валюты считаются раздельно: KGS 100 000 и USD 500 — это два остатка, а не «100 500».
import { addTo, type Money } from "./ads-math";

export type Tx = { direction: string; amount_minor: number | string; currency: string; source_type: string };

export type CashSummary = {
  inflow: Money; // подтверждённые поступления от клиентов
  refunds: Money; // возвраты клиентам
  expenses: Money; // подтверждённые расходы минус сторно расходов
  salaries: Money; // фактические выплаты зарплат (аванс/зарплата/бонус; зачёт без движения денег сюда не попадает)
  adjustmentsIn: Money;
  adjustmentsOut: Money;
  /** Денежный поток = поступления − возвраты − расходы − зарплаты ± корректировки. Это НЕ прибыль. */
  net: Money;
};

export function cashSummary(txs: Tx[]): CashSummary {
  const s: CashSummary = { inflow: {}, refunds: {}, expenses: {}, salaries: {}, adjustmentsIn: {}, adjustmentsOut: {}, net: {} };
  for (const t of txs) {
    const a = Number(t.amount_minor);
    const c = t.currency;
    switch (t.source_type) {
      case "payment":
        if (t.direction === "in") addTo(s.inflow, c, a);
        break;
      case "refund":
        addTo(s.refunds, c, a);
        break;
      case "expense":
        addTo(s.expenses, c, a);
        break;
      case "reversal": // сторно подтверждённого расхода возвращает деньги в кассу
        addTo(s.expenses, c, -a);
        break;
      case "salary":
        addTo(s.salaries, c, a);
        break;
      case "adjustment":
        addTo(t.direction === "in" ? s.adjustmentsIn : s.adjustmentsOut, c, a);
        break;
    }
    addTo(s.net, c, t.direction === "in" ? a : -a);
  }
  return s;
}

export type InvoiceRow = { amount_minor: number | string; paid_minor: number | string; currency?: string | null; pay_state?: string; issued_on?: string };

/** Дебиторка: остаток по каждому неотменённому счёту, переплата не уменьшает долг по другим счетам. */
export function receivables(invoices: InvoiceRow[]): Money {
  const m: Money = {};
  for (const i of invoices) {
    if (i.pay_state === "void") continue;
    const left = Number(i.amount_minor) - Number(i.paid_minor);
    if (left > 0) addTo(m, i.currency ?? "KGS", left);
  }
  return m;
}

/** Переплаты клиентов показываются отдельно, а не гасят чужой долг. */
export function overpayments(invoices: InvoiceRow[]): Money {
  const m: Money = {};
  for (const i of invoices) {
    if (i.pay_state === "void") continue;
    const over = Number(i.paid_minor) - Number(i.amount_minor);
    if (over > 0) addTo(m, i.currency ?? "KGS", over);
  }
  return m;
}

/** Оплачено по счёту = подтверждённые поступления − подтверждённые возвраты (ожидающие и отклонённые не считаются). */
export function invoicePaid(payments: { kind: string; status: string; amount_minor: number }[]): number {
  return payments.reduce((a, p) => (p.status !== "confirmed" ? a : p.kind === "refund" ? a - p.amount_minor : a + p.amount_minor), 0);
}

export type PayrollBalance = { accrued_minor: number | string; paid_minor: number | string; currency?: string | null };

/** Долг компании перед сотрудниками: только положительные остатки; переплата (аванс до утверждения) не гасит чужой долг. */
export function payrollDebt(rows: PayrollBalance[]): Money {
  const m: Money = {};
  for (const r of rows) {
    const d = Number(r.accrued_minor) - Number(r.paid_minor);
    if (d > 0) addTo(m, r.currency ?? "KGS", d);
  }
  return m;
}

export function balancesByCurrency(accounts: { currency: string; balance_minor: number | string }[]): Money {
  const m: Money = {};
  for (const a of accounts) addTo(m, a.currency, Number(a.balance_minor));
  return m;
}

/** План-факт материала: остаток подготовить/опубликовать от договорного плана (план не уменьшается отменой задач). */
export function contentLeft(planned: number, prepared: number, published: number) {
  return { leftToPrepare: Math.max(0, planned - prepared), leftToPublish: Math.max(0, planned - published), overflow: Math.max(0, prepared - planned) };
}

/** Сдельная оплата: один проверенный материал — одна единица, сколько бы площадок ни было. */
export function pieceworkTotal(items: { id: string; kind: string }[], rates: Record<string, number>): number {
  const seen = new Set<string>();
  let total = 0;
  for (const i of items) {
    if (seen.has(i.id)) continue;
    seen.add(i.id);
    total += rates[i.kind] ?? 0;
  }
  return total;
}

/** Ближайшая дата выплаты по дню месяца (Бишкек): 31-е в коротком месяце — последний день месяца. */
export function nextPayDate(payDay: number, today: string): string {
  const [y, m] = today.split("-").map(Number);
  const inMonth = (yy: number, mm: number) => {
    const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate(); // mm — 1..12
    return `${yy}-${String(mm).padStart(2, "0")}-${String(Math.min(payDay, last)).padStart(2, "0")}`;
  };
  const cur = inMonth(y, m);
  if (cur >= today) return cur;
  return m === 12 ? inMonth(y + 1, 1) : inMonth(y, m + 1);
}
