import Link from "next/link";
import { requireActive } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, Empty, LoadError, PageHeader, Stat } from "@/components/ui";
import { ActionForm, Submit } from "@/components/action-form";
import { accounts as loadAccounts } from "@/lib/data";
import { PAY_TYPE } from "@/lib/labels";
import { date, minorToInput, money, moneyMulti, todayLocal } from "@/lib/format";
import { addDays } from "@/lib/ads-math";
import { nextPayDate, payrollDebt } from "@/lib/money-math";
import { addAdjustment, adjustDraft, approveAccrual, computeAll, computeAccrual, paySalary } from "./actions";

export const metadata = { title: "Зарплаты" };

type Accrual = { id: string; user_id: string; period_month: string; base_minor: number; piece_minor: number; piece_detail: { kind: string; count: number; rate_minor: number }[]; bonus_minor: number; deduction_minor: number; total_minor: number; currency: string; status: string; note: string | null; created_by: string };

export default async function Payroll({ searchParams }: PageProps<"/app/payroll">) {
  const sp = await searchParams;
  const s = await requireActive(["payroll.view", "payroll.pay"]);
  const supabase = await createClient();
  const month = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : todayLocal().slice(0, 7);
  const m1 = `${month}-01`;
  const next = new Date(m1 + "T12:00:00Z"); next.setUTCMonth(next.getUTCMonth() + 1);
  const m2 = next.toISOString().slice(0, 10);
  const [{ data: terms, error: e1 }, { data: acc, error: e2 }, { data: bal, error: e3 }, { data: pays, error: e4 }, accs, { data: adj }] = await Promise.all([
    supabase.from("salary_terms").select("user_id,pay_type,base_minor,pay_days,effective_from,contract_end,profiles!salary_terms_user_id_fkey(full_name,status)").order("effective_from", { ascending: false }),
    supabase.from("payroll_accruals").select("*").eq("period_month", m1),
    supabase.from("v_payroll_balance").select("*"),
    supabase.from("salary_payments").select("*").gte("paid_on", m1).lt("paid_on", m2).order("paid_on", { ascending: false }),
    loadAccounts(),
    supabase.from("payroll_adjustments").select("*, payroll_accruals!inner(period_month,user_id)").eq("payroll_accruals.period_month", m1),
  ]);
  if (e1 || e2 || e3 || e4) return <><PageHeader title="Зарплаты" /><LoadError retry={`/app/payroll?month=${month}`} /></>;
  // актуальные условия на месяц для каждого сотрудника
  const current = new Map<string, { user_id: string; pay_type: string; base_minor: number; pay_days: number[]; name: string; status: string }>();
  for (const t of (terms ?? []) as unknown as { user_id: string; pay_type: string; base_minor: number; pay_days: number[]; effective_from: string; profiles: { full_name: string; status: string } }[]) {
    if (t.effective_from < m2 && !current.has(t.user_id)) current.set(t.user_id, { ...t, name: t.profiles?.full_name ?? "", status: t.profiles?.status });
  }
  const accruals = new Map(((acc ?? []) as Accrual[]).map((a) => [a.user_id, a]));
  // баланс — по сотруднику и валюте (v_payroll_balance, 0015)
  const balRows = (bal ?? []) as { user_id: string; accrued_minor: number; paid_minor: number; currency: string }[];
  const debtOf = (uid: string) => payrollDebt(balRows.filter((b) => b.user_id === uid));
  const payments = (pays ?? []) as { id: string; user_id: string; kind: string; amount_minor: number; currency: string; paid_on: string; note: string | null }[];
  const adjBy = new Map<string, { amount_minor: number; reason: string }[]>();
  for (const a of (adj ?? []) as unknown as { accrual_id: string; amount_minor: number; reason: string }[]) (adjBy.get(a.accrual_id) ?? adjBy.set(a.accrual_id, []).get(a.accrual_id)!).push(a);
  const totalDebt = payrollDebt(balRows);
  const paidMonth: Record<string, number> = {};
  for (const p of payments) if (p.kind !== "offset") paidMonth[p.currency] = (paidMonth[p.currency] ?? 0) + Number(p.amount_minor);
  const today = todayLocal();
  const horizon = addDays(today, 7);
  // ближайшая выплата с учётом перехода месяца и 29/30/31 числа
  const soon = [...current.values()].filter((c) => c.status === "active" && c.pay_days.some((d) => nextPayDate(d, today) <= horizon));
  const people = [...current.values()].sort((a, b) => a.name.localeCompare(b.name));
  const prevMonth = new Date(m1 + "T12:00:00Z"); prevMonth.setUTCMonth(prevMonth.getUTCMonth() - 1);

  return (
    <>
      <PageHeader title="Зарплаты" subtitle="Начислено = оклад + сдельно + бонусы − удержания; долг = начислено − подтверждённые выплаты"
        actions={<div className="flex items-center gap-2 text-sm"><Link aria-label="Предыдущий месяц" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-surface-2 ring-1 ring-line" href={`/app/payroll?month=${prevMonth.toISOString().slice(0, 7)}`}>←</Link><b>{month}</b><Link aria-label="Следующий месяц" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-surface-2 ring-1 ring-line" href={`/app/payroll?month=${m2.slice(0, 7)}`}>→</Link></div>} />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label="Компания должна сотрудникам" value={<span className="block break-words text-xl">{moneyMulti(totalDebt, "0")}</span>} tone={Object.keys(totalDebt).length ? "warn" : "good"} hint="утверждённые начисления − выплаты, черновики не входят" />
        <Stat label="Выплачено в месяце" value={<span className="block break-words text-xl">{moneyMulti(paidMonth, "0")}</span>} hint="деньгами; зачёт не входит" />
        <Stat label="Выплаты в ближайшие 7 дней" value={soon.length} hint={soon.map((x) => `${x.name.split(" ")[0]} (${x.pay_days.join("/")})`).join(", ")} />
      </div>
      {people.length === 0 ? <Empty title="Нет зарплатных условий" text="Условия задаются при приглашении сотрудника или в его карточке." /> : (
        <>
          {s.can("payroll.manage") && (
            <ActionForm action={computeAll} className="mb-3">
              <input type="hidden" name="month" value={m1} />
              {people.map((p) => <input key={p.user_id} type="hidden" name="user_id" value={p.user_id} />)}
              <Submit variant="secondary">Рассчитать черновики за {month}</Submit>
            </ActionForm>
          )}
          <div className="space-y-3">
            {people.map((p) => {
              const a = accruals.get(p.user_id);
              const adjs = a ? adjBy.get(a.id) ?? [] : [];
              const debt = debtOf(p.user_id);
              const mine = payments.filter((x) => x.user_id === p.user_id);
              return (
                <Card key={p.user_id} title={<span className="flex flex-wrap items-center gap-2"><Link href={`/app/team/${p.user_id}`} className="hover:underline">{p.name}</Link><Badge>{PAY_TYPE[p.pay_type]}</Badge><span className="text-xs font-normal text-muted">выплаты {p.pay_days.join(" и ")}-го</span></span>}
                  actions={<span className="text-sm">Долг: <b className={Object.keys(debt).length ? "text-warn" : "text-good"}>{moneyMulti(debt, "0")}</b></span>}>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div>
                      {!a ? (
                        s.can("payroll.manage") ? <ActionForm action={computeAccrual}><input type="hidden" name="user_id" value={p.user_id} /><input type="hidden" name="month" value={m1} /><Submit variant="secondary">Рассчитать начисление</Submit></ActionForm> : <p className="text-sm text-muted">Начисления нет.</p>
                      ) : (
                        <div className="space-y-2 text-sm">
                          <div className="flex items-center gap-2"><Badge status={a.status === "approved" ? "approved" : "pending"}>{a.status === "approved" ? "Утверждено" : "Черновик"}</Badge> <b className="font-display text-lg">{money(a.total_minor + adjs.reduce((x, y) => x + Number(y.amount_minor), 0), a.currency)}</b></div>
                          <div className="text-muted">Оклад {money(a.base_minor, a.currency)} · сдельно {money(a.piece_minor, a.currency)}{a.piece_detail.length ? ` (${a.piece_detail.map((d) => `${d.kind}: ${d.count}×${money(d.rate_minor, a.currency)}`).join(", ")})` : ""} · бонус {money(a.bonus_minor, a.currency)} · удержания {money(a.deduction_minor, a.currency)}</div>
                          {a.note && <div className="text-xs">Причина: {a.note}</div>}
                          {adjs.map((x, i) => <div key={i} className="text-xs">Корректировка {money(x.amount_minor, a.currency)}: {x.reason}</div>)}
                          {a.status === "draft" && s.can("payroll.manage") && (
                            <ActionForm action={adjustDraft} className="grid gap-2 sm:grid-cols-4">
                              <input type="hidden" name="id" value={a.id} />
                              <input name="bonus" defaultValue={minorToInput(a.bonus_minor)} placeholder="Бонус" className="input" />
                              <input name="deduction" defaultValue={minorToInput(a.deduction_minor)} placeholder="Удержание" className="input" />
                              <input name="note" defaultValue={a.note ?? ""} placeholder="Причина" className="input" />
                              <Submit variant="secondary">OK</Submit>
                            </ActionForm>
                          )}
                          <div className="flex flex-wrap gap-2">
                            {a.status === "draft" && s.can("payroll.manage") && <ActionForm action={computeAccrual}><input type="hidden" name="user_id" value={p.user_id} /><input type="hidden" name="month" value={m1} /><Submit variant="ghost">Пересчитать</Submit></ActionForm>}
                            {a.status === "draft" && s.can("payroll.approve") && <ActionForm action={approveAccrual} confirm="Утвердить? После утверждения начисление не редактируется."><input type="hidden" name="id" value={a.id} /><Submit>Утвердить</Submit></ActionForm>}
                          </div>
                          {a.status === "approved" && s.can("payroll.approve") && (
                            <ActionForm action={addAdjustment} reset className="grid gap-2 sm:grid-cols-3">
                              <input type="hidden" name="id" value={a.id} />
                              <input name="amount" placeholder="± сумма" className="input" /><input name="reason" placeholder="Причина" className="input" /><Submit variant="ghost">Корректировка</Submit>
                            </ActionForm>
                          )}
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="mb-2 text-sm font-semibold">Выплаты за месяц</div>
                      {mine.length === 0 ? <p className="text-sm text-muted">Нет.</p> : <ul className="mb-2 space-y-1 text-sm">{mine.map((x) => <li key={x.id}>{date(x.paid_on)} · {{ advance: "Аванс", salary: "Зарплата", bonus: "Бонус", offset: "Зачёт" }[x.kind]} · <b>{money(x.amount_minor, x.currency)}</b>{x.note ? ` · ${x.note}` : ""}</li>)}</ul>}
                      {s.can("payroll.pay") && (
                        <ActionForm action={paySalary} reset className="grid gap-2 sm:grid-cols-2">
                          <input type="hidden" name="user_id" value={p.user_id} /><input type="hidden" name="accrual_id" value={a?.id ?? ""} />
                          <select name="kind" className="input"><option value="advance">Аванс</option><option value="salary" disabled={a?.status !== "approved"}>Зарплата</option><option value="bonus">Бонус</option><option value="offset">Зачёт</option></select>
                          <input name="amount" required placeholder="Сумма" inputMode="decimal" className="input" />
                          <input name="paid_on" type="date" defaultValue={todayLocal()} className="input" />
                          <select name="account_id" aria-label="Касса" className="input">{accs.map((x) => <option key={x.id} value={x.id}>{x.name} · {x.currency}</option>)}</select>
                          <input name="note" placeholder="Комментарий" className="input sm:col-span-2" />
                          <Submit variant="secondary">Зарегистрировать выплату</Submit>
                        </ActionForm>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
