import Link from "next/link";
import { requireActive } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, Empty, PageHeader, Pager } from "@/components/ui";
import { ActionForm, Submit } from "@/components/action-form";
import { pageRange } from "@/lib/data";
import { date } from "@/lib/format";
import { ClientFields } from "./client-fields";
import { createClientAction } from "./actions";

export const metadata = { title: "Клиенты" };

export default async function Clients({ searchParams }: PageProps<"/app/clients">) {
  const sp = await searchParams;
  const s = await requireActive(["clients.view", "clients.manage"]);
  const supabase = await createClient();
  const q = typeof sp.q === "string" ? sp.q.replace(/[%,()]/g, "").trim() : "";
  const { from, to, page } = pageRange(Number(sp.page));
  let query = supabase.from("clients").select("id,company_name,contact_name,phone,niche,created_at,projects(id,status)").is("archived_at", null).order("company_name").range(from, to);
  if (q) query = query.or(`company_name.ilike.%${q}%,contact_name.ilike.%${q}%,phone.ilike.%${q}%,niche.ilike.%${q}%`);
  const { data } = await query;
  const rows = (data ?? []) as unknown as { id: string; company_name: string; contact_name: string | null; phone: string | null; niche: string | null; created_at: string; projects: { id: string; status: string }[] }[];
  return (
    <>
      <PageHeader title="Клиенты" subtitle="Единая база клиентов без дублей" />
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div>
          <form className="mb-3 flex gap-2">
            <input name="q" defaultValue={q} placeholder="Поиск по названию, контакту, телефону, нише" className="input" />
            <button className="rounded-xl bg-surface-2 px-4 text-sm font-semibold ring-1 ring-line">Найти</button>
          </form>
          {rows.length === 0 ? (
            <Empty title="Клиентов пока нет" text="Клиенты создаются из заявок или вручную." />
          ) : (
            <Card className="p-0 md:p-0">
              <div className="scroll-x">
                <table className="tbl">
                  <thead><tr><th>Компания</th><th>Контакт</th><th>Ниша</th><th>Проекты</th><th>С нами с</th></tr></thead>
                  <tbody>
                    {rows.slice(0, 30).map((c) => (
                      <tr key={c.id}>
                        <td><Link href={`/app/clients/${c.id}`} className="font-semibold hover:underline">{c.company_name}</Link></td>
                        <td className="text-sm">{c.contact_name ?? "—"}<div className="text-xs text-muted">{c.phone}</div></td>
                        <td className="text-sm">{c.niche ?? "—"}</td>
                        <td className="text-sm">{c.projects.filter((p) => p.status === "in_progress").length} активн. / {c.projects.length}</td>
                        <td className="text-xs text-muted">{date(c.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
          <Pager page={page} hasMore={rows.length > 30} base={`/app/clients?q=${encodeURIComponent(q)}`} />
        </div>
        {s.can("clients.manage") && (
          <Card title="Новый клиент">
            <ActionForm action={createClientAction} className="space-y-3">
              <ClientFields />
              <Submit className="w-full">Создать</Submit>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
