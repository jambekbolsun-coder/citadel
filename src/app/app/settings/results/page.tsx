import Link from "next/link";
import { requireActive } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, Empty, Stat } from "@/components/ui";
import { SettingsPage } from "@/components/settings-list";
import { CONTENT_KIND } from "@/lib/labels";
import { date } from "@/lib/format";

export const metadata = { title: "Мои результаты" };

export default async function Results() {
  const s = await requireActive();
  const supabase = await createClient();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const head = { count: "exact" as const, head: true };
  const [tasksAll, tasksMonth, contentAll, contentMonth, { data: recentTasks }, { data: recentContent }] = await Promise.all([
    supabase.from("tasks").select("id", head).eq("assignee_id", s.userId).eq("status", "done"),
    supabase.from("tasks").select("id", head).eq("assignee_id", s.userId).eq("status", "done").gte("completed_at", monthStart),
    supabase.from("content_items").select("id", head).eq("assignee_id", s.userId).in("status", ["done", "published"]),
    supabase.from("content_items").select("id", head).eq("assignee_id", s.userId).in("status", ["done", "published"]).gte("approved_at", monthStart),
    supabase.from("tasks").select("id,title,completed_at").eq("assignee_id", s.userId).eq("status", "done").order("completed_at", { ascending: false }).limit(10),
    supabase.from("content_items").select("id,title,kind,approved_at").eq("assignee_id", s.userId).in("status", ["done", "published"]).order("approved_at", { ascending: false }).limit(10),
  ]);
  const t = (recentTasks ?? []) as { id: string; title: string; completed_at: string | null }[];
  const c = (recentContent ?? []) as { id: string; title: string; kind: string; approved_at: string | null }[];
  return (
    <SettingsPage title="Мои результаты" subtitle="Считаются только закрытые задачи и утверждённые материалы">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Материалов в этом месяце" value={contentMonth.count ?? 0} hint={`всего ${contentAll.count ?? 0}`} />
        <Stat label="Задач в этом месяце" value={tasksMonth.count ?? 0} hint={`всего ${tasksAll.count ?? 0}`} />
      </div>
      <div className="mt-4 space-y-4">
        {!t.length && !c.length ? (
          <Empty title="Пока нет закрытых работ" text="Сдайте материал или задачу через кнопку «+» — после утверждения они появятся здесь." />
        ) : (
          <>
            {c.length > 0 && (
              <Card title="Утверждённые материалы">
                <ul className="divide-y divide-line text-sm">{c.map((x) => <li key={x.id}><Link href={`/app/content/${x.id}`} className="flex justify-between gap-3 py-2.5"><span className="min-w-0 truncate">{CONTENT_KIND[x.kind]}: {x.title}</span><span className="shrink-0 text-muted">{date(x.approved_at)}</span></Link></li>)}</ul>
              </Card>
            )}
            {t.length > 0 && (
              <Card title="Закрытые задачи">
                <ul className="divide-y divide-line text-sm">{t.map((x) => <li key={x.id}><Link href={`/app/tasks/${x.id}`} className="flex justify-between gap-3 py-2.5"><span className="min-w-0 truncate">{x.title}</span><span className="shrink-0 text-muted">{date(x.completed_at)}</span></Link></li>)}</ul>
              </Card>
            )}
          </>
        )}
      </div>
    </SettingsPage>
  );
}
