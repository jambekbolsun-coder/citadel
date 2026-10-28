import Image from "next/image";
import { notFound } from "next/navigation";
import { requireActive } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CONTENT_KIND, PLATFORMS } from "@/lib/labels";
import { date, money } from "@/lib/format";
import { PrintButton } from "./print-button";

export const metadata = { title: "Отчёт клиенту" };

// Клиентский отчёт и черновик акта: без зарплат, секретов и внутренних комментариев
export default async function ClientReport({ params, searchParams }: PageProps<"/app/reports/client/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const s = await requireActive();
  const supabase = await createClient();
  const { data: p } = await supabase.from("projects").select("id,name,clients(company_name,contact_name)").eq("id", id).maybeSingle();
  if (!p) notFound();
  const { data: periods } = await supabase.from("project_periods").select("*").eq("project_id", id).order("seq", { ascending: false });
  const period = (periods ?? []).find((x: { id: string }) => x.id === sp.period) ?? (periods ?? [])[0];
  if (!period) notFound();
  const [{ data: prog }, { data: published }, { data: contract }] = await Promise.all([
    supabase.from("v_period_progress").select("*").eq("period_id", period.id),
    supabase.from("content_items").select("id,title,kind,placements(platform,url,published_at)").eq("period_id", period.id).eq("status", "published"),
    s.can("prices.view") ? supabase.from("project_contracts").select("price_minor,currency").eq("project_id", id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const rows = (prog ?? []) as { kind: string; planned: number; prepared: number; published: number; left_to_prepare: number; overflow: number }[];
  const debt = rows.reduce((a, r) => a + Number(r.left_to_prepare), 0);
  const client = (Array.isArray(p.clients) ? p.clients[0] : p.clients) as { company_name: string; contact_name: string | null } | null;
  return (
    <div className="mx-auto max-w-3xl rounded-2xl bg-white p-8 text-[#111] print:max-w-none print:rounded-none print:p-0">
      <style>{`@media print { header, nav, aside, .no-print { display:none !important } body { background:#fff } main { padding:0 !important } }`}</style>
      <div className="no-print mb-6 flex justify-end"><PrintButton /></div>
      <div className="flex items-center justify-between border-b pb-4">
        <div><div className="text-2xl font-bold">Отчёт о выполненных работах</div><div className="text-sm text-gray-600">{p.name} · период {period.label}</div></div>
        <Image src="/logo.webp" alt="" width={56} height={56} className="rounded-xl" />
      </div>
      <p className="mt-4 text-sm">Заказчик: <b>{client?.company_name}</b>{client?.contact_name ? `, ${client.contact_name}` : ""}. Исполнитель: SMM KADR.</p>
      <table className="mt-6 w-full border-collapse text-sm">
        <thead><tr className="border-b text-left"><th className="py-2">Вид работ</th><th>По договору</th><th>Подготовлено</th><th>Опубликовано</th><th>Остаток</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.kind} className="border-b"><td className="py-2">{CONTENT_KIND[r.kind]}</td><td>{r.planned}</td><td>{r.prepared}{r.overflow > 0 ? ` (+${r.overflow} сверх)` : ""}</td><td>{r.kind === "shoot" ? "—" : r.published}</td><td>{r.left_to_prepare}</td></tr>)}</tbody>
      </table>
      {debt > 0 && <p className="mt-3 text-sm">Остаток работ по периоду: <b>{debt}</b> ед. — переносится и выполняется отдельно, обязательство сохраняется.</p>}
      {(published ?? []).length > 0 && (
        <>
          <h3 className="mt-6 font-semibold">Публикации</h3>
          <ul className="mt-2 space-y-1 text-sm">{(published ?? []).map((c: { id: string; title: string; kind: string; placements: { platform: string; url: string; published_at: string }[] }) => (
            <li key={c.id}>{CONTENT_KIND[c.kind]} «{c.title}»: {c.placements.map((pl, i) => <span key={i}>{i > 0 ? ", " : ""}<a href={pl.url} className="underline">{PLATFORMS[pl.platform] ?? pl.platform}</a> ({date(pl.published_at)})</span>)}</li>
          ))}</ul>
        </>
      )}
      <div className="mt-10 border-t pt-6">
        <div className="text-lg font-semibold">Акт (черновик)</div>
        <p className="mt-2 text-sm">Исполнитель выполнил работы за период {period.label} в объёме, указанном выше{contract?.price_minor ? `, стоимостью ${money(contract.price_minor, contract.currency)}` : ""}. Заказчик претензий по объёму и срокам {debt > 0 ? "имеет в части остатка работ" : "не имеет"}.</p>
        <p className="mt-2 text-xs text-gray-500">Документ сформирован {date(new Date())}. Акт считается подписанным только после реального подтверждения сторонами.</p>
        <div className="mt-10 grid grid-cols-2 gap-8 text-sm"><div>Исполнитель: ____________</div><div>Заказчик: ____________</div></div>
      </div>
    </div>
  );
}
