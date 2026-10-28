import Link from "next/link";
import { requireActive } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { ActionForm, Submit } from "@/components/action-form";
import { date, overdueText, todayLocal } from "@/lib/format";
import { startCheck } from "./actions";

export const metadata = { title: "Проверки" };

export default async function Checks() {
  const s = await requireActive();
  const supabase = await createClient();
  const today = todayLocal();
  const [{ data: myProjects }, { data: checks }] = await Promise.all([
    supabase.from("projects").select("id,name").eq("admin_id", s.userId).eq("status", "in_progress"),
    supabase.from("project_admin_checks").select("id,day,due_at,completed_at,escalated,project_id,projects(name)").or(`admin_id.eq.${s.userId}${s.can("projects.manage") ? ",admin_id.neq.00000000-0000-0000-0000-000000000000" : ""}`).order("day", { ascending: false }).limit(60),
  ]);
  const rows = (checks ?? []) as unknown as { id: string; day: string; due_at: string; completed_at: string | null; escalated: boolean; project_id: string; projects: { name: string } | null }[];
  const todayIds = new Set(rows.filter((r) => r.day === today).map((r) => r.project_id));
  return (
    <>
      <PageHeader title="Ежедневные проверки" subtitle="У каждого активного проекта — один основной администратор. Проверка имеет свой дедлайн и может быть просрочена." />
      {(myProjects ?? []).filter((p: { id: string }) => !todayIds.has(p.id)).length > 0 && (
        <Card title="Начать проверку на сегодня" className="mb-4">
          <div className="flex flex-wrap gap-2">
            {(myProjects ?? []).filter((p: { id: string }) => !todayIds.has(p.id)).map((p: { id: string; name: string }) => (
              <ActionForm key={p.id} action={startCheck}><input type="hidden" name="project_id" value={p.id} /><Submit variant="secondary">{p.name}</Submit></ActionForm>
            ))}
          </div>
        </Card>
      )}
      {rows.length === 0 ? <Empty title="Проверок нет" text="Проверки создаются автоматически каждый день для проектов в работе." /> : (
        <Card className="p-0 md:p-0"><div className="scroll-x"><table className="tbl">
          <thead><tr><th>День</th><th>Проект</th><th>Статус</th></tr></thead>
          <tbody>{rows.map((c) => (
            <tr key={c.id}>
              <td><Link className="font-semibold text-primary" href={`/app/checks/${c.id}`}>{date(c.day)}</Link></td>
              <td>{c.projects?.name}</td>
              <td>{c.completed_at ? <Badge tone={new Date(c.completed_at) > new Date(c.due_at) ? "warn" : "good"}>{new Date(c.completed_at) > new Date(c.due_at) ? "С опозданием" : "Проведена"}</Badge> : overdueText(c.due_at) ? <Badge tone="bad">{overdueText(c.due_at)}</Badge> : <Badge>Ожидает</Badge>} {c.escalated && <Badge tone="bad">эскалация</Badge>}</td>
            </tr>
          ))}</tbody>
        </table></div></Card>
      )}
    </>
  );
}
