import { requireActive } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, PageHeader, Pager } from "@/components/ui";
import { activePeople, nameOf } from "@/lib/data";
import { pageRange } from "@/lib/paging";
import { dateTime } from "@/lib/format";

export const metadata = { title: "Журнал аудита" };

export default async function Audit({ searchParams }: PageProps<"/app/audit">) {
  const sp = await searchParams;
  await requireActive("audit.view");
  const supabase = await createClient();
  const act = typeof sp.action === "string" ? sp.action.replace(/[%,()]/g, "") : "";
  const { from, to, page } = pageRange(Number(sp.page));
  let q = supabase.from("audit_log").select("*").order("created_at", { ascending: false }).range(from, to);
  if (act) q = q.ilike("action", `${act}%`);
  const [{ data }, people] = await Promise.all([q, activePeople()]);
  const rows = (data ?? []) as { id: number; actor_id: string | null; action: string; entity_type: string; entity_id: string | null; data: Record<string, unknown> | null; created_at: string }[];
  return (
    <>
      <PageHeader title="Журнал аудита" subtitle="Права, роли, статусы, оплаты, зарплаты, доступы к секретам, публикации сайта. Содержимое секретов не записывается." />
      <form className="mb-3 flex gap-2">
        <select name="action" defaultValue={act} className="input max-w-xs">
          <option value="">Все действия</option>
          {["role", "perm", "matrix", "invite", "profile", "owner", "project", "plan", "period", "payment", "expense", "payroll", "salary", "secret", "site", "tariff", "pin"].map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <button className="rounded-xl bg-surface-2 px-4 text-sm font-semibold ring-1 ring-line">Фильтр</button>
      </form>
      <Card className="p-0 md:p-0"><div className="scroll-x"><table className="tbl">
        <thead><tr><th>Время</th><th>Кто</th><th>Действие</th><th>Объект</th><th>Данные</th></tr></thead>
        <tbody>{rows.slice(0, 30).map((r) => (
          <tr key={r.id}><td className="whitespace-nowrap text-xs">{dateTime(r.created_at)}</td><td className="text-sm">{r.actor_id ? nameOf(people, r.actor_id) : "система"}</td><td className="font-mono text-xs">{r.action}</td><td className="text-xs">{r.entity_type} {r.entity_id?.slice(0, 8)}</td><td className="max-w-[360px] truncate font-mono text-[11px] text-muted">{r.data ? JSON.stringify(r.data) : ""}</td></tr>
        ))}</tbody>
      </table></div></Card>
      <Pager page={page} hasMore={rows.length > 30} base={`/app/audit?action=${act}`} />
    </>
  );
}
