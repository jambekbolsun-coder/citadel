import Link from "next/link";
import { requireActive } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, Empty, Field, Notice, PageHeader, Stat, Tabs } from "@/components/ui";
import { ActionForm, Submit } from "@/components/action-form";
import { PeopleSelect } from "@/components/people-select";
import { activePeople, accounts as loadAccounts, nameOf } from "@/lib/data";
import { EXPENSE_STATUS, PAYMENT_STATUS, PAY_STATE } from "@/lib/labels";
import { date, money, todayLocal } from "@/lib/format";
import { confirmPayment, rejectPayment } from "@/app/app/projects/actions";
import * as A from "./actions";

export const metadata = { title: "Бухгалтерия" };

export default async function Finance({ searchParams }: PageProps<"/app/finance">) {
  const sp = await searchParams;
  const s = await requireActive(["finance.view", "expenses.create", "payments.confirm", "payments.create"]);
  const tab = typeof sp.tab === "string" ? sp.tab : s.can("finance.view") ? "overview" : s.can("payments.confirm") ? "payments" : "expenses";
  const today = todayLocal();
  const from = typeof sp.from === "string" ? sp.from : `${today.slice(0, 7)}-01`;
  const to = typeof sp.to === "string" ? sp.to : today;
  const tabs = [
    ...(s.can("finance.view") ? [{ key: "overview", label: "Сводка и кассы" }] : []),
    ...(s.can("payments.confirm") || s.can("finance.view") ? [{ key: "payments", label: "Поступления" }] : []),
    ...(s.can("finance.view") ? [{ key: "receivables", label: "Дебиторка" }] : []),
    { key: "expenses", label: "Расходы" },
    ...(s.can("finance.view") ? [{ key: "assets", label: "Имущество" }, { key: "ledger", label: "Движения" }] : []),
    ...(s.can("finance.manage") ? [{ key: "settings", label: "Категории и счета" }] : []),
  ].map((t) => ({ ...t, href: `/app/finance?tab=${t.key}&from=${from}&to=${to}` }));
  const people = await activePeople();
  const accs = await loadAccounts();

  return (
    <>
      <PageHeader title="Бухгалтерия" subtitle="Управленческий учёт: договорные начисления, подтверждённые поступления, расходы, движения по кассам. Не заменяет регламентированную бухгалтерию."
        actions={s.can("finance.view") ? <div className="flex gap-2"><a className="rounded-xl bg-surface-2 px-3 py-2 text-sm font-semibold ring-1 ring-line" href={`/app/finance/export?type=ledger&from=${from}&to=${to}`}>CSV движений</a><a className="rounded-xl bg-surface-2 px-3 py-2 text-sm font-semibold ring-1 ring-line" href={`/app/finance/export?type=expenses&from=${from}&to=${to}`}>CSV расходов</a></div> : null} />
      <Tabs items={tabs} active={tab} />
      {["overview", "ledger", "expenses"].includes(tab) && (
        <form className="mb-4 flex flex-wrap items-end gap-2">
          <input type="hidden" name="tab" value={tab} />
          <Field label="С"><input name="from" type="date" defaultValue={from} className="input" /></Field>
          <Field label="По"><input name="to" type="date" defaultValue={to} className="input" /></Field>
          <button className="min-h-[42px] rounded-xl bg-surface-2 px-4 text-sm font-semibold ring-1 ring-line">Показать</button>
        </form>
      )}
      {tab === "overview" && <Overview from={from} to={to} />}
      {tab === "payments" && <Payments me={s.userId} isOwner={s.isOwner} canConfirm={s.can("payments.confirm")} accs={accs} people={people} />}
      {tab === "receivables" && <Receivables />}
      {tab === "expenses" && <Expenses from={from} to={to} canConfirm={s.can("expenses.confirm")} canCreate={s.can("expenses.create")} accs={accs} people={people} />}
      {tab === "assets" && <Assets people={people} canEdit={s.can("finance.manage")} />}
      {tab === "ledger" && <Ledger from={from} to={to} accs={accs} canAdjust={s.can("finance.manage")} />}
      {tab === "settings" && <Settings />}
    </>
  );
}

