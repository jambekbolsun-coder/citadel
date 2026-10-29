import Link from "next/link";
import { requireActive } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, Empty, Field, LoadError, PageHeader, Progress, Stat, Tabs } from "@/components/ui";
import { activePeople } from "@/lib/data";
import { CONTENT_KIND } from "@/lib/labels";
import { moneyMulti, todayLocal } from "@/lib/format";
import { cashSummary, payrollDebt, receivables } from "@/lib/money-math";

export const metadata = { title: "Отчёты" };

type Row = { period_id: string; project_id: string; kind: string; planned: number; prepared: number; published: number; verified: number; left_to_prepare: number; left_to_publish: number; overflow: number; overdue: number; overdue_review: number };

export default async function Reports({ searchParams }: PageProps<"/app/reports">) {
  const sp = await searchParams;
  const s = await requireActive(["reports.view", "finance.view"]);
  const tab = typeof sp.tab === "string" ? sp.tab : s.can("reports.view") ? "planfact" : "finance";
  const today = todayLocal();
  const from = typeof sp.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : `${today.slice(0, 7)}-01`;
  const to = typeof sp.to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) ? sp.to : today;
  const project = typeof sp.project === "string" && /^[0-9a-f-]{36}$/i.test(sp.project) ? sp.project : "";
  const person = typeof sp.person === "string" && /^[0-9a-f-]{36}$/i.test(sp.person) ? sp.person : "";
  const period = (t: string) => `/app/reports?tab=${t}&from=${from}&to=${to}`;
  const tabs = [
    ...(s.can("reports.view") ? [{ key: "planfact", label: "Проекты", href: `/app/reports?tab=planfact${project ? `&project=${project}` : ""}` }, { key: "people", label: "Сотрудники", href: period("people") }] : []),
    ...(s.can("finance.view") ? [{ key: "finance", label: "Финансы", href: period("finance") }] : []),
  ];

  return (
    <>
      <PageHeader title="Отчёты" subtitle="Счётчики считаются из договорных планов и подтверждённых фактов, а не из карточек интерфейса"
        actions={<>{s.can("reports.view") && <Link href="/app/reports/speed" className="inline-flex min-h-11 items-center rounded-xl bg-surface-2 px-3 text-sm font-semibold ring-1 ring-line">Скорость приложения</Link>}<a href="/app/finance/export?type=planfact" className="hidden min-h-11 items-center rounded-xl bg-surface-2 px-3 text-sm font-semibold ring-1 ring-line md:inline-flex">CSV план-факт</a></>} />
      <Tabs active={tab} items={tabs} />
      {tab === "planfact" && s.can("reports.view") && <PlanFact project={project} />}
      {(tab === "people" || tab === "finance") && (
        <form className="mb-4 flex flex-wrap items-end gap-2">
          <input type="hidden" name="tab" value={tab} />
          <Field label="С"><input name="from" type="date" defaultValue={from} className="input" /></Field>
          <Field label="По"><input name="to" type="date" defaultValue={to} className="input" /></Field>
          {tab === "people" && <PersonFilter value={person} />}
          <button className="min-h-11 rounded-xl bg-surface-2 px-4 text-sm font-semibold ring-1 ring-line">Показать</button>
        </form>
      )}
      {tab === "people" && s.can("reports.view") && <People from={from} to={to} person={person} canOpen={s.can("employees.view")} />}
      {tab === "finance" && s.can("finance.view") && <FinanceReport from={from} to={to} />}
    </>
  );
}

