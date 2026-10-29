import Link from "next/link";
import { requireActive } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge, ButtonLink, Card, Empty, PageHeader, Pager, Tabs } from "@/components/ui";
import { activePeople, nameOf } from "@/lib/data";
import { pageRange, pageSlice } from "@/lib/paging";
import { PRIORITY, TASK_STATUS } from "@/lib/labels";
import { dateTime, overdueText } from "@/lib/format";
import { TaskForm } from "./task-form";

export const metadata = { title: "Поручения" };

type Row = { id: string; title: string; status: string; priority: string; assignee_id: string | null; due_at: string | null; original_due_at: string | null; projects: { id: string; name: string } | null };

export default async function Tasks({ searchParams }: PageProps<"/app/tasks">) {
  const sp = await searchParams;
  const s = await requireActive();
  const supabase = await createClient();
  const view = typeof sp.view === "string" ? sp.view : "mine";
  const { from, to, page } = pageRange(Number(sp.page));
  let q = supabase.from("tasks").select("id,title,status,priority,assignee_id,reviewer_id,due_at,original_due_at,projects(id,name)").order("due_at", { nullsFirst: false }).range(from, to);
  if (view === "mine") q = q.eq("assignee_id", s.userId).not("status", "in", "(done,cancelled)");
  if (view === "review") q = q.eq("reviewer_id", s.userId).eq("status", "review");
  if (view === "created") q = q.eq("created_by", s.userId);
  if (view === "done") q = q.eq("assignee_id", s.userId).eq("status", "done");
  if (view === "overdue") q = q.not("status", "in", "(done,cancelled)").lt("due_at", new Date().toISOString());
  const [{ data }, people, { data: projects }] = await Promise.all([q, activePeople(), supabase.from("projects").select("id,name").not("status", "in", "(closed,cancelled)").order("name")]);
  const { items: rows, hasMore } = pageSlice((data ?? []) as unknown as Row[]);
  const views = [["mine", "Мои"], ["review", "На мою проверку"], ["created", "Поставленные мной"], ["overdue", "Просроченные"], ["done", "Выполненные"]];
  const late = (t: Row) => !["done", "cancelled"].includes(t.status) && overdueText(t.due_at);
  return (
    <>
      <PageHeader title="Поручения" subtitle="Операции по проектам и внутренние задачи" actions={<ButtonLink href="/app/tasks/new" className="lg:hidden">+ Задача</ButtonLink>} />
      <Tabs items={views.map(([k, l]) => ({ key: k, label: l, href: `/app/tasks?view=${k}` }))} active={view} />
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0">
          {rows.length === 0 ? (
            <Empty title="Задач нет" text={view === "mine" ? "Всё назначенное вам выполнено." : undefined} />
          ) : (
            <>
              <ul className="space-y-2 md:hidden">
                {rows.map((t) => (
                  <li key={t.id}>
                    <Link href={`/app/tasks/${t.id}`} className="block rounded-2xl border border-line bg-surface p-4 active:bg-surface-2">
                      <div className="flex items-start justify-between gap-3">
                        <span className="min-w-0 font-semibold [overflow-wrap:anywhere]">{t.title}</span>
                        <Badge status={t.status}>{TASK_STATUS[t.status]}</Badge>
                      </div>
                      <div className="mt-1 truncate text-[13px] text-muted">{[t.projects?.name, nameOf(people, t.assignee_id)].filter((x) => x && x !== "—").join(" · ") || "Без проекта"}</div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px]">
                        {late(t) ? <Badge tone="bad">{late(t)}</Badge> : <span className="text-muted">{t.due_at ? `до ${dateTime(t.due_at)}` : "без срока"}</span>}
                        {t.priority !== "normal" && <Badge tone={t.priority === "critical" ? "bad" : t.priority === "high" ? "warn" : "neutral"}>{PRIORITY[t.priority]}</Badge>}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
              <Card className="hidden p-0 md:block md:p-0">
                <div className="scroll-x">
                  <table className="tbl">
                    <thead><tr><th>Задача</th><th>Проект</th><th>Статус</th><th>Приоритет</th><th>Исполнитель</th><th>Срок</th></tr></thead>
                    <tbody>
                      {rows.map((t) => (
                        <tr key={t.id}>
                          <td><Link href={`/app/tasks/${t.id}`} className="font-semibold hover:underline">{t.title}</Link></td>
                          <td className="text-sm">{t.projects ? <Link className="hover:underline" href={`/app/projects/${t.projects.id}`}>{t.projects.name}</Link> : "—"}</td>
                          <td><Badge status={t.status}>{TASK_STATUS[t.status]}</Badge></td>
                          <td><Badge tone={t.priority === "critical" ? "bad" : t.priority === "high" ? "warn" : "neutral"}>{PRIORITY[t.priority]}</Badge></td>
                          <td className="text-sm">{nameOf(people, t.assignee_id)}</td>
                          <td className="whitespace-nowrap text-xs">{dateTime(t.due_at)}{late(t) && <div className="text-bad">{late(t)}</div>}{t.original_due_at && <div className="text-muted">исходно {dateTime(t.original_due_at)}</div>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}
          <Pager page={page} hasMore={hasMore} base={`/app/tasks?view=${view}`} />
        </div>
        <Card title="Новая задача" className="hidden self-start lg:block">
          <TaskForm people={people} projects={(projects ?? []) as { id: string; name: string }[]} me={s.userId} />
        </Card>
      </div>
    </>
  );
}