async function Overview({ from, to }: { from: string; to: string }) {
  const supabase = await createClient();
  const [{ data: bal }, { data: tx }, { data: inv }, { data: pb }, { data: exp }] = await Promise.all([
    supabase.from("v_account_balances").select("*"),
    supabase.from("money_transactions").select("account_id,direction,amount_minor,source_type,occurred_on").gte("occurred_on", from).lte("occurred_on", to),
    supabase.from("v_invoice_status").select("amount_minor,paid_minor,pay_state,issued_on").neq("pay_state", "void"),
    supabase.from("v_payroll_balance").select("accrued_minor,paid_minor"),
    supabase.from("expenses").select("amount_minor,category_id,expense_categories(name)").eq("status", "confirmed").gte("purchased_on", from).lte("purchased_on", to),
  ]);
  const txs = (tx ?? []) as { account_id: string; direction: string; amount_minor: number; source_type: string; occurred_on: string }[];
  const sum = (f: (t: (typeof txs)[number]) => boolean) => txs.filter(f).reduce((a, t) => a + Number(t.amount_minor), 0);
  const inflow = sum((t) => t.direction === "in" && t.source_type === "payment");
  const refunds = sum((t) => t.source_type === "refund");
  const expenses = sum((t) => t.source_type === "expense") - sum((t) => t.source_type === "reversal");
  const salaries = sum((t) => t.source_type === "salary");
  const receivable = ((inv ?? []) as { amount_minor: number; paid_minor: number }[]).reduce((a, i) => a + Math.max(0, i.amount_minor - i.paid_minor), 0);
  const issued = ((inv ?? []) as { amount_minor: number; issued_on: string }[]).filter((i) => i.issued_on >= from && i.issued_on <= to).reduce((a, i) => a + Number(i.amount_minor), 0);
  const payrollDebt = ((pb ?? []) as { accrued_minor: number; paid_minor: number }[]).reduce((a, b) => a + Math.max(0, Number(b.accrued_minor) - Number(b.paid_minor)), 0);
  const byCat: Record<string, number> = {};
  ((exp ?? []) as unknown as { amount_minor: number; expense_categories: { name: string } | null }[]).forEach((e) => (byCat[e.expense_categories?.name ?? "—"] = (byCat[e.expense_categories?.name ?? "—"] ?? 0) + Number(e.amount_minor)));
  const accounts = (bal ?? []) as { id: string; name: string; currency: string; opening_balance_minor: number; inflow_minor: number; outflow_minor: number; balance_minor: number }[];
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Stat label="Выставлено счетов" value={money(issued)} />
        <Stat label="Поступления" value={money(inflow)} tone="good" />
        <Stat label="Расходы" value={money(expenses)} />
        <Stat label="Выплачено зарплат" value={money(salaries)} />
        <Stat label="Дебиторка клиентов" value={money(receivable)} tone={receivable > 0 ? "warn" : undefined} />
        <Stat label="Долг по зарплатам" value={money(payrollDebt)} tone={payrollDebt > 0 ? "warn" : undefined} />
      </div>
      <Card title="Условная прибыль за период">
        <p className="font-display text-2xl font-semibold">{money(inflow - refunds - expenses - salaries)}</p>
        <p className="text-xs text-muted">Кассовый метод: подтверждённые поступления − возвраты − подтверждённые расходы − выплаты зарплат. Рекламные бюджеты клиентов сюда не входят. Правила распределения задаёт владелец.</p>
      </Card>
      <Card title="Кассы и счета — сверка" className="p-0 md:p-0">
        <div className="scroll-x"><table className="tbl">
          <thead><tr><th>Счёт</th><th>Начальный остаток</th><th>Поступления</th><th>Списания</th><th>Остаток</th><th>Сверка</th></tr></thead>
          <tbody>{accounts.map((a) => (
            <tr key={a.id}><td className="font-semibold">{a.name}</td><td>{money(a.opening_balance_minor, a.currency)}</td><td>{money(a.inflow_minor, a.currency)}</td><td>{money(a.outflow_minor, a.currency)}</td><td className="font-semibold">{money(a.balance_minor, a.currency)}</td>
              <td>{Number(a.opening_balance_minor) + Number(a.inflow_minor) - Number(a.outflow_minor) === Number(a.balance_minor) ? <Badge tone="good">сходится</Badge> : <Badge tone="bad">расхождение</Badge>}</td></tr>
          ))}</tbody>
        </table></div>
      </Card>
      {Object.keys(byCat).length > 0 && (
        <Card title="Расходы по категориям">
          <ul className="space-y-1 text-sm">{Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => <li key={k} className="flex justify-between"><span>{k}</span><b>{money(v)}</b></li>)}</ul>
        </Card>
      )}
    </div>
  );
}

