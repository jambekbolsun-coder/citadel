import Link from "next/link";
import { MessageCircle, Phone, Search } from "lucide-react";
import { requireActive } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge, ButtonLink, Card, Empty, PageHeader, Pager } from "@/components/ui";
import { ActionForm, Submit } from "@/components/action-form";
import { pageRange } from "@/lib/paging";
import { date } from "@/lib/format";
import { PROJECT_STATUS } from "@/lib/labels";
import { formatPhone, waLink } from "@/lib/phone";
import { ClientFields } from "./client-fields";
import { createClientAction } from "./actions";

export const metadata = { title: "База клиентов" };

const ACTIVE = ["in_progress", "awaiting_client", "final_review", "ready_for_handoff"];
const OPEN = ["draft", "on_approval", "awaiting_payment"];
type Row = { id: string; company_name: string; contact_name: string | null; phone: string | null; whatsapp: string | null; niche: string | null; created_at: string; manager: { full_name: string } | null; projects: { id: string; name: string; status: string; created_at: string }[] };

export default async function Clients({ searchParams }: PageProps<"/app/clients">) {
  const sp = await searchParams;
  const s = await requireActive(["clients.view", "clients.manage"]);
  const supabase = await createClient();
  const q = typeof sp.q === "string" ? sp.q.replace(/[%,()*\\]/g, "").trim().slice(0, 80) : "";
  const niche = typeof sp.niche === "string" ? sp.niche.replace(/[%,()*\\]/g, "").slice(0, 60) : "";
  const st = typeof sp.status === "string" && ["active", "open", "none"].includes(sp.status) ? sp.status : "";
  const { from, to, page } = pageRange(Number(sp.page));

  const projSel = st === "active" || st === "open" ? "projects!inner(id,name,status,created_at)" : "projects(id,name,status,created_at)";
  let query = supabase
    .from("clients")
    .select(`id,company_name,contact_name,phone,whatsapp,niche,created_at,manager:profiles!clients_manager_id_fkey(full_name),${projSel}`)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .range(from, to);
  if (q) {
    // телефон ищем по цифрам без кода страны/ведущего нуля: «0555 12» найдёт +996 555 12…
    const digits = q.replace(/\D/g, "").replace(/^996/, "").replace(/^0/, "");
    const ors = [`company_name.ilike.%${q}%`, `contact_name.ilike.%${q}%`, `niche.ilike.%${q}%`];
    if (digits.length >= 3) ors.push(`phone.ilike.%${digits}%`, `whatsapp.ilike.%${digits}%`);
    query = query.or(ors.join(","));
  }
  if (niche) query = query.ilike("niche", niche);
  if (st === "active") query = query.in("projects.status", ACTIVE);
  if (st === "open") query = query.in("projects.status", OPEN);
  const [{ data, error }, { data: nicheRows }] = await Promise.all([query, supabase.from("clients").select("niche").is("archived_at", null).not("niche", "is", null).limit(500)]);
  let rows = (data ?? []) as unknown as Row[];
  if (st === "none") rows = rows.filter((r) => r.projects.length === 0);
  const niches = [...new Set(((nicheRows ?? []) as { niche: string }[]).map((r) => r.niche.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru"));
  const base = `/app/clients?q=${encodeURIComponent(q)}&niche=${encodeURIComponent(niche)}&status=${st}`;

  return (
    <>
      <PageHeader
        title="База клиентов"
        subtitle="Пополняется автоматически: новый клиент появляется здесь при создании проекта"
        actions={s.can("projects.create") ? <ButtonLink href="/app/projects/new">+ Добавить проект</ButtonLink> : null}
      />
      <form className="mb-3 grid gap-2 sm:grid-cols-[1fr_180px_180px_auto]" role="search">
        <div className="relative">
          <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input name="q" defaultValue={q} placeholder="ФИО, телефон, компания, ниша" className="input pl-10!" inputMode="search" aria-label="Поиск клиентов" />
        </div>
        <select name="niche" defaultValue={niche} className="input" aria-label="Ниша">
          <option value="">Все ниши</option>
          {niches.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <select name="status" defaultValue={st} className="input" aria-label="Проекты">
          <option value="">Все клиенты</option>
          <option value="active">С проектом в работе</option>
          <option value="open">С новым / ждущим оплаты</option>
          <option value="none">Без проектов</option>
        </select>
        <button className="min-h-11 rounded-xl bg-surface-2 px-4 text-sm font-semibold ring-1 ring-line">Найти</button>
      </form>

      {error ? (
        <Empty title="Не удалось загрузить базу клиентов" text={error.message} />
      ) : rows.length === 0 ? (
        <Empty title={q || niche || st ? "Ничего не найдено" : "Клиентов пока нет"} text={q || niche || st ? "Измените условия поиска." : "Клиенты появятся здесь автоматически, когда вы добавите первый проект."} />
      ) : (
        <>
          {/* телефон: компактные карточки */}
          <ul className="space-y-2 md:hidden">
            {rows.slice(0, 30).map((c) => <ClientCard key={c.id} c={c} />)}
          </ul>
          {/* ноутбук: таблица */}
          <Card className="hidden p-0 md:block md:p-0">
            <table className="tbl">
              <thead><tr><th>Клиент</th><th>Контакт</th><th>Ниша</th><th>Проекты</th><th>Ответственный</th><th>С нами с</th></tr></thead>
              <tbody>
                {rows.slice(0, 30).map((c) => {
                  const latest = [...c.projects].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
                  return (
                    <tr key={c.id}>
                      <td><Link href={`/app/clients/${c.id}`} className="font-semibold hover:underline">{c.company_name}</Link></td>
                      <td className="text-sm">{c.contact_name ?? "—"}<div className="text-xs text-muted">{formatPhone(c.phone)}</div></td>
                      <td className="text-sm">{c.niche ?? "—"}</td>
                      <td className="text-sm">
                        {c.projects.length === 0 ? <span className="text-muted">нет</span> : <>
                          {c.projects.filter((p) => ACTIVE.includes(p.status)).length} в работе / {c.projects.length}
                          {latest && <div className="mt-0.5"><Badge status={latest.status}>{PROJECT_STATUS[latest.status] ?? latest.status}</Badge></div>}
                        </>}
                      </td>
                      <td className="text-sm">{c.manager?.full_name ?? "—"}</td>
                      <td className="text-xs text-muted">{date(c.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </>
      )}
      <Pager page={page} hasMore={rows.length > 30} base={base} />

      {s.can("clients.manage") && (
        <details className="mt-6 rounded-2xl border border-line bg-surface" id="new">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Добавить клиента вручную, без проекта (исключение)</summary>
          <div className="border-t border-line p-4">
            <p className="mb-3 text-sm text-muted">Обычно клиент создаётся в мастере «Добавить проект». Здесь — например, для будущего клиента без договора. Дубли по телефону не допускаются.</p>
            <ActionForm action={createClientAction} className="space-y-3">
              <ClientFields />
              <Submit>Добавить в базу</Submit>
            </ActionForm>
          </div>
        </details>
      )}
    </>
  );
}

function ClientCard({ c }: { c: Row }) {
  const latest = [...c.projects].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const wa = waLink(c.whatsapp ?? c.phone);
  return (
    <li className="rounded-2xl border border-line bg-surface">
      <Link href={`/app/clients/${c.id}`} className="block p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate font-semibold">{c.company_name}</div>
            <div className="truncate text-sm text-muted">{[c.contact_name, c.niche].filter(Boolean).join(" · ") || "—"}</div>
          </div>
          {latest && <Badge status={latest.status}>{PROJECT_STATUS[latest.status] ?? latest.status}</Badge>}
        </div>
        <div className="mt-2 text-xs text-muted">Проектов: {c.projects.length}{c.manager ? ` · ${c.manager.full_name}` : ""} · с {date(c.created_at)}</div>
      </Link>
      {(c.phone || wa) && (
        <div className="flex border-t border-line">
          {c.phone && <a href={`tel:${c.phone}`} className="flex min-h-11 flex-1 items-center justify-center gap-2 text-sm font-semibold text-primary"><Phone size={16} /> {formatPhone(c.phone)}</a>}
          {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="flex min-h-11 w-28 items-center justify-center gap-2 border-l border-line text-sm font-semibold text-primary"><MessageCircle size={16} /> WhatsApp</a>}
        </div>
      )}
    </li>
  );
}
