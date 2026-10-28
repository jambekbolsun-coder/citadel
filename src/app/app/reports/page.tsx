import Link from "next/link";
import { requireActive } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, Field, PageHeader, Progress, Tabs } from "@/components/ui";
import { activePeople } from "@/lib/data";
import { CONTENT_KIND } from "@/lib/labels";
import { todayLocal } from "@/lib/format";

export const metadata = { title: "Отчёты" };

type Row = { period_id: string; project_id: string; kind: string; planned: number; prepared: number; published: number; verified: number; left_to_prepare: number; left_to_publish: number; overflow: number; overdue: number };

export default async function Reports({ searchParams }: PageProps<"/app/reports">) {
  const sp = await searchParams;
  const s = await requireActive(["reports.view", "finance.view"]);
  const tab = typeof sp.tab === "string" ? sp.tab : "planfact";
  const today = todayLocal();
  const from = typeof sp.from === "string" ? sp.from : `${today.slice(0, 7)}-01`;
  const to = typeof sp.to === "string" ? sp.to : today;

  return (
    <>
      <PageHeader title="Отчёты" subtitle="Счётчики считаются из договорных планов и фактов, а не из карточек интерфейса"
        actions={<a href="/app/finance/export?type=planfact" className="rounded-xl bg-surface-2 px-3 py-2 text-sm font-semibold ring-1 ring-line">CSV план-факт</a>} />
      <Tabs active={tab} items={[{ key: "planfact", label: "План-факт по проектам", href: "/app/reports" }, { key: "people", label: "Исполнители", href: `/app/reports?tab=people&from=${from}&to=${to}` }, ...(s.can("finance.view") ? [{ key: "finance", label: "Финансы", href: "/app/finance?tab=overview" }] : [])]} />
      {tab === "planfact" && <PlanFact />}
      {tab === "people" && (
        <>
          <form className="mb-4 flex flex-wrap items-end gap-2">
            <input type="hidden" name="tab" value="people" />
            <Field label="С"><input name="from" type="date" defaultValue={from} className="input" /></Field>
            <Field label="По"><input name="to" type="date" defaultValue={to} className="input" /></Field>
            <button className="min-h-[42px] rounded-xl bg-surface-2 px-4 text-sm font-semibold ring-1 ring-line">Показать</button>
          </form>
          <People from={from} to={to} />
        </>
      )}
    </>
  );
}

async function PlanFact() {
  const supabase = await createClient();
  const [{ data: periods }, { data: progress }] = await Promise.all([
    supabase.from("project_periods").select("id,label,seq,status,projects!inner(id,name,status)").eq("status", "open").eq("projects.status", "in_progress"),
    supabase.from("v_period_progress").select("*"),
  ]);
  const rows = (progress ?? []) as Row[];
  const list = (periods ?? []) as unknown as { id: string; label: string; seq: number; projects: { id: string; name: string } }[];
  if (!list.length) return <p className="text-sm text-muted">Нет проектов в работе с открытыми периодами.</p>;
  return (
    <div className="space-y-3">
      {list.map((p) => {
        const r = rows.filter((x) => x.period_id === p.id);
        const overdue = r.reduce((a, x) => a + Number(x.overdue), 0);
        const left = r.reduce((a, x) => a + Number(x.left_to_prepare), 0);
        const state = overdue > 0 ? <Badge tone="bad">Есть просрочки</Badge> : left > 0 ? <Badge tone="good">По графику</Badge> : <Badge tone="good">Объём выполнен</Badge>;
        return (
          <Card key={p.id} title={<span className="flex flex-wrap items-center gap-2"><Link className="hover:underline" href={`/app/projects/${p.projects.id}?tab=plan&period=${p.id}`}>{p.projects.name}</Link><span className="text-xs font-normal text-muted">период №{p.seq} · {p.label}</span>{state}</span>}
            actions={<Link className="text-sm text-primary" href={`/app/reports/client/${p.projects.id}?period=${p.id}`}>Отчёт клиенту →</Link>}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {r.map((x) => (
                <div key={x.kind} className="rounded-xl bg-surface-2 p-3 text-sm">
                  <div className="flex justify-between font-semibold"><span>{CONTENT_KIND[x.kind]}</span><span>{x.prepared}/{x.planned}</span></div>
                  <div className="my-2"><Progress value={Number(x.prepared)} max={x.planned} tone={x.overdue > 0 ? "bad" : "good"} /></div>
                  <div className="text-xs text-muted">опубл. {x.published} · проверено {x.verified} · осталось {x.left_to_prepare}{x.overflow > 0 ? ` · сверх ${x.overflow}` : ""}{x.overdue > 0 ? ` · просрочено ${x.overdue}` : ""}</div>
                </div>
              ))}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

async function People({ from, to }: { from: string; to: string }) {
  const supabase = await createClient();
  const people = await activePeople();
  const [{ data: content }, { data: tasks }, { data: open }] = await Promise.all([
    supabase.from("content_items").select("assignee_id,prep_due,submitted_at,approved_at").gte("approved_at", `${from}T00:00:00+06:00`).lte("approved_at", `${to}T23:59:59+06:00`),
    supabase.from("tasks").select("assignee_id,due_at,completed_at").eq("status", "done").gte("completed_at", `${from}T00:00:00+06:00`).lte("completed_at", `${to}T23:59:59+06:00`),
    supabase.from("content_items").select("assignee_id,prep_due").not("status", "in", "(done,published,cancelled,paused)"),
  ]);
  const stat = new Map<string, { onTime: number; late: number; open: number; overdue: number }>();
  const g = (id: string) => stat.get(id) ?? stat.set(id, { onTime: 0, late: 0, open: 0, overdue: 0 }).get(id)!;
  for (const c of (content ?? []) as { assignee_id: string | null; prep_due: string | null; submitted_at: string | null; approved_at: string }[]) {
    if (!c.assignee_id) continue;
    const doneAt = c.submitted_at ?? c.approved_at;
    if (c.prep_due && doneAt > c.prep_due) g(c.assignee_id).late++; else g(c.assignee_id).onTime++;
  }
  for (const t of (tasks ?? []) as { assignee_id: string | null; due_at: string | null; completed_at: string }[]) {
    if (!t.assignee_id) continue;
    if (t.due_at && t.completed_at > t.due_at) g(t.assignee_id).late++; else g(t.assignee_id).onTime++;
  }
  for (const c of (open ?? []) as { assignee_id: string | null; prep_due: string | null }[]) {
    if (!c.assignee_id) continue;
    g(c.assignee_id).open++;
    if (c.prep_due && new Date(c.prep_due) < new Date()) g(c.assignee_id).overdue++;
  }
  return (
    <Card className="p-0 md:p-0"><div className="scroll-x"><table className="tbl">
      <thead><tr><th>Сотрудник</th><th>Сдано в срок</th><th>С опозданием</th><th>% в срок</th><th>В работе сейчас</th><th>Просрочено сейчас</th></tr></thead>
      <tbody>{people.filter((p) => stat.has(p.id)).map((p) => {
        const x = stat.get(p.id)!;
        const tot = x.onTime + x.late;
        return <tr key={p.id}><td>{p.full_name}</td><td>{x.onTime}</td><td className={x.late ? "text-warn" : ""}>{x.late}</td><td>{tot ? `${Math.round((x.onTime / tot) * 100)}%` : "—"}</td><td>{x.open}</td><td className={x.overdue ? "text-bad" : ""}>{x.overdue}</td></tr>;
      })}</tbody>
    </table></div></Card>
  );
}
