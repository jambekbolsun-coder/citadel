import Link from "next/link";
import { requireActive } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, Empty, PageHeader, Pager, Tabs } from "@/components/ui";
import { CONTENT_KIND, CONTENT_STATUS } from "@/lib/labels";
import { activePeople, nameOf } from "@/lib/data";
import { pageRange } from "@/lib/paging";
import { dateTime, overdueText } from "@/lib/format";

export const metadata = { title: "Контент" };

export default async function ContentList({ searchParams }: PageProps<"/app/content">) {
  const sp = await searchParams;
  const s = await requireActive();
  const supabase = await createClient();
  const view = typeof sp.view === "string" ? sp.view : "mine";
  const status = typeof sp.status === "string" ? sp.status : "";
  const kind = typeof sp.kind === "string" ? sp.kind : "";
  const assignee = typeof sp.assignee === "string" ? sp.assignee : "";
  const { from, to, page } = pageRange(Number(sp.page));
  let q = supabase.from("content_items").select("id,title,kind,status,assignee_id,reviewer_id,prep_due,review_due,publish_due,projects(id,name)").order("prep_due", { nullsFirst: false }).range(from, to);
  if (view === "mine") q = q.eq("assignee_id", s.userId).not("status", "in", "(published,cancelled)");
  if (view === "review") q = q.eq("reviewer_id", s.userId).eq("status", "review");
  if (view === "revision") q = q.eq("assignee_id", s.userId).eq("status", "revision");
  if (view === "overdue") q = q.not("status", "in", "(done,published,cancelled,paused)").lt("prep_due", new Date().toISOString());
  if (view === "publish") q = q.eq("status", "done");
  if (view === "unassigned") q = q.is("assignee_id", null).eq("status", "planned");
  if (status) q = q.eq("status", status);
  if (kind) q = q.eq("kind", kind);
  if (assignee) q = q.eq("assignee_id", assignee);
  const [{ data }, people] = await Promise.all([q, activePeople()]);
  const rows = (data ?? []) as unknown as { id: string; title: string; kind: string; status: string; assignee_id: string | null; reviewer_id: string | null; prep_due: string | null; review_due: string | null; publish_due: string | null; projects: { id: string; name: string } | null }[];
  const views = [["mine", "Мои"], ["review", "На мою проверку"], ["revision", "На доработке"], ["publish", "К публикации"], ["overdue", "Просрочено"], ["unassigned", "Без исполнителя"], ["all", "Все доступные"]];
  const base = `/app/content?view=${view}&status=${status}&kind=${kind}&assignee=${assignee}`;
  return (
    <>
      <PageHeader title="Контент-план" subtitle="Видео, посты, карусели и креативы. Статусы меняются только через рабочий процесс." />
      <Tabs items={views.map(([k, l]) => ({ key: k, label: l, href: `/app/content?view=${k}` }))} active={view} />
      <form className="mb-3 flex flex-wrap gap-2">
        <input type="hidden" name="view" value={view} />
        <select name="kind" defaultValue={kind} className="input max-w-[180px]"><option value="">Все виды</option>{Object.entries(CONTENT_KIND).filter(([k]) => !["story", "shoot"].includes(k)).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select name="status" defaultValue={status} className="input max-w-[200px]"><option value="">Все статусы</option>{Object.entries(CONTENT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <select name="assignee" defaultValue={assignee} className="input max-w-[220px]"><option value="">Все исполнители</option>{people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select>
        <button className="rounded-xl bg-surface-2 px-4 text-sm font-semibold ring-1 ring-line">Фильтр</button>
      </form>
      {rows.length === 0 ? <Empty title="Ничего не найдено" text="Измените фильтр или вкладку." /> : (
        <Card className="p-0 md:p-0"><div className="scroll-x"><table className="tbl">
          <thead><tr><th>Материал</th><th>Проект</th><th>Статус</th><th>Исполнитель</th><th>Срок подготовки</th><th>Публикация</th></tr></thead>
          <tbody>{rows.slice(0, 30).map((c) => (
            <tr key={c.id}>
              <td><Link href={`/app/content/${c.id}`} className="font-semibold hover:underline">{CONTENT_KIND[c.kind]}: {c.title}</Link></td>
              <td className="text-sm"><Link href={`/app/projects/${c.projects?.id}`} className="hover:underline">{c.projects?.name}</Link></td>
              <td><Badge status={c.status}>{CONTENT_STATUS[c.status]}</Badge></td>
              <td className="text-sm">{nameOf(people, c.assignee_id)}</td>
              <td className="whitespace-nowrap text-xs">{dateTime(c.status === "review" ? c.review_due : c.prep_due)}{!["done", "published", "cancelled"].includes(c.status) && overdueText(c.status === "review" ? c.review_due : c.prep_due) && <div className="text-bad">{overdueText(c.status === "review" ? c.review_due : c.prep_due)}</div>}</td>
              <td className="whitespace-nowrap text-xs">{dateTime(c.publish_due)}</td>
            </tr>
          ))}</tbody>
        </table></div></Card>
      )}
      <Pager page={page} hasMore={rows.length > 30} base={base} />
    </>
  );
}
