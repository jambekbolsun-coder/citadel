import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageCircle, Phone } from "lucide-react";
import { requireActive } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge, ButtonLink, Card, LoadError, PageHeader } from "@/components/ui";
import { ActionForm, Submit } from "@/components/action-form";
import { LEAD_STAGES, PROJECT_KIND, PROJECT_STATUS } from "@/lib/labels";
import { date, dateTime } from "@/lib/format";
import { formatPhone, waLink } from "@/lib/phone";
import { ClientFields } from "../client-fields";
import { updateClientAction } from "../actions";

export const metadata = { title: "Клиент" };

type P = { id: string; name: string; kind: string; status: string; niche: string | null; contract_start: string | null; contract_end: string | null; created_at: string; launched_at: string | null };

export default async function ClientPage({ params }: PageProps<"/app/clients/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const s = await requireActive(["clients.view", "clients.manage"]);
  const supabase = await createClient();
  const [{ data: c, error }, { data: projects }, { data: leads }] = await Promise.all([
    supabase.from("clients").select("*, manager:profiles!clients_manager_id_fkey(full_name)").eq("id", id).maybeSingle(),
    supabase.from("projects").select("id,name,kind,status,niche,contract_start,contract_end,created_at,launched_at").eq("client_id", id).order("created_at", { ascending: false }),
    supabase.from("leads").select("id,number,stage,service,created_at").eq("client_id", id).order("created_at", { ascending: false }),
  ]);
  if (error) return <LoadError title="Не удалось открыть клиента" text={error.message} back="/app/clients" />;
  if (!c) notFound();
  const list = (projects ?? []) as P[];
  const socials = Object.entries((c.socials ?? {}) as Record<string, string>).filter(([, v]) => v);
  const wa = waLink(c.whatsapp ?? c.phone);
  const lastTouch = [c.updated_at, ...list.map((p) => p.created_at), ...((leads ?? []) as { created_at: string }[]).map((l) => l.created_at)].filter(Boolean).sort().at(-1);

  return (
    <>
      <PageHeader back="/app/clients" title={c.company_name} subtitle={[c.contact_name, c.niche].filter(Boolean).join(" · ")}
        actions={s.can("projects.create") ? <ButtonLink href={`/app/projects/new?client=${id}`}>+ Новый проект</ButtonLink> : null} />
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-4">
          <Card title="Контакты">
            <div className="flex flex-wrap gap-2">
              {c.phone && <a href={`tel:${c.phone}`} className="flex min-h-11 items-center gap-2 rounded-xl bg-surface-2 px-4 text-sm font-semibold"><Phone size={16} /> {formatPhone(c.phone)}</a>}
              {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center gap-2 rounded-xl bg-surface-2 px-4 text-sm font-semibold"><MessageCircle size={16} /> WhatsApp{c.whatsapp && c.whatsapp !== c.phone ? ` ${formatPhone(c.whatsapp)}` : ""}</a>}
            </div>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-muted">Ответственный</dt><dd>{(c.manager as { full_name: string } | null)?.full_name ?? "—"}</dd>
              {c.email && <><dt className="text-muted">Email</dt><dd>{c.email}</dd></>}
              {c.address && <><dt className="text-muted">Адрес</dt><dd>{c.address}</dd></>}
              {c.source && <><dt className="text-muted">Источник</dt><dd>{c.source}</dd></>}
              {socials.map(([k, v]) => <Fragment key={k}><dt className="text-muted capitalize">{k}</dt><dd className="break-all">{v}</dd></Fragment>)}
              <dt className="text-muted">В базе с</dt><dd>{date(c.created_at)}</dd>
              {lastTouch && <><dt className="text-muted">Последнее взаимодействие</dt><dd>{dateTime(lastTouch)}</dd></>}
            </dl>
          </Card>
          <Card title={`Проекты · ${list.length}`}>
            {list.length === 0 ? <p className="text-sm text-muted">Проектов нет.</p> : (
              <ul className="divide-y divide-line">
                {list.map((p) => (
                  <li key={p.id} className="py-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link href={`/app/projects/${p.id}`} className="font-semibold hover:underline">{p.name}</Link>
                      <Badge status={p.status}>{PROJECT_STATUS[p.status] ?? p.status}</Badge>
                    </div>
                    <div className="mt-0.5 text-xs text-muted">{[PROJECT_KIND[p.kind], p.niche, p.contract_start && `договор ${date(p.contract_start)}${p.contract_end ? `–${date(p.contract_end)}` : ""}`, p.launched_at ? `в работе с ${date(p.launched_at)}` : `создан ${date(p.created_at)}`].filter(Boolean).join(" · ")}</div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {(leads ?? []).length > 0 && (
            <Card title="Заявки">
              <ul className="space-y-1 text-sm">
                {(leads ?? []).map((l: { id: string; number: number; stage: string; service: string | null; created_at: string }) => (
                  <li key={l.id} className="flex flex-wrap items-center justify-between gap-2">
                    <Link className="text-primary" href={`/app/leads/${l.id}`}>№{l.number}{l.service ? ` · ${l.service}` : ""}</Link>
                    <span className="text-xs text-muted">{LEAD_STAGES[l.stage] ?? l.stage} · {date(l.created_at)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
        {s.can("clients.manage") ? (
          <Card title="Карточка клиента">
            <ActionForm action={updateClientAction} className="space-y-3">
              <input type="hidden" name="id" value={id} />
              <ClientFields c={c} />
              <Submit>Сохранить</Submit>
            </ActionForm>
          </Card>
        ) : (
          <Card title="Заметки"><p className="whitespace-pre-line text-sm">{c.notes ?? "—"}</p></Card>
        )}
      </div>
    </>
  );
}
