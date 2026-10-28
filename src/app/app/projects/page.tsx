import Link from "next/link";
import { requireActive } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge, ButtonLink, Card, Empty, PageHeader, Pager } from "@/components/ui";
import { PROJECT_KIND, PROJECT_STATUS } from "@/lib/labels";
import { activePeople, nameOf, pageRange } from "@/lib/data";
import { date } from "@/lib/format";

export const metadata = { title: "Проекты" };

export default async function Projects({ searchParams }: PageProps<"/app/projects">) {
  const sp = await searchParams;
  const s = await requireActive();
  const supabase = await createClient();
  const status = typeof sp.status === "string" ? sp.status : "";
  const q = typeof sp.q === "string" ? sp.q.replace(/[%,()]/g, "").trim() : "";
  const { from, to, page } = pageRange(Number(sp.page));
  let query = supabase.from("projects").select("id,number,name,kind,status,admin_id,contract_start,contract_end,launched_at,clients(company_name)").order("created_at", { ascending: false }).range(from, to);
  if (status) query = query.eq("status", status);
  else query = query.not("status", "in", "(closed,cancelled)");
  if (q) query = query.ilike("name", `%${q}%`);
  const [{ data }, people, { data: overdueRows }] = await Promise.all([
    query,
    activePeople(),
    supabase.from("content_items").select("project_id").not("status", "in", "(done,published,cancelled,paused)").lt("prep_due", new Date().toISOString()),
  ]);
  const overdueBy: Record<string, number> = {};
  (overdueRows ?? []).forEach((r: { project_id: string }) => (overdueBy[r.project_id] = (overdueBy[r.project_id] ?? 0) + 1));
  const rows = (data ?? []) as unknown as { id: string; number: number; name: string; kind: string; status: string; admin_id: string | null; contract_start: string | null; contract_end: string | null; clients: { company_name: string } | null }[];

  return (
    <>
      <PageHeader title="Проекты" subtitle="Договорный план — источник истины; задачи и съёмки его выполняют"
        actions={s.can("projects.create") ? <ButtonLink href="/app/projects/new">+ Новый проект</ButtonLink> : null} />
      <form className="mb-3 flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder="Поиск по названию" className="input max-w-xs" />
        <select name="status" defaultValue={status} className="input max-w-[220px]">
          <option value="">Все активные</option>
          {Object.entries(PROJECT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button className="rounded-xl bg-surface-2 px-4 text-sm font-semibold ring-1 ring-line">Показать</button>
      </form>
      {rows.length === 0 ? (
        <Empty title="Проектов нет" text="Проект создаётся из клиента или заявки. Производство стартует после 100% оплаты и чек-листа передачи." />
      ) : (
        <Card className="p-0 md:p-0">
          <div className="scroll-x">
            <table className="tbl">
              <thead><tr><th>Проект</th><th>Тип</th><th>Статус</th><th>Контроль</th><th>Администратор</th><th>Договор</th></tr></thead>
              <tbody>
                {rows.slice(0, 30).map((p) => (
                  <tr key={p.id}>
                    <td><Link href={`/app/projects/${p.id}`} className="font-semibold hover:underline">{p.name}</Link><div className="text-xs text-muted">#{p.number} · {p.clients?.company_name}</div></td>
                    <td className="text-sm">{PROJECT_KIND[p.kind]}</td>
                    <td><Badge status={p.status}>{PROJECT_STATUS[p.status]}</Badge></td>
                    <td>{p.status === "in_progress" ? (overdueBy[p.id] ? <Badge tone="bad">Есть просрочки: {overdueBy[p.id]}</Badge> : <Badge tone="good">По графику</Badge>) : "—"}</td>
                    <td className="text-sm">{nameOf(people, p.admin_id)}</td>
                    <td className="whitespace-nowrap text-xs text-muted">{date(p.contract_start)} — {date(p.contract_end)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <Pager page={page} hasMore={rows.length > 30} base={`/app/projects?status=${status}&q=${encodeURIComponent(q)}`} />
    </>
  );
}
