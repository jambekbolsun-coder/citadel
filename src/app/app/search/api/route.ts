import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cleanQuery, MIN_QUERY, searchScope, type SearchGroup } from "@/lib/search";
import { CONTENT_KIND, TASK_STATUS } from "@/lib/labels";
import { dateTime } from "@/lib/format";

export const dynamic = "force-dynamic";
const LIMIT = 6;
const noStore = { "Cache-Control": "private, no-store" };

// Поиск идёт от имени сотрудника: каждую выборку дополнительно ограничивает RLS
export async function GET(req: NextRequest) {
  const s = await getSession();
  if (!s || s.profile?.status !== "active") return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: noStore });
  const q = cleanQuery(req.nextUrl.searchParams.get("q"));
  if (q.length < MIN_QUERY) return NextResponse.json({ groups: [] }, { headers: noStore });
  const like = `%${q}%`;
  const scope = searchScope(s.can);
  const supabase = await createClient();
  const none = Promise.resolve({ data: [] as unknown[] });
  const [projects, tasks, content, shoots, clients, people, leads] = await Promise.all([
    supabase.from("projects").select("id,name,number,clients(company_name)").ilike("name", like).order("created_at", { ascending: false }).limit(LIMIT),
    supabase.from("tasks").select("id,title,status,due_at").ilike("title", like).order("due_at", { ascending: false, nullsFirst: false }).limit(LIMIT),
    supabase.from("content_items").select("id,title,kind,projects(name)").ilike("title", like).order("prep_due", { ascending: false, nullsFirst: false }).limit(LIMIT),
    supabase.from("shoots").select("id,title,starts_at").ilike("title", like).order("starts_at", { ascending: false }).limit(LIMIT),
    scope.clients ? supabase.from("clients").select("id,company_name,contact_name").ilike("company_name", like).limit(LIMIT) : none,
    scope.people ? supabase.from("profiles").select("id,full_name,job_title").eq("status", "active").ilike("full_name", like).limit(LIMIT) : none,
    scope.leads ? supabase.from("leads").select("id,name,service").ilike("name", like).order("created_at", { ascending: false }).limit(LIMIT) : none,
  ]);
  type R = Record<string, unknown>;
  const rows = (r: { data: unknown }) => (r.data ?? []) as R[];
  const groups: SearchGroup[] = [
    { key: "projects", label: "Проекты", items: rows(projects).map((p) => ({ id: String(p.id), title: String(p.name), sub: [`#${p.number}`, (p.clients as R | null)?.company_name].filter(Boolean).join(" · "), href: `/app/projects/${p.id}` })) },
    { key: "tasks", label: "Задачи", items: rows(tasks).map((t) => ({ id: String(t.id), title: String(t.title), sub: [TASK_STATUS[String(t.status)], t.due_at ? dateTime(String(t.due_at)) : null].filter(Boolean).join(" · "), href: `/app/tasks/${t.id}` })) },
    { key: "content", label: "Контент", items: rows(content).map((c) => ({ id: String(c.id), title: String(c.title), sub: [CONTENT_KIND[String(c.kind)], (c.projects as R | null)?.name].filter(Boolean).join(" · "), href: `/app/content/${c.id}` })) },
    { key: "shoots", label: "Съёмки", items: rows(shoots).map((x) => ({ id: String(x.id), title: String(x.title), sub: x.starts_at ? dateTime(String(x.starts_at)) : null, href: `/app/shoots/${x.id}` })) },
    { key: "clients", label: "Клиенты", items: rows(clients).map((c) => ({ id: String(c.id), title: String(c.company_name), sub: (c.contact_name as string | null) ?? null, href: `/app/clients/${c.id}` })) },
    { key: "people", label: "Сотрудники", items: rows(people).map((p) => ({ id: String(p.id), title: String(p.full_name), sub: (p.job_title as string | null) ?? null, href: `/app/team/${p.id}` })) },
    { key: "leads", label: "Заявки", items: rows(leads).map((l) => ({ id: String(l.id), title: String(l.name), sub: (l.service as string | null) ?? null, href: `/app/leads/${l.id}` })) },
  ].filter((g) => g.items.length);
  return NextResponse.json({ groups }, { headers: noStore });
}
