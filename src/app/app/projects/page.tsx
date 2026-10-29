import Link from "next/link";
import { requireActive } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge, ButtonLink, Card, Empty, PageHeader, Pager } from "@/components/ui";
import { PROJECT_KIND, PROJECT_STATUS } from "@/lib/labels";
import { activePeople, nameOf } from "@/lib/data";
import { pageRange, pageSlice } from "@/lib/paging";
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
  const { items: rows, hasMore } = pageSlice((data ?? []) as unknown as { id: string; number: number; name: string; kind: string; status: string; admin_id: string | null; contract_start: string | null; contract_end: string | null; clients: { company_name: string } | null }[]);

  return (
    <>
      <PageHeader title="Проекты" subtitle="Договорный план — источник истины; задачи и съёмки его выполняют"
        actions={s.can("projects.create") ? <ButtonLink href="/app/projects/new">+ Проект</ButtonLink> : null} />
      <form className="mb-4 grid grid-cols-[1fr_auto] gap-2 sm:flex sm:flex-wrap">
        <input name="q" type="search" defaultValue={q} placeholder="Поиск по названию" className="input sm:max-w-xs" />
        <button className="min-h-11 rounded-xl bg-surface px-4 text-sm font-semibold ring-1 ring-line">Найти</button>
        <select name="status" defaultValue={status} aria-label="Статус" className="input col-span-2 sm:col-span-1 sm:max-w-[220px]">
          <option value="">Все активные</option>
          {Object.entries(PROJECT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </form>
      {rows.length === 0 ? (
        <Empty title="Проектов нет" text="Проект создаётся из клиента или заявки. Производство стартует после 100% оплаты и чек-листа передачи." />
      ) : (
        <>
          <ul className="space-y-2 md:hidden">
            {rows.map((p) => (
              <li key={p.id}>
                <Link href={`/app/projects/${p.id}`} className="block rounded-2xl border border-line bg-surface p-4 active:bg-surface-2">
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0 font-semibold [overflow-wrap:anywhere]">{p.name}</span>
                    <Badge status={p.status}>{PROJECT_STATUS[p.status]}</Badge>
                  </div>
                  <div className="mt-1 truncate text-[13px] text-muted">#{p.number} · {p.clients?.company_name ?? "клиент не указан"} · {PROJECT_KIND[p.kind]}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px]">
                    {p.status === "in_progress" && (overdueBy[p.id] ? <Badge tone="bad">Просрочки: {overdueBy[p.id]}</Badge> : <Badge tone="good">По графику</Badge>)}
                    <span className="text-muted">{nameOf(people, p.admin_id)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <Card className="hidden p-0 md:block md:p-0">
          <div className="scroll-x">
            <table className="tbl">
              <thead><tr><th>Проект</th><th>Тип</th><th>Статус</th><th>Контроль</th><th>Администратор</th><th>Договор</th></tr></thead>
              <tbody>
                {rows.map((p) => (
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
        </>
      )}
      <Pager page={page} hasMore={hasMore} base={`/app/projects?status=${status}&q=${encodeURIComponent(q)}`} />
    </>
  );
}
