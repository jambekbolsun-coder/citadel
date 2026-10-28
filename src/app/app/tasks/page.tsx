import Link from "next/link";
import { requireActive } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, Empty, Field, PageHeader, Pager, Tabs } from "@/components/ui";
import { ActionForm, Submit } from "@/components/action-form";
import { PeopleSelect } from "@/components/people-select";
import { activePeople, nameOf, pageRange } from "@/lib/data";
import { PRIORITY, TASK_STATUS } from "@/lib/labels";
import { dateTime, overdueText } from "@/lib/format";
import { createTask } from "./actions";

export const metadata = { title: "Задачи" };

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
  const rows = (data ?? []) as unknown as { id: string; title: string; status: string; priority: string; assignee_id: string | null; due_at: string | null; original_due_at: string | null; projects: { id: string; name: string } | null }[];
  const views = [["mine", "Мои"], ["review", "На мою проверку"], ["created", "Поставленные мной"], ["overdue", "Просроченные"], ["done", "Выполненные"]];
  return (
    <>
      <PageHeader title="Задачи" subtitle="Операции по проектам и внутренние поручения" />
      <Tabs items={views.map(([k, l]) => ({ key: k, label: l, href: `/app/tasks?view=${k}` }))} active={view} />
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div>
          {rows.length === 0 ? <Empty title="Задач нет" /> : (
            <Card className="p-0 md:p-0"><div className="scroll-x"><table className="tbl">
              <thead><tr><th>Задача</th><th>Проект</th><th>Статус</th><th>Приоритет</th><th>Исполнитель</th><th>Срок</th></tr></thead>
              <tbody>{rows.slice(0, 30).map((t) => (
                <tr key={t.id}>
                  <td><Link href={`/app/tasks/${t.id}`} className="font-semibold hover:underline">{t.title}</Link></td>
                  <td className="text-sm">{t.projects ? <Link className="hover:underline" href={`/app/projects/${t.projects.id}`}>{t.projects.name}</Link> : "—"}</td>
                  <td><Badge status={t.status}>{TASK_STATUS[t.status]}</Badge></td>
                  <td><Badge tone={t.priority === "critical" ? "bad" : t.priority === "high" ? "warn" : "neutral"}>{PRIORITY[t.priority]}</Badge></td>
                  <td className="text-sm">{nameOf(people, t.assignee_id)}</td>
                  <td className="whitespace-nowrap text-xs">{dateTime(t.due_at)}{!["done", "cancelled"].includes(t.status) && overdueText(t.due_at) && <div className="text-bad">{overdueText(t.due_at)}</div>}{t.original_due_at && <div className="text-muted">исходно {dateTime(t.original_due_at)}</div>}</td>
                </tr>
              ))}</tbody>
            </table></div></Card>
          )}
          <Pager page={page} hasMore={rows.length > 30} base={`/app/tasks?view=${view}`} />
        </div>
        <Card title="Новая задача">
          <ActionForm action={createTask} reset className="space-y-3">
            <Field label="Название *"><input name="title" required className="input" /></Field>
            <Field label="ТЗ / описание"><textarea name="description" className="input" /></Field>
            <Field label="Проект"><select name="project_id" className="input"><option value="">— без проекта —</option>{(projects ?? []).map((p: { id: string; name: string }) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
            <Field label="Исполнитель"><PeopleSelect name="assignee_id" people={people} defaultValue={s.userId} /></Field>
            <Field label="Проверяющий"><PeopleSelect name="reviewer_id" people={people} /></Field>
            <Field label="Срок"><input name="due_at" type="datetime-local" className="input" /></Field>
            <Field label="Приоритет"><select name="priority" defaultValue="normal" className="input">{Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            <Submit className="w-full">Создать</Submit>
          </ActionForm>
          <p className="mt-2 text-xs text-muted">Назначать задачи другим можно в своих проектах или с правом управления задачами.</p>
        </Card>
      </div>
    </>
  );
}