async function PersonFilter({ value }: { value: string }) {
  const people = await activePeople();
  return (
    <Field label="Сотрудник">
      <select name="person" defaultValue={value} className="input">
        <option value="">Все</option>
        {people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
      </select>
    </Field>
  );
}

async function PlanFact({ project }: { project: string }) {
  const supabase = await createClient();
  const [{ data: periods, error: e1 }, { data: progress, error: e2 }] = await Promise.all([
    supabase.from("project_periods").select("id,label,seq,status,projects!inner(id,name,status)").eq("status", "open").eq("projects.status", "in_progress"),
    supabase.from("v_period_progress").select("*"),
  ]);
  if (e1 || e2) return <LoadError retry="/app/reports" />;
  const rows = (progress ?? []) as Row[];
  const all = (periods ?? []) as unknown as { id: string; label: string; seq: number; projects: { id: string; name: string } }[];
  const list = project ? all.filter((p) => p.projects.id === project) : all;
  if (!all.length) return <Empty title="Нет проектов в работе" text="План-факт появляется, когда у проекта в работе есть открытый период." />;
  return (
    <div className="space-y-3">
      <form className="flex gap-2">
        <input type="hidden" name="tab" value="planfact" />
        <select name="project" defaultValue={project} aria-label="Проект" className="input min-w-0 flex-1">
          <option value="">Все проекты ({all.length})</option>
          {[...new Map(all.map((p) => [p.projects.id, p.projects.name])).entries()].map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <button className="min-h-11 shrink-0 rounded-xl bg-surface-2 px-4 text-sm font-semibold ring-1 ring-line">Показать</button>
      </form>
      {list.map((p) => {
        const r = rows.filter((x) => x.period_id === p.id);
        const overdue = r.reduce((a, x) => a + Number(x.overdue), 0);
        const overdueReview = r.reduce((a, x) => a + Number(x.overdue_review ?? 0), 0);
        const left = r.reduce((a, x) => a + Number(x.left_to_prepare), 0);
        const state = overdue > 0 ? <Badge tone="bad">Есть просрочки</Badge> : overdueReview > 0 ? <Badge tone="warn">Ждёт проверки</Badge> : left > 0 ? <Badge tone="good">По графику</Badge> : <Badge tone="good">Объём выполнен</Badge>;
        return (
          <Card key={p.id} title={<span className="flex flex-wrap items-center gap-2"><Link className="hover:underline" href={`/app/projects/${p.projects.id}?tab=plan&period=${p.id}`}>{p.projects.name}</Link><span className="text-xs font-normal text-muted">период №{p.seq} · {p.label}</span>{state}</span>}
            actions={<Link className="inline-flex min-h-11 items-center text-sm text-primary" href={`/app/reports/client/${p.projects.id}?period=${p.id}`}>Отчёт клиенту →</Link>}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {r.map((x) => (
                <div key={x.kind} className="rounded-xl bg-surface-2 p-3 text-sm">
                  <div className="flex justify-between font-semibold"><span>{CONTENT_KIND[x.kind]}</span><span>{x.prepared} из {x.planned}</span></div>
                  <div className="my-2"><Progress value={Math.min(Number(x.prepared), x.planned)} max={x.planned} tone={x.overdue > 0 ? "bad" : "good"} /></div>
                  <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-[13px]">
                    <dt className="text-muted">План по договору</dt><dd className="text-right">{x.planned}</dd>
                    <dt className="text-muted">Готово</dt><dd className="text-right">{x.prepared}</dd>
                    <dt className="text-muted">Опубликовано</dt><dd className="text-right">{x.published}</dd>
                    <dt className="text-muted">Проверено</dt><dd className="text-right">{x.verified}</dd>
                    <dt className="text-muted">Осталось подготовить</dt><dd className="text-right font-semibold">{x.left_to_prepare}</dd>
                    <dt className="text-muted">Осталось опубликовать</dt><dd className="text-right font-semibold">{x.left_to_publish}</dd>
                    {x.overdue > 0 && <><dt className="text-bad">Просрочено исполнителем</dt><dd className="text-right text-bad">{x.overdue}</dd></>}
                    {Number(x.overdue_review) > 0 && <><dt className="text-warn">Просрочена проверка</dt><dd className="text-right text-warn">{x.overdue_review}</dd></>}
                    {x.overflow > 0 && <><dt className="text-muted">Сверх плана</dt><dd className="text-right">{x.overflow}</dd></>}
                  </dl>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">Готово = принято проверяющим или опубликовано; осталось = план − готово. Одно видео на нескольких площадках — один материал. Сторис считаются кадрами по дням.</p>
          </Card>
        );
      })}
    </div>
  );
}

async function People({ from, to, person, canOpen }: { from: string; to: string; person: string; canOpen: boolean }) {
  const supabase = await createClient();
  const people = await activePeople();
  let qContent = supabase.from("content_items").select("assignee_id,prep_due,submitted_at,approved_at").gte("approved_at", `${from}T00:00:00+06:00`).lte("approved_at", `${to}T23:59:59+06:00`);
  let qTasks = supabase.from("tasks").select("assignee_id,due_at,completed_at").eq("status", "done").gte("completed_at", `${from}T00:00:00+06:00`).lte("completed_at", `${to}T23:59:59+06:00`);
  let qOpen = supabase.from("content_items").select("assignee_id,prep_due").not("status", "in", "(done,published,cancelled,paused,review)");
  let qReview = supabase.from("content_items").select("assignee_id").eq("status", "review");
  if (person) {
    qContent = qContent.eq("assignee_id", person);
    qTasks = qTasks.eq("assignee_id", person);
    qOpen = qOpen.eq("assignee_id", person);
    qReview = qReview.eq("assignee_id", person);
  }
  const [content, tasks, open, review] = await Promise.all([qContent, qTasks, qOpen, qReview]);
  if (content.error || tasks.error || open.error || review.error) return <LoadError retry={`/app/reports?tab=people&from=${from}&to=${to}`} />;
  const stat = new Map<string, { onTime: number; late: number; open: number; overdue: number; review: number }>();
  const g = (id: string) => stat.get(id) ?? stat.set(id, { onTime: 0, late: 0, open: 0, overdue: 0, review: 0 }).get(id)!;
  // «в срок» — по сроку сдачи исполнителя (submitted_at против prep_due); срок проверки руководителя сюда не входит
  for (const c of (content.data ?? []) as { assignee_id: string | null; prep_due: string | null; submitted_at: string | null; approved_at: string }[]) {
    if (!c.assignee_id) continue;
    const doneAt = c.submitted_at ?? c.approved_at;
    if (c.prep_due && doneAt > c.prep_due) g(c.assignee_id).late++; else g(c.assignee_id).onTime++;
  }
  for (const t of (tasks.data ?? []) as { assignee_id: string | null; due_at: string | null; completed_at: string }[]) {
    if (!t.assignee_id) continue;
    if (t.due_at && t.completed_at > t.due_at) g(t.assignee_id).late++; else g(t.assignee_id).onTime++;
  }
  for (const c of (open.data ?? []) as { assignee_id: string | null; prep_due: string | null }[]) {
    if (!c.assignee_id) continue;
    g(c.assignee_id).open++;
    if (c.prep_due && new Date(c.prep_due) < new Date()) g(c.assignee_id).overdue++;
  }
  for (const c of (review.data ?? []) as { assignee_id: string | null }[]) if (c.assignee_id) g(c.assignee_id).review++;
  const list = people.filter((p) => stat.has(p.id));
  if (!list.length) return <Empty title="Нет данных за период" text="Закрытые задачи и принятые материалы появятся здесь." />;
  return (
    <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {list.map((p) => {
        const x = stat.get(p.id)!;
        const tot = x.onTime + x.late;
        const body = (
          <>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><p className="truncate font-semibold">{p.full_name}</p><p className="truncate text-[13px] text-muted">{p.job_title ?? "—"}</p></div>
              <span className="shrink-0 text-lg font-semibold">{tot ? `${Math.round((x.onTime / tot) * 100)}%` : "—"}</span>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted">Сдано в срок</dt><dd className="text-right">{x.onTime}</dd>
              <dt className="text-muted">С опозданием</dt><dd className={x.late ? "text-right text-warn" : "text-right"}>{x.late}</dd>
              <dt className="text-muted">В работе</dt><dd className="text-right">{x.open}</dd>
              <dt className="text-muted">На проверке</dt><dd className="text-right">{x.review}</dd>
              <dt className="text-muted">Просрочено сейчас</dt><dd className={x.overdue ? "text-right font-semibold text-bad" : "text-right"}>{x.overdue}</dd>
            </dl>
          </>
        );
        return <li key={p.id}>{canOpen ? <Link href={`/app/team/${p.id}`} className="block rounded-[20px] border border-line bg-surface p-4 md:hover:border-brand">{body}</Link> : <div className="rounded-[20px] border border-line bg-surface p-4">{body}</div>}</li>;
      })}
    </ul>
  );
}

async function FinanceReport({ from, to }: { from: string; to: string }) {
  const supabase = await createClient();
  const [tx, inv, pb] = await Promise.all([
    supabase.from("money_transactions").select("direction,amount_minor,currency,source_type").gte("occurred_on", from).lte("occurred_on", to).limit(20000),
    supabase.from("v_invoice_status").select("amount_minor,paid_minor,pay_state,issued_on,currency").neq("pay_state", "void"),
    supabase.from("v_payroll_balance").select("accrued_minor,paid_minor,currency"),
  ]);
  if (tx.error || inv.error) return <LoadError retry={`/app/reports?tab=finance&from=${from}&to=${to}`} />;
  const cash = cashSummary((tx.data ?? []) as { direction: string; amount_minor: number; currency: string; source_type: string }[]);
  const invoices = (inv.data ?? []) as { amount_minor: number; paid_minor: number; pay_state: string; issued_on: string; currency: string }[];
  const issued: Record<string, number> = {};
  for (const i of invoices) if (i.issued_on >= from && i.issued_on <= to) issued[i.currency] = (issued[i.currency] ?? 0) + Number(i.amount_minor);
  const big = (v: string) => <span className="block break-words text-xl leading-snug">{v}</span>;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Выставлено" value={big(moneyMulti(issued, "0"))} hint="счета за период" />
        <Stat label="Получено" value={big(moneyMulti(cash.inflow, "0"))} hint={Object.keys(cash.refunds).length ? `возвраты ${moneyMulti(cash.refunds)}` : "подтверждённые оплаты"} tone="good" />
        <Stat label="Дебиторка" value={big(moneyMulti(receivables(invoices), "0"))} hint="на сегодня" />
        <Stat label="Расходы" value={big(moneyMulti(cash.expenses, "0"))} />
        <Stat label="Зарплаты" value={big(moneyMulti(cash.salaries, "0"))} hint={pb.error ? undefined : `долг сотрудникам ${moneyMulti(payrollDebt((pb.data ?? []) as { accrued_minor: number; paid_minor: number; currency: string }[]), "0")}`} />
        <Stat label="Денежный поток" value={big(moneyMulti(cash.net, "0"))} hint="движение денег, не прибыль" />
      </div>
      <p className="text-xs text-muted">Все суммы — по подтверждённым движениям касс, по валютам раздельно (без автоматической конвертации). Рекламные бюджеты клиентов не входят. Подробности — в <Link href={`/app/finance?tab=overview&from=${from}&to=${to}`} className="font-semibold text-primary">бухгалтерии</Link>.</p>
    </div>
  );
}
