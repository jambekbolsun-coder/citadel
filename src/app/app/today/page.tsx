import Link from "next/link";
import { requireActive } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, Notice, PageHeader } from "@/components/ui";
import { CONTENT_KIND, CONTENT_STATUS, TASK_STATUS, RESPONSE } from "@/lib/labels";
import { localToIso, overdueText, time, todayLocal, date } from "@/lib/format";

export const metadata = { title: "Сегодня" };

// Личный рабочий день: всё, что назначено мне на сегодня (+ просроченное)
export default async function Today() {
  const s = await requireActive();
  const supabase = await createClient();
  const today = todayLocal();
  const end = localToIso(today, "23:59");
  const [{ data: content }, { data: tasks }, { data: shoots }, { data: stories }, { data: reviews }, { data: checks }] = await Promise.all([
    supabase.from("content_items").select("id,title,kind,status,prep_due,projects(name)").eq("assignee_id", s.userId).not("status", "in", "(done,published,cancelled,paused,review)").lte("prep_due", end).order("prep_due"),
    supabase.from("tasks").select("id,title,status,due_at").eq("assignee_id", s.userId).not("status", "in", "(done,cancelled,review)").lte("due_at", end).order("due_at"),
    supabase.from("shoot_participants").select("response,role,shoots!inner(id,title,starts_at,ends_at,location,status)").eq("user_id", s.userId).gte("shoots.starts_at", localToIso(today, "00:00")).lte("shoots.starts_at", end),
    supabase.from("story_daily_plans").select("id,planned,actual,project_id,confirmed_at,projects(name)").eq("assignee_id", s.userId).eq("day", today),
    supabase.from("content_items").select("id,title,kind,review_due").eq("reviewer_id", s.userId).eq("status", "review").order("review_due"),
    supabase.from("project_admin_checks").select("id,due_at,projects(name)").eq("admin_id", s.userId).eq("day", today).is("completed_at", null),
  ]);
  const c = (content ?? []) as unknown as { id: string; title: string; kind: string; status: string; prep_due: string; projects: { name: string } | null }[];
  const t = (tasks ?? []) as { id: string; title: string; status: string; due_at: string }[];
  const sh = ((shoots ?? []) as unknown as { response: string; role: string; shoots: { id: string; title: string; starts_at: string; location: string | null; status: string } }[]).filter((x) => x.shoots.status === "planned");
  const st = ((stories ?? []) as unknown as { id: string; planned: number; actual: number; project_id: string; projects: { name: string } | null }[]).filter((x) => x.actual < x.planned);
  const rv = (reviews ?? []) as { id: string; title: string; kind: string; review_due: string | null }[];
  const ch = (checks ?? []) as unknown as { id: string; due_at: string; projects: { name: string } | null }[];
  const total = c.length + t.length + sh.length + st.length + rv.length + ch.length;

  return (
    <>
      <PageHeader title="Сегодня" subtitle={date(today)} />
      {total === 0 ? (
        <Notice tone="good">Запланированные задачи на сегодня выполнены. Это не означает, что материалы уже опубликованы или проверены — следите за статусами в контент-плане.</Notice>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {sh.length > 0 && <Card title="Съёмки">{sh.map((x) => (
            <Link key={x.shoots.id} href={`/app/shoots/${x.shoots.id}`} className="flex items-center justify-between gap-2 border-b border-line py-2 text-sm last:border-0">
              <span><b>{time(x.shoots.starts_at)}</b> {x.shoots.title} · {x.shoots.location ?? "—"}</span><Badge status={x.response}>{RESPONSE[x.response]}</Badge>
            </Link>))}</Card>}
          {c.length > 0 && <Card title="Материалы к сдаче">{c.map((x) => (
            <Link key={x.id} href={`/app/content/${x.id}`} className="flex items-center justify-between gap-2 border-b border-line py-2 text-sm last:border-0">
              <span className="truncate">{CONTENT_KIND[x.kind]}: {x.title} <span className="text-muted">· {x.projects?.name}</span></span>
              {overdueText(x.prep_due) ? <Badge tone="bad">{overdueText(x.prep_due)}</Badge> : <Badge status={x.status}>{CONTENT_STATUS[x.status]} · до {time(x.prep_due)}</Badge>}
            </Link>))}</Card>}
          {st.length > 0 && <Card title="Сторис сегодня">{st.map((x) => (
            <Link key={x.id} href={`/app/projects/${x.project_id}?tab=stories`} className="flex items-center justify-between border-b border-line py-2 text-sm last:border-0">
              <span>{x.projects?.name}</span><Badge tone={x.actual > 0 ? "warn" : "neutral"}>{x.actual}/{x.planned}, осталось {x.planned - x.actual}</Badge>
            </Link>))}</Card>}
          {rv.length > 0 && <Card title="Ждут моей проверки">{rv.map((x) => (
            <Link key={x.id} href={`/app/content/${x.id}`} className="flex items-center justify-between gap-2 border-b border-line py-2 text-sm last:border-0">
              <span className="truncate">{CONTENT_KIND[x.kind]}: {x.title}</span>{overdueText(x.review_due) ? <Badge tone="bad">{overdueText(x.review_due)}</Badge> : <Badge tone="warn">до {time(x.review_due)}</Badge>}
            </Link>))}</Card>}
          {t.length > 0 && <Card title="Задачи">{t.map((x) => (
            <Link key={x.id} href={`/app/tasks/${x.id}`} className="flex items-center justify-between gap-2 border-b border-line py-2 text-sm last:border-0">
              <span className="truncate">{x.title}</span>{overdueText(x.due_at) ? <Badge tone="bad">{overdueText(x.due_at)}</Badge> : <Badge status={x.status}>{TASK_STATUS[x.status]}</Badge>}
            </Link>))}</Card>}
          {ch.length > 0 && <Card title="Ежедневные проверки проектов">{ch.map((x) => (
            <Link key={x.id} href={`/app/checks/${x.id}`} className="flex items-center justify-between border-b border-line py-2 text-sm last:border-0">
              <span>{x.projects?.name}</span>{overdueText(x.due_at) ? <Badge tone="bad">{overdueText(x.due_at)}</Badge> : <Badge>до {time(x.due_at)}</Badge>}
            </Link>))}</Card>}
        </div>
      )}
    </>
  );
}
