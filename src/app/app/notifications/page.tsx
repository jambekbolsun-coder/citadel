import Link from "next/link";
import { requireActive } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, Empty, PageHeader, Tabs, cn } from "@/components/ui";
import { ActionForm, Submit } from "@/components/action-form";
import { dateTime } from "@/lib/format";
import { archive, markAllRead, markRead } from "./actions";

export const metadata = { title: "Уведомления" };

function hrefOf(t: string | null, id: string | null, type?: string) {
  if (type === "employee.approved") return "/app"; // уведомление самому сотруднику — ведём в его кабинет
  if (!t || !id) return "/app";
  return { lead: `/app/leads/${id}`, project: `/app/projects/${id}`, content: `/app/content/${id}`, task: `/app/tasks/${id}`, shoot: `/app/shoots/${id}`, profile: `/app/team/${id}`, campaign: `/app/campaigns/${id}`, payroll: "/app/payroll", period: "/app/projects" }[t] ?? "/app";
}

export default async function Notifications({ searchParams }: PageProps<"/app/notifications">) {
  const sp = await searchParams;
  await requireActive();
  const supabase = await createClient();
  const view = typeof sp.view === "string" ? sp.view : "unread";
  const prio = typeof sp.priority === "string" ? sp.priority : "";
  let q = supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(100);
  if (view === "unread") q = q.is("read_at", null).is("archived_at", null);
  else if (view === "all") q = q.is("archived_at", null);
  else q = q.not("archived_at", "is", null);
  if (prio) q = q.eq("priority", prio);
  const { data } = await q;
  const rows = (data ?? []) as { id: string; type: string; title: string; body: string | null; entity_type: string | null; entity_id: string | null; priority: string; read_at: string | null; created_at: string }[];
  // группировка по дате
  const groups = new Map<string, typeof rows>();
  rows.forEach((n) => {
    const k = new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Bishkek", day: "numeric", month: "long" }).format(new Date(n.created_at));
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(n);
  });
  return (
    <>
      <PageHeader title="Уведомления" subtitle="Внутренний центр событий — работает всегда, независимо от push" actions={<ActionForm action={markAllRead}><Submit variant="secondary">Прочитать все</Submit></ActionForm>} />
      <Tabs active={view} items={[{ key: "unread", label: "Непрочитанные", href: "/app/notifications" }, { key: "all", label: "Все", href: "/app/notifications?view=all" }, { key: "archive", label: "Архив", href: "/app/notifications?view=archive" }]} />
      <div className="mb-3 flex gap-2 text-sm">{["", "critical", "high", "normal"].map((p) => <Link key={p} href={`/app/notifications?view=${view}&priority=${p}`} className={cn("rounded-xl px-3 py-1", prio === p ? "bg-surface ring-1 ring-line font-semibold" : "text-muted")}>{{ "": "Любой приоритет", critical: "Критичные", high: "Высокие", normal: "Обычные" }[p]}</Link>)}</div>
      {rows.length === 0 ? <Empty title="Нет уведомлений" /> : (
        <div className="space-y-4">
          {[...groups.entries()].map(([day, list]) => (
            <Card key={day} title={day}>
              <ul className="divide-y divide-line">{list.map((n) => (
                <li key={n.id} className={cn("flex items-start justify-between gap-3 py-3", !n.read_at && "font-semibold")}>
                  <Link href={hrefOf(n.entity_type, n.entity_id, n.type)} className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">{!n.read_at && <span className="h-2 w-2 rounded-full bg-brand" />}{n.title}{n.priority === "critical" && <Badge tone="bad">срочно</Badge>}</div>
                    {n.body && <div className="mt-0.5 text-sm font-normal text-muted">{n.body}</div>}
                    <div className="mt-0.5 text-xs font-normal text-muted">{dateTime(n.created_at)}</div>
                  </Link>
                  <div className="flex shrink-0 gap-1">
                    {!n.read_at && <ActionForm action={markRead}><input type="hidden" name="id" value={n.id} /><button className="text-xs text-primary">прочитано</button></ActionForm>}
                    {view !== "archive" && <ActionForm action={archive}><input type="hidden" name="id" value={n.id} /><button className="text-xs text-muted">в архив</button></ActionForm>}
                  </div>
                </li>
              ))}</ul>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