async function Payments({ me, isOwner, canConfirm, accs, people }: { me: string; isOwner: boolean; canConfirm: boolean; accs: { id: string; name: string }[]; people: Awaited<ReturnType<typeof activePeople>> }) {
  const supabase = await createClient();
  const { data } = await supabase.from("payments").select("*, projects(id,name)").order("status").order("created_at", { ascending: false }).limit(100);
  const rows = (data ?? []) as unknown as { id: string; project_id: string; kind: string; amount_minor: number; paid_on: string; method: string | null; status: string; created_by: string; confirmed_by: string | null; note: string | null; projects: { id: string; name: string } }[];
  if (!rows.length) return <Empty title="Поступлений нет" text="Поступления вносятся в карточке проекта → Финансы." />;
  return (
    <Card className="p-0 md:p-0"><div className="scroll-x"><table className="tbl">
      <thead><tr><th>Дата</th><th>Проект</th><th>Тип</th><th>Сумма</th><th>Внёс</th><th>Статус</th><th /></tr></thead>
      <tbody>{rows.map((p) => (
        <tr key={p.id}>
          <td className="whitespace-nowrap">{date(p.paid_on)}</td>
          <td><Link className="hover:underline" href={`/app/projects/${p.project_id}?tab=finance`}>{p.projects?.name}</Link><div className="text-xs text-muted">{p.method}{p.note ? ` · ${p.note}` : ""}</div></td>
          <td>{p.kind === "refund" ? "Возврат" : "Поступление"}</td><td className="font-semibold">{money(p.amount_minor)}</td>
          <td className="text-sm">{nameOf(people, p.created_by)}</td>
          <td><Badge status={p.status}>{PAYMENT_STATUS[p.status]}</Badge>{p.confirmed_by && <div className="text-xs text-muted">{nameOf(people, p.confirmed_by)}</div>}</td>
          <td>{canConfirm && p.status === "pending" && (p.created_by !== me || isOwner ? (
            <div className="flex flex-col gap-1">
              <ActionForm action={confirmPayment} className="flex gap-1"><input type="hidden" name="id" value={p.project_id} /><input type="hidden" name="payment_id" value={p.id} />
                <select name="account_id" className="input min-h-[32px] py-1 text-xs">{accs.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select><Submit className="min-h-[32px] px-2 text-xs">Подтвердить</Submit></ActionForm>
              <ActionForm action={rejectPayment} className="flex gap-1"><input type="hidden" name="id" value={p.project_id} /><input type="hidden" name="payment_id" value={p.id} /><input name="reason" placeholder="причина" className="input min-h-[32px] py-1 text-xs" /><Submit variant="ghost" className="min-h-[32px] px-2 text-xs">Отклонить</Submit></ActionForm>
            </div>
          ) : <span className="text-xs text-muted">нужен другой подтверждающий</span>)}</td>
        </tr>
      ))}</tbody>
    </table></div></Card>
  );
}

async function Receivables() {
  const supabase = await createClient();
  const { data } = await supabase.from("v_invoice_status").select("*, projects(id,name)").in("pay_state", ["unpaid", "partial", "overdue"]).order("due_on");
  const rows = (data ?? []) as unknown as { id: string; number: number; title: string; amount_minor: number; paid_minor: number; due_on: string; pay_state: string; projects: { id: string; name: string } }[];
  if (!rows.length) return <Empty title="Дебиторки нет" text="Все выставленные счета оплачены." />;
  return (
    <Card className="p-0 md:p-0"><div className="scroll-x"><table className="tbl">
      <thead><tr><th>Счёт</th><th>Проект</th><th>Сумма</th><th>Оплачено</th><th>Остаток</th><th>Срок</th><th>Статус</th></tr></thead>
      <tbody>{rows.map((i) => (
        <tr key={i.id}><td>№{i.number} {i.title}</td><td><Link className="hover:underline" href={`/app/projects/${i.projects.id}?tab=finance`}>{i.projects.name}</Link></td><td>{money(i.amount_minor)}</td><td>{money(i.paid_minor)}</td><td className="font-semibold">{money(i.amount_minor - i.paid_minor)}</td><td>{date(i.due_on)}</td><td><Badge status={i.pay_state}>{PAY_STATE[i.pay_state]}</Badge></td></tr>
      ))}</tbody>
    </table></div></Card>
  );
}

async function Expenses({ from, to, canConfirm, canCreate, accs, people }: { from: string; to: string; canConfirm: boolean; canCreate: boolean; accs: { id: string; name: string }[]; people: Awaited<ReturnType<typeof activePeople>> }) {
  const supabase = await createClient();
  const [{ data }, { data: cats }, { data: projects }, { data: deps }] = await Promise.all([
    supabase.from("expenses").select("*, expense_categories(name), projects(name)").gte("purchased_on", from).lte("purchased_on", to).order("purchased_on", { ascending: false }).limit(200),
    supabase.from("expense_categories").select("id,name,parent_id,requires_project").is("archived_at", null).order("sort"),
    supabase.from("projects").select("id,name").not("status", "in", "(closed,cancelled)").order("name"),
    supabase.from("departments").select("id,name"),
  ]);
  const rows = (data ?? []) as unknown as { id: string; amount_minor: number; currency: string; purchased_on: string; vendor: string | null; description: string; status: string; is_asset: boolean; receipt_path: string | null; created_by: string; confirmed_by: string | null; cancel_reason: string | null; expense_categories: { name: string } | null; projects: { name: string } | null; tags: string[] }[];
  const signed = new Map<string, string>();
  for (const r of rows.filter((x) => x.receipt_path)) {
    const { data: u } = await supabase.storage.from("finance").createSignedUrl(r.receipt_path!, 600);
    if (u?.signedUrl) signed.set(r.id, u.signedUrl);
  }
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div>
        {rows.length === 0 ? <Empty title="Расходов за период нет" /> : (
          <Card className="p-0 md:p-0"><div className="scroll-x"><table className="tbl">
            <thead><tr><th>Дата</th><th>Расход</th><th>Категория</th><th>Сумма</th><th>Статус</th><th /></tr></thead>
            <tbody>{rows.map((e) => (
              <tr key={e.id}>
                <td className="whitespace-nowrap">{date(e.purchased_on)}</td>
                <td>{e.description}{e.is_asset && <Badge tone="info">имущество</Badge>}<div className="text-xs text-muted">{[e.vendor, e.projects?.name, nameOf(people, e.created_by), e.tags.join(", ")].filter((x) => x && x !== "—").join(" · ")}</div>{signed.get(e.id) && <a href={signed.get(e.id)} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline">чек</a>}</td>
                <td className="text-sm">{e.expense_categories?.name}</td>
                <td className="font-semibold">{money(e.amount_minor, e.currency)}</td>
                <td><Badge status={e.status}>{EXPENSE_STATUS[e.status]}</Badge>{e.cancel_reason && <div className="text-xs text-bad">{e.cancel_reason}</div>}</td>
                <td>
                  {canConfirm && ["pending", "draft"].includes(e.status) && (
                    <ActionForm action={A.confirmExpense} className="space-y-1">
                      <input type="hidden" name="id" value={e.id} /><input type="hidden" name="is_asset" value={e.is_asset ? "1" : "0"} />
                      <select name="account_id" className="input min-h-[32px] py-1 text-xs">{accs.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
                      {e.is_asset && <><input name="asset_model" placeholder="Модель" className="input min-h-[32px] py-1 text-xs" /><input name="asset_serial" placeholder="Серийный №" className="input min-h-[32px] py-1 text-xs" /><input name="asset_location" placeholder="Где хранится" className="input min-h-[32px] py-1 text-xs" /></>}
                      <Submit className="min-h-[32px] px-2 text-xs">Подтвердить</Submit>
                    </ActionForm>
                  )}
                  {canConfirm && e.status !== "cancelled" && (
                    <ActionForm action={A.cancelExpense} className="mt-1 flex gap-1"><input type="hidden" name="id" value={e.id} /><input name="reason" placeholder="причина" className="input min-h-[32px] py-1 text-xs" /><Submit variant="ghost" className="min-h-[32px] px-2 text-xs">{e.status === "confirmed" ? "Сторно" : "Отменить"}</Submit></ActionForm>
                  )}
                </td>
              </tr>
            ))}</tbody>
          </table></div></Card>
        )}
      </div>
      {canCreate && (
        <Card title="Новый расход">
          <ActionForm action={A.createExpense} reset className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Сумма *"><input name="amount" required inputMode="decimal" className="input" /></Field>
              <Field label="Валюта"><select name="currency" className="input"><option>KGS</option><option>USD</option></select></Field>
              <Field label="Дата покупки *"><input name="purchased_on" type="date" required defaultValue={todayLocal()} className="input" /></Field>
              <Field label="Дата оплаты"><input name="paid_on" type="date" className="input" /></Field>
            </div>
            <Field label="Описание *"><input name="description" required className="input" /></Field>
            <Field label="Категория *"><select name="category_id" required className="input">{(cats ?? []).map((c: { id: string; name: string; parent_id: string | null; requires_project: boolean }) => <option key={c.id} value={c.id}>{c.parent_id ? "— " : ""}{c.name}{c.requires_project ? " (нужен проект)" : ""}</option>)}</select></Field>
            <Field label="Продавец / контрагент"><input name="vendor" className="input" /></Field>
            <Field label="Проект"><select name="project_id" className="input"><option value="">—</option>{(projects ?? []).map((p: { id: string; name: string }) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
            <Field label="Отдел"><select name="department_id" className="input"><option value="">—</option>{(deps ?? []).map((d: { id: string; name: string }) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Счёт оплаты"><select name="account_id" className="input"><option value="">—</option>{accs.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
              <Field label="Способ"><input name="method" className="input" /></Field>
            </div>
            <Field label="Ответственный"><PeopleSelect name="responsible_id" people={people} /></Field>
            <Field label="Теги (через запятую)"><input name="tags" className="input" /></Field>
            <Field label="Повторяемость"><select name="recurrence" className="input"><option value="">Разовый</option><option value="monthly">Ежемесячно</option><option value="weekly">Еженедельно</option><option value="yearly">Ежегодно</option></select></Field>
            <Field label="Чек / фото (до 4 МБ)"><input name="receipt" type="file" accept="image/*,application/pdf" className="input" /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_asset" /> Учесть как имущество (без двойного списания)</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="draft" /> Сохранить как черновик</label>
            <Submit className="w-full">Внести расход</Submit>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}

async function Assets({ people, canEdit }: { people: Awaited<ReturnType<typeof activePeople>>; canEdit: boolean }) {
  const supabase = await createClient();
  const { data } = await supabase.from("asset_register").select("*").order("acquired_on", { ascending: false });
  const rows = (data ?? []) as { id: string; name: string; type: string | null; model: string | null; serial: string | null; price_minor: number | null; currency: string; acquired_on: string | null; location: string | null; responsible_id: string | null; status: string; notes: string | null }[];
  if (!rows.length) return <Empty title="Имущества нет" text="Отметьте расход «Учесть как имущество» — при подтверждении создастся карточка." />;
  return (
    <div className="grid gap-3 md:grid-cols-2">{rows.map((a) => (
      <Card key={a.id} title={a.name}>
        <p className="text-sm text-muted">{[a.type, a.model, a.serial && `S/N ${a.serial}`].filter(Boolean).join(" · ")} · {money(a.price_minor, a.currency)} · {date(a.acquired_on)}</p>
        {canEdit ? (
          <ActionForm action={A.updateAsset} className="mt-3 grid gap-2 sm:grid-cols-2">
            <input type="hidden" name="id" value={a.id} />
            <input name="location" defaultValue={a.location ?? ""} placeholder="Место хранения" className="input" />
            <select name="status" defaultValue={a.status} className="input"><option value="in_use">В эксплуатации</option><option value="repair">В ремонте</option><option value="storage">На складе</option><option value="written_off">Списано</option><option value="lost">Утеряно</option></select>
            <PeopleSelect name="responsible_id" people={people} defaultValue={a.responsible_id} />
            <input name="notes" defaultValue={a.notes ?? ""} placeholder="Заметки" className="input" />
            <Submit variant="secondary">Сохранить</Submit>
          </ActionForm>
        ) : <p className="mt-2 text-sm">{a.location} · {nameOf(people, a.responsible_id)}</p>}
      </Card>
    ))}</div>
  );
}

async function Ledger({ from, to, accs, canAdjust }: { from: string; to: string; accs: { id: string; name: string }[]; canAdjust: boolean }) {
  const supabase = await createClient();
  const { data } = await supabase.from("money_transactions").select("*, financial_accounts(name)").gte("occurred_on", from).lte("occurred_on", to).order("occurred_on", { ascending: false }).order("created_at", { ascending: false }).limit(500);
  const rows = (data ?? []) as unknown as { id: string; direction: string; amount_minor: number; currency: string; occurred_on: string; source_type: string; description: string | null; financial_accounts: { name: string } }[];
  const SRC: Record<string, string> = { payment: "Поступление", refund: "Возврат клиенту", expense: "Расход", salary: "Зарплата", adjustment: "Корректировка", reversal: "Сторно" };
  return (
    <div className="space-y-4">
      <Notice>Движения не удаляются. Ошибки исправляются компенсирующими записями (сторно/корректировка).</Notice>
      {canAdjust && (
        <Card title="Корректировка (с основанием)">
          <ActionForm action={A.addAdjustmentTx} reset className="grid gap-2 sm:grid-cols-6">
            <select name="account_id" className="input">{accs.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
            <select name="direction" className="input"><option value="in">Приход</option><option value="out">Расход</option></select>
            <input name="amount" placeholder="Сумма" required className="input" />
            <input name="occurred_on" type="date" defaultValue={todayLocal()} className="input" />
            <input name="description" placeholder="Основание" required className="input" />
            <Submit variant="secondary">Провести</Submit>
          </ActionForm>
        </Card>
      )}
      <Card className="p-0 md:p-0"><div className="scroll-x"><table className="tbl">
        <thead><tr><th>Дата</th><th>Счёт</th><th>Тип</th><th>Описание</th><th className="text-right">Приход</th><th className="text-right">Расход</th></tr></thead>
        <tbody>{rows.map((t) => (
          <tr key={t.id}><td className="whitespace-nowrap">{date(t.occurred_on)}</td><td>{t.financial_accounts?.name}</td><td>{SRC[t.source_type] ?? t.source_type}</td><td className="text-sm">{t.description}</td>
            <td className="text-right text-good">{t.direction === "in" ? money(t.amount_minor, t.currency) : ""}</td><td className="text-right">{t.direction === "out" ? money(t.amount_minor, t.currency) : ""}</td></tr>
        ))}</tbody>
      </table></div></Card>
    </div>
  );
}

async function Settings() {
  const supabase = await createClient();
  const [{ data: cats }, { data: accs }] = await Promise.all([
    supabase.from("expense_categories").select("*").order("sort"),
    supabase.from("financial_accounts").select("*").order("created_at"),
  ]);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Категории расходов">
        <ul className="mb-4 space-y-2">{(cats ?? []).map((c: { id: string; name: string; requires_project: boolean; archived_at: string | null; parent_id: string | null }) => (
          <li key={c.id}>
            <ActionForm action={A.renameCategory} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="id" value={c.id} />
              <input name="name" defaultValue={c.name} className="input max-w-[220px]" />
              <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="requires_project" defaultChecked={c.requires_project} /> нужен проект</label>
              <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="archived" defaultChecked={!!c.archived_at} /> архив</label>
              <Submit variant="ghost" className="min-h-[32px] px-2 text-xs">OK</Submit>
            </ActionForm>
          </li>
        ))}</ul>
        <ActionForm action={A.createCategory} reset className="flex flex-wrap gap-2 border-t border-line pt-3">
          <input name="name" required placeholder="Новая категория" className="input max-w-[200px]" />
          <select name="parent_id" className="input max-w-[180px]"><option value="">Без родителя</option>{(cats ?? []).filter((c: { parent_id: string | null }) => !c.parent_id).map((c: { id: string; name: string }) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="requires_project" /> нужен проект</label>
          <Submit variant="secondary">Создать</Submit>
        </ActionForm>
      </Card>
      <Card title="Счета и кассы">
        <ul className="mb-4 space-y-1 text-sm">{(accs ?? []).map((a: { id: string; name: string; kind: string; currency: string; opening_balance_minor: number }) => <li key={a.id}>{a.name} · {a.kind} · начальный остаток {money(a.opening_balance_minor, a.currency)}</li>)}</ul>
        <ActionForm action={A.createAccount} reset className="grid gap-2 border-t border-line pt-3 sm:grid-cols-2">
          <input name="name" required placeholder="Название" className="input" />
          <select name="kind" className="input"><option value="cash">Касса</option><option value="bank">Банк</option><option value="card">Карта</option><option value="other">Другое</option></select>
          <select name="currency" className="input"><option>KGS</option><option>USD</option></select>
          <input name="opening" placeholder="Начальный остаток" className="input" />
          <input name="opening_date" type="date" className="input" />
          <Submit variant="secondary">Добавить счёт</Submit>
        </ActionForm>
      </Card>
    </div>
  );
}
