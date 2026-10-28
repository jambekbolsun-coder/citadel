import Link from "next/link";
import { requireActive } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, Empty, PageHeader, Pager, Field } from "@/components/ui";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { ActionForm, Submit } from "@/components/action-form";
import { LEAD_STAGES } from "@/lib/labels";
import { dateTime } from "@/lib/format";
import { activePeople, nameOf, pageRange } from "@/lib/data";
import { createManualLead, takeLead } from "./actions";

export const metadata = { title: "Заявки и продажи" };

export default async function Leads({ searchParams }: PageProps<"/app/leads">) {
  const sp = await searchParams;
  const s = await requireActive(["leads.view", "leads.receive", "leads.manage"]);
  const supabase = await createClient();
  const stage = typeof sp.stage === "string" ? sp.stage : "";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const mine = sp.mine === "1";
  const { from, to, page } = pageRange(Number(sp.page));
  let query = supabase.from("leads").select("id,number,name,phone,business,service,stage,assignee_id,created_at,source,first_opened_at,escalated_at").order("created_at", { ascending: false }).range(from, to);
  if (stage) query = query.eq("stage", stage);
  else query = query.not("stage", "in", "(won,lost)");
  if (mine) query = query.eq("assignee_id", s.userId);
  if (q) query = query.or(`name.ilike.%${q.replace(/[%,()]/g, "")}%,phone.ilike.%${q.replace(/[%,()]/g, "")}%,business.ilike.%${q.replace(/[%,()]/g, "")}%`);
  const [{ data: leads }, people, { data: counts }] = await Promise.all([query, activePeople(), supabase.from("leads").select("stage")]);
  const byStage: Record<string, number> = {};
  (counts ?? []).forEach((c: { stage: string }) => (byStage[c.stage] = (byStage[c.stage] ?? 0) + 1));
  const rows = (leads ?? []) as { id: string; number: number; name: string; phone: string; business: string | null; service: string | null; stage: string; assignee_id: string | null; created_at: string; source: string; first_opened_at: string | null; escalated_at: string | null }[];
  const base = `/app/leads?stage=${stage}&q=${encodeURIComponent(q)}${mine ? "&mine=1" : ""}`;

  return (
    <>
      <RealtimeRefresh table="leads" />
      <PageHeader title="Заявки и продажи" subtitle="Новые заявки с сайта появляются здесь сразу, без перезагрузки" />
      <div className="scroll-x mb-4">
        <div className="flex gap-2">
          <Link href="/app/leads" className={`rounded-xl px-3 py-1.5 text-sm ${!stage ? "bg-surface ring-1 ring-line font-semibold" : "text-muted"}`}>Активные</Link>
          {Object.entries(LEAD_STAGES).map(([k, v]) => (
            <Link key={k} href={`/app/leads?stage=${k}`} className={`whitespace-nowrap rounded-xl px-3 py-1.5 text-sm ${stage === k ? "bg-surface ring-1 ring-line font-semibold" : "text-muted"}`}>
              {v} <span className="text-muted">{byStage[k] ?? 0}</span>
            </Link>
          ))}
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div>
          <form className="mb-3 flex gap-2">
            <input name="q" defaultValue={q} placeholder="Поиск: имя, телефон, бизнес" className="input" />
            {stage && <input type="hidden" name="stage" value={stage} />}
            <label className="flex items-center gap-1 whitespace-nowrap text-sm"><input type="checkbox" name="mine" value="1" defaultChecked={mine} /> Мои</label>
            <button className="rounded-xl bg-surface-2 px-4 text-sm font-semibold ring-1 ring-line">Найти</button>
          </form>
          {rows.length === 0 ? (
            <Empty title="Заявок нет" text="Когда клиент оставит заявку на сайте, она появится здесь, а ответственные получат уведомление." />
          ) : (
            <Card className="p-0 md:p-0">
              <div className="scroll-x">
                <table className="tbl">
                  <thead><tr><th>№</th><th>Клиент</th><th>Услуга</th><th>Стадия</th><th>Менеджер</th><th>Создана</th><th /></tr></thead>
                  <tbody>
                    {rows.slice(0, 30).map((l) => (
                      <tr key={l.id}>
                        <td className="text-muted">{l.number}</td>
                        <td>
                          <Link href={`/app/leads/${l.id}`} className="font-semibold hover:underline">{l.name}</Link>
                          <div className="text-xs text-muted">{l.phone}{l.business ? ` · ${l.business}` : ""}</div>
                        </td>
                        <td className="text-sm">{l.service ?? "—"}</td>
                        <td>
                          <Badge status={l.stage}>{LEAD_STAGES[l.stage]}</Badge>
                          {l.stage === "new" && !l.first_opened_at && <div className="mt-1 text-xs text-brand">не открыта</div>}
                          {l.escalated_at && l.stage === "new" && <div className="mt-1 text-xs text-bad">эскалация</div>}
                        </td>
                        <td className="text-sm">{nameOf(people, l.assignee_id)}</td>
                        <td className="whitespace-nowrap text-xs text-muted">{dateTime(l.created_at)}</td>
                        <td>
                          {!l.assignee_id && (
                            <ActionForm action={takeLead}>
                              <input type="hidden" name="id" value={l.id} />
                              <Submit variant="secondary" className="min-h-[32px] px-3 text-xs">Взять</Submit>
                            </ActionForm>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
          <Pager page={page} hasMore={rows.length > 30} base={base} />
        </div>
        <Card title="Добавить заявку вручную">
          <ActionForm action={createManualLead} className="space-y-3">
            <Field label="Имя *"><input name="name" required className="input" /></Field>
            <Field label="Телефон *"><input name="phone" required className="input" /></Field>
            <Field label="Бизнес"><input name="business" className="input" /></Field>
            <Field label="Услуга"><input name="service" className="input" /></Field>
            <Field label="Источник">
              <select name="source" className="input"><option value="manual">Вручную</option><option value="phone">Звонок</option><option value="instagram">Instagram</option><option value="referral">Рекомендация</option></select>
            </Field>
            <Field label="Комментарий"><textarea name="comment" className="input" /></Field>
            <Submit className="w-full">Создать</Submit>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
