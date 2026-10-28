import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActive } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, Field, PageHeader, ButtonLink } from "@/components/ui";
import { ActionForm, Submit } from "@/components/action-form";
import { PeopleSelect } from "@/components/people-select";
import { LEAD_STAGES } from "@/lib/labels";
import { dateTime, isoToLocalInput, minorToInput, money } from "@/lib/format";
import { activePeople, nameOf } from "@/lib/data";
import { addLeadEvent, convertLead, setStage, takeLead, updateLead } from "../actions";

const KIND: Record<string, string> = { created: "Заявка создана", stage: "Смена стадии", comment: "Комментарий", call: "Звонок/контакт", assign: "Взята в работу", opened: "Открыта", converted: "Создан клиент" };

export default async function LeadPage({ params }: PageProps<"/app/leads/[id]">) {
  const { id } = await params;
  const s = await requireActive(["leads.view", "leads.receive", "leads.manage"]);
  const supabase = await createClient();
  await supabase.rpc("lead_mark_opened", { p_lead: id });
  const [{ data: lead }, { data: events }, people, { data: tariffs }] = await Promise.all([
    supabase.from("leads").select("*").eq("id", id).maybeSingle(),
    supabase.from("lead_events").select("*").eq("lead_id", id).order("created_at", { ascending: false }),
    activePeople(),
    supabase.from("tariffs").select("id,name").is("archived_at", null).order("sort"),
  ]);
  if (!lead) notFound();
  const canEdit = s.can("leads.manage") || lead.assignee_id === s.userId;

  return (
    <>
      <PageHeader
        back="/app/leads"
        title={`Заявка №${lead.number}: ${lead.name}`}
        subtitle={<>Источник: {lead.source} · {dateTime(lead.created_at)} {lead.utm?.utm_source ? `· UTM ${lead.utm.utm_source}` : ""}</>}
        actions={<Badge status={lead.stage}>{LEAD_STAGES[lead.stage]}</Badge>}
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Card title="Контакт">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-muted">Телефон</dt><dd><a className="font-semibold text-primary" href={`tel:${lead.phone}`}>{lead.phone}</a></dd></div>
              <div><dt className="text-muted">Email</dt><dd>{lead.email ?? "—"}</dd></div>
              <div><dt className="text-muted">Бизнес / ниша</dt><dd>{lead.business ?? "—"}</dd></div>
              <div><dt className="text-muted">Услуга</dt><dd>{lead.service ?? "—"}</dd></div>
              <div><dt className="text-muted">Удобное время</dt><dd>{lead.preferred_time ?? "—"}</dd></div>
              <div><dt className="text-muted">Менеджер</dt><dd>{nameOf(people, lead.assignee_id)}</dd></div>
              <div><dt className="text-muted">Первое открытие</dt><dd>{lead.first_opened_at ? `${dateTime(lead.first_opened_at)} · ${nameOf(people, lead.first_opened_by)}` : "—"}</dd></div>
              <div><dt className="text-muted">Взята / первый ответ</dt><dd>{dateTime(lead.taken_at)} / {dateTime(lead.first_response_at)}</dd></div>
            </dl>
            {lead.comment && <p className="mt-3 rounded-xl bg-surface-2 p-3 text-sm">{lead.comment}</p>}
            {!lead.assignee_id && (
              <ActionForm action={takeLead} className="mt-3">
                <input type="hidden" name="id" value={id} />
                <Submit>Взять в работу</Submit>
              </ActionForm>
            )}
          </Card>

          <Card title="История">
            {canEdit && (
              <ActionForm action={addLeadEvent} reset className="mb-4 flex flex-col gap-2 sm:flex-row">
                <input type="hidden" name="id" value={id} />
                <select name="kind" className="input sm:w-44"><option value="comment">Комментарий</option><option value="call">Звонок/контакт</option></select>
                <input name="body" required placeholder="Что произошло, итог, следующее действие" className="input" />
                <Submit>Добавить</Submit>
              </ActionForm>
            )}
            <ol className="space-y-3">
              {(events ?? []).map((e: { id: number; kind: string; actor_id: string | null; data: Record<string, string> | null; created_at: string }) => (
                <li key={e.id} className="border-l-2 border-line pl-3 text-sm">
                  <div className="font-semibold">{KIND[e.kind] ?? e.kind}{e.kind === "stage" && e.data ? `: ${LEAD_STAGES[e.data.from]} → ${LEAD_STAGES[e.data.to]}` : ""}</div>
                  {e.data?.text && <div>{e.data.text}</div>}
                  {e.data?.note && <div className="text-muted">{e.data.note}</div>}
                  <div className="text-xs text-muted">{dateTime(e.created_at)} · {nameOf(people, e.actor_id) === "—" ? "система" : nameOf(people, e.actor_id)}</div>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-4">
          {canEdit && (
            <Card title="Стадия воронки">
              <ActionForm action={setStage} className="space-y-3">
                <input type="hidden" name="id" value={id} />
                <select name="stage" defaultValue={lead.stage} className="input">
                  {Object.entries(LEAD_STAGES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <input name="note" placeholder="Комментарий (для «Проиграна» — причина обязательна)" className="input" />
                <Submit className="w-full">Изменить стадию</Submit>
              </ActionForm>
            </Card>
          )}
          {canEdit && (
            <Card title="Карточка сделки">
              <ActionForm action={updateLead} className="space-y-3">
                <input type="hidden" name="id" value={id} />
                <Field label="Бизнес"><input name="business" defaultValue={lead.business ?? ""} className="input" /></Field>
                <Field label="Email"><input name="email" type="email" defaultValue={lead.email ?? ""} className="input" /></Field>
                <Field label="Тариф">
                  <select name="tariff_id" defaultValue={lead.tariff_id ?? ""} className="input">
                    <option value="">—</option>
                    {(tariffs ?? []).map((t: { id: string; name: string }) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </Field>
                <Field label="Ожидаемая сумма, сом"><input name="expected" inputMode="decimal" defaultValue={minorToInput(lead.expected_minor)} className="input" /></Field>
                <Field label="Следующее действие"><input name="next_action" defaultValue={lead.next_action ?? ""} className="input" /></Field>
                <Field label="Когда"><input name="next_action_at" type="datetime-local" defaultValue={isoToLocalInput(lead.next_action_at)} className="input" /></Field>
                {s.can("leads.manage") && <Field label="Менеджер"><PeopleSelect name="assignee_id" people={people} defaultValue={lead.assignee_id} /></Field>}
                {!s.can("leads.manage") && <input type="hidden" name="assignee_id" value={lead.assignee_id ?? ""} />}
                <Submit className="w-full">Сохранить</Submit>
              </ActionForm>
              {lead.expected_minor ? <p className="mt-2 text-xs text-muted">Ожидаемо: {money(lead.expected_minor)}</p> : null}
              {lead.lost_reason && <p className="mt-2 text-sm text-bad">Причина отказа: {lead.lost_reason}</p>}
            </Card>
          )}
          {s.can("clients.manage") && (
            <Card title="Клиент и проект">
              {lead.client_id ? (
                <div className="space-y-2 text-sm">
                  <Link className="text-primary" href={`/app/clients/${lead.client_id}`}>Открыть карточку клиента →</Link>
                  {s.can("projects.create") && <ButtonLink href={`/app/projects/new?client=${lead.client_id}&lead=${id}`} className="w-full">Создать проект</ButtonLink>}
                </div>
              ) : (
                <ActionForm action={convertLead} className="space-y-3">
                  <input type="hidden" name="id" value={id} />
                  <Field label="Название компании"><input name="company" defaultValue={lead.business ?? ""} className="input" /></Field>
                  <Submit className="w-full">Конвертировать в клиента</Submit>
                  <p className="text-xs text-muted">Если клиент с этим телефоном уже есть, новая запись не создаётся.</p>
                </ActionForm>
              )}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
