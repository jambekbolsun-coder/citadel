import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActive } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge, ButtonLink, Card, PageHeader } from "@/components/ui";
import { ActionForm, Submit } from "@/components/action-form";
import { PROJECT_KIND, PROJECT_STATUS } from "@/lib/labels";
import { date } from "@/lib/format";
import { ClientFields } from "../client-fields";
import { updateClientAction } from "../actions";

export default async function ClientPage({ params }: PageProps<"/app/clients/[id]">) {
  const { id } = await params;
  const s = await requireActive(["clients.view", "clients.manage"]);
  const supabase = await createClient();
  const [{ data: c }, { data: projects }, { data: leads }] = await Promise.all([
    supabase.from("clients").select("*").eq("id", id).maybeSingle(),
    supabase.from("projects").select("id,name,kind,status,contract_start,contract_end").eq("client_id", id).order("created_at", { ascending: false }),
    supabase.from("leads").select("id,number,stage,created_at").eq("client_id", id),
  ]);
  if (!c) notFound();
  return (
    <>
      <PageHeader back="/app/clients" title={c.company_name} subtitle={[c.contact_name, c.phone, c.niche].filter(Boolean).join(" · ")}
        actions={s.can("projects.create") ? <ButtonLink href={`/app/projects/new?client=${id}`}>+ Новый проект</ButtonLink> : null} />
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card title="Проекты">
          {(projects ?? []).length === 0 ? <p className="text-sm text-muted">Проектов нет.</p> : (
            <ul className="divide-y divide-line">
              {(projects ?? []).map((p: { id: string; name: string; kind: string; status: string; contract_start: string | null; contract_end: string | null }) => (
                <li key={p.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <Link href={`/app/projects/${p.id}`} className="font-semibold hover:underline">{p.name}</Link>
                  <span className="flex items-center gap-2 text-xs text-muted">{PROJECT_KIND[p.kind]} · {date(p.contract_start)}–{date(p.contract_end)} <Badge status={p.status}>{PROJECT_STATUS[p.status]}</Badge></span>
                </li>
              ))}
            </ul>
          )}
          {(leads ?? []).length > 0 && <p className="mt-3 text-xs text-muted">Связанные заявки: {(leads ?? []).map((l: { id: string; number: number }) => <Link key={l.id} className="mr-2 text-primary" href={`/app/leads/${l.id}`}>№{l.number}</Link>)}</p>}
        </Card>
        {s.can("clients.manage") ? (
          <Card title="Карточка клиента">
            <ActionForm action={updateClientAction} className="space-y-3">
              <input type="hidden" name="id" value={id} />
              <ClientFields c={c} />
              <Submit>Сохранить</Submit>
            </ActionForm>
          </Card>
        ) : (
          <Card title="Карточка клиента"><p className="text-sm">{c.notes ?? "—"}</p></Card>
        )}
      </div>
    </>
  );
}
