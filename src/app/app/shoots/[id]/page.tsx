import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActive } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, Field, Notice, PageHeader } from "@/components/ui";
import { ActionForm, Submit } from "@/components/action-form";
import { PeopleSelect } from "@/components/people-select";
import { activePeople, nameOf } from "@/lib/data";
import { RESPONSE, SHOOT_ROLE } from "@/lib/labels";
import { dateTime, isoToLocalInput, time } from "@/lib/format";
import { SeriesCard } from "@/components/series-card";
import * as A from "../actions";

export default async function ShootPage({ params, searchParams }: PageProps<"/app/shoots/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const s = await requireActive();
  const supabase = await createClient();
  const { data: sh } = await supabase.from("shoots").select("*, projects(id,name,admin_id,manager_id,planning_director_id,creative_director_id)").eq("id", id).maybeSingle();
  if (!sh) notFound();
  const [people, { data: parts }, { data: hist }] = await Promise.all([
    activePeople(),
    supabase.from("shoot_participants").select("*").eq("shoot_id", id),
    supabase.from("shoot_history").select("*").eq("shoot_id", id).order("created_at", { ascending: false }),
  ]);
  const pr = sh.projects as { id: string; name: string; admin_id: string | null; manager_id: string | null; planning_director_id: string | null; creative_director_id: string | null };
  const participants = (parts ?? []) as { user_id: string; role: string; response: string; responded_at: string | null; decline_reason: string | null }[];
  const mine = participants.find((p) => p.user_id === s.userId);
  const mgr = s.can("shoots.manage") || s.can("projects.manage") || [pr.admin_id, pr.manager_id].includes(s.userId);
  const canTime = mgr || pr.planning_director_id === s.userId;
  const canTeam = mgr || pr.creative_director_id === s.userId;
  const mob = participants.filter((p) => p.role === "mobilographer");
  const amb = participants.filter((p) => p.role === "ambassador");
  const isMob = mine?.role === "mobilographer";

  return (
    <>
      <PageHeader back="/app/shoots" title={sh.title} subtitle={<><Link href={`/app/projects/${pr.id}?tab=shoots`} className="hover:underline">{pr.name}</Link> · {dateTime(sh.starts_at)}–{time(sh.ends_at)} · {sh.location ?? "место не указано"}</>}
        actions={<Badge status={sh.status === "planned" ? "pending" : sh.status === "done" ? "done" : "cancelled"}>{sh.status === "planned" ? "Запланирована" : sh.status === "done" ? "Проведена" : "Отменена"}</Badge>} />
      {sh.status === "cancelled" && <div className="mb-4"><Notice tone="bad">Отменена: {sh.cancel_reason}</Notice></div>}
      {sp.series === "created" && <div className="mb-4"><Notice tone="good">Серия съёмок создана. Назначьте участников с галочкой «на все будущие съёмки серии».</Notice></div>}
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          {mine && sh.status === "planned" && (
            <Card title="Ваше участие">
              <p className="mb-3 text-sm">Роль: <b>{SHOOT_ROLE[mine.role]}</b> · статус: <Badge status={mine.response}>{RESPONSE[mine.response]}</Badge></p>
              <div className="flex flex-wrap gap-2">
                <ActionForm action={A.respondShoot}><input type="hidden" name="id" value={id} /><input type="hidden" name="response" value="accepted" /><Submit>Подтверждаю</Submit></ActionForm>
                <ActionForm action={A.respondShoot} className="flex gap-2"><input type="hidden" name="id" value={id} /><input type="hidden" name="response" value="declined" /><input name="reason" required placeholder="Причина отказа" className="input" /><Submit variant="secondary">Не смогу</Submit></ActionForm>
              </div>
            </Card>
          )}
          <Card title="Состав">
            {(mob.length === 0 || (sh.ambassador_needed && amb.length === 0)) && <div className="mb-3"><Notice tone="warn">Команда не назначена: {mob.length === 0 ? "нет мобилографа" : ""}{mob.length === 0 && sh.ambassador_needed && amb.length === 0 ? ", " : ""}{sh.ambassador_needed && amb.length === 0 ? "нет амбассадора" : ""}</Notice></div>}
            <p className="mb-2 text-xs text-muted">Укомплектованность ≠ согласие: каждый участник подтверждает сам.</p>
            <ul className="divide-y divide-line">{participants.map((p) => (
              <li key={p.user_id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span><b>{nameOf(people, p.user_id)}</b> · {SHOOT_ROLE[p.role]}</span>
                <span className="flex items-center gap-2"><Badge status={p.response}>{RESPONSE[p.response]}</Badge>{p.decline_reason && <span className="text-xs text-bad">{p.decline_reason}</span>}
                  {canTeam && sh.status === "planned" && <ActionForm action={A.removeParticipant}><input type="hidden" name="id" value={id} /><input type="hidden" name="user_id" value={p.user_id} /><button className="text-xs text-bad">снять</button></ActionForm>}
                </span>
              </li>
            ))}</ul>
            {canTeam && sh.status === "planned" && (
              <ActionForm action={A.addParticipant} className="mt-3 grid gap-2 sm:grid-cols-[1fr_160px_auto]">
                <input type="hidden" name="id" value={id} />
                <PeopleSelect name="user_id" people={people} required empty="— сотрудник —" />
                <select name="role" className="input">{Object.entries(SHOOT_ROLE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                <Submit variant="secondary">Назначить</Submit>
                <label className="flex items-center gap-2 text-xs text-muted sm:col-span-3"><input type="checkbox" name="force" /> назначить несмотря на конфликт по времени</label>
                {sh.series_id && <label className="flex items-center gap-2 text-xs text-muted sm:col-span-3"><input type="checkbox" name="apply_series" defaultChecked={sp.series === "created"} /> на эту и все будущие съёмки серии</label>}
              </ActionForm>
            )}
          </Card>
          <Card title="ТЗ съёмки">
            {canTeam ? (
              <ActionForm action={A.updateShootBrief} className="grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="id" value={id} />
                <Field label="Место"><input name="location" defaultValue={sh.location ?? ""} className="input" /></Field>
                <Field label="Материалов"><input name="planned_items" type="number" defaultValue={sh.planned_items ?? ""} className="input" /></Field>
                <Field label="Темы и сценарии" className="sm:col-span-2"><textarea name="topics" defaultValue={sh.topics ?? ""} className="input" /></Field>
                <Field label="Заметки" className="sm:col-span-2"><textarea name="notes" defaultValue={sh.notes ?? ""} className="input" /></Field>
                <Field label="Оборудование / реквизит" className="sm:col-span-2"><input name="equipment" defaultValue={sh.equipment ?? ""} className="input" /></Field>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="ambassador_needed" defaultChecked={sh.ambassador_needed} /> Нужен амбассадор</label>
                <div><Submit variant="secondary">Сохранить</Submit></div>
              </ActionForm>
            ) : (
              <div className="space-y-2 text-sm"><p className="whitespace-pre-wrap">{sh.topics ?? "—"}</p><p className="whitespace-pre-wrap text-muted">{sh.notes}</p><p>{sh.equipment}</p></div>
            )}
          </Card>
        </div>
        <div className="space-y-4">
          {sh.series_id && <SeriesCard entity="shoot" id={id} seriesId={sh.series_id} from={sh.starts_at} canManage={canTime} />}
          {sh.status === "planned" && (isMob || mgr) && (
            <Card title="Отметить проведённой">
              <ActionForm action={A.completeShoot} className="space-y-2">
                <input type="hidden" name="id" value={id} />
                <Field label="Фактическое начало"><input name="actual_start" type="datetime-local" defaultValue={isoToLocalInput(sh.starts_at)} className="input" /></Field>
                <Field label="Фактическое окончание"><input name="actual_end" type="datetime-local" defaultValue={isoToLocalInput(sh.ends_at)} className="input" /></Field>
                <Field label="Ссылка на исходники *"><input name="sources_url" required className="input" placeholder="https://drive…" /></Field>
                <Submit className="w-full">Съёмка проведена</Submit>
              </ActionForm>
            </Card>
          )}
          {sh.status === "done" && <Card title="Итог"><p className="text-sm">Факт: {dateTime(sh.actual_start)}–{time(sh.actual_end)}</p>{sh.sources_url && <a className="text-sm text-primary underline" href={sh.sources_url} target="_blank" rel="noopener noreferrer">Исходники</a>}</Card>}
          {canTime && sh.status === "planned" && (
            <Card title="Перенос">
              <ActionForm action={A.rescheduleShoot} className="space-y-2">
                <input type="hidden" name="id" value={id} />
                <Field label="Начало"><input name="starts_at" type="datetime-local" required defaultValue={isoToLocalInput(sh.starts_at)} className="input" /></Field>
                <Field label="Окончание"><input name="ends_at" type="datetime-local" required defaultValue={isoToLocalInput(sh.ends_at)} className="input" /></Field>
                <Field label="Причина *"><input name="reason" required className="input" /></Field>
                <Submit variant="secondary" className="w-full">Перенести</Submit>
              </ActionForm>
              <ActionForm action={A.cancelShoot} confirm="Отменить съёмку?" className="mt-4 flex gap-2 border-t border-line pt-4">
                <input type="hidden" name="id" value={id} /><input name="reason" required placeholder="Причина отмены" className="input" /><Submit variant="danger">Отменить</Submit>
              </ActionForm>
            </Card>
          )}
          <Card title="История">
            <ol className="space-y-2 text-sm">{(hist ?? []).map((h: { id: number; kind: string; data: Record<string, string>; actor_id: string; created_at: string }) => (
              <li key={h.id} className="border-l-2 border-line pl-3">
                <b>{h.kind === "reschedule" ? `Перенос ${dateTime(h.data.from)} → ${dateTime(h.data.to)}` : h.kind === "cancel" ? "Отмена (серия)" : h.kind === "response" ? `Ответ: ${RESPONSE[h.data.response]}` : `Назначен ${nameOf(people, h.data.user)} (${SHOOT_ROLE[h.data.role]})${h.data.forced ? " — с конфликтом" : ""}`}</b>
                {h.data.reason && <div>{h.data.reason}</div>}
                <div className="text-xs text-muted">{dateTime(h.created_at)} · {nameOf(people, h.actor_id)}</div>
              </li>
            ))}</ol>
          </Card>
        </div>
      </div>
    </>
  );
}
