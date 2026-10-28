import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActive } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, Field, PageHeader } from "@/components/ui";
import { ActionForm, Submit } from "@/components/action-form";
import { activePeople, nameOf } from "@/lib/data";
import { CONTENT_KIND, CONTENT_STATUS, RESPONSE } from "@/lib/labels";
import { date, dateTime, localToIso, overdueText } from "@/lib/format";
import { saveCheck } from "../actions";

export default async function CheckPage({ params }: PageProps<"/app/checks/[id]">) {
  const { id } = await params;
  const s = await requireActive();
  const supabase = await createClient();
  const { data: c } = await supabase.from("project_admin_checks").select("*, projects(id,name)").eq("id", id).maybeSingle();
  if (!c) notFound();
  const pid = c.projects.id as string;
  const dayEnd = localToIso(c.day, "23:59"), dayStart = localToIso(c.day, "00:00");
  const [people, { data: due }, { data: stories }, { data: shoots }] = await Promise.all([
    activePeople(),
    supabase.from("content_items").select("id,title,kind,status,assignee_id,prep_due").eq("project_id", pid).not("status", "in", "(done,published,cancelled)").lte("prep_due", dayEnd).order("prep_due"),
    supabase.from("story_daily_plans").select("planned,actual,confirmed_at").eq("project_id", pid).eq("day", c.day),
    supabase.from("shoots").select("id,title,starts_at,shoot_participants(user_id,response)").eq("project_id", pid).eq("status", "planned").gte("starts_at", dayStart).lte("starts_at", new Date(new Date(dayEnd).getTime() + 2 * 86400_000).toISOString()),
  ]);
  const editable = c.admin_id === s.userId || s.can("projects.manage");
  const st = (stories ?? [])[0] as { planned: number; actual: number; confirmed_at: string | null } | undefined;
  const contacts = (c.contacts ?? []) as { with: string; channel: string; at: string; reason: string; result: string; promise: string; next: string }[];
  return (
    <>
      <PageHeader back="/app/checks" title={`Проверка: ${c.projects.name}`} subtitle={`${date(c.day)} · администратор ${nameOf(people, c.admin_id)} · срок ${dateTime(c.due_at)}`}
        actions={c.completed_at ? <Badge tone="good">Проведена {dateTime(c.completed_at)}</Badge> : overdueText(c.due_at) ? <Badge tone="bad">{overdueText(c.due_at)}</Badge> : <Badge>Ожидает</Badge>} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Материалы на сегодня и долги">
          {(due ?? []).length === 0 ? <p className="text-sm text-muted">Несданных материалов нет.</p> : (
            <ul className="divide-y divide-line">{(due ?? []).map((x: { id: string; title: string; kind: string; status: string; assignee_id: string | null; prep_due: string }) => (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <Link className="hover:underline" href={`/app/content/${x.id}`}>{CONTENT_KIND[x.kind]}: {x.title} · {nameOf(people, x.assignee_id)}</Link>
                {overdueText(x.prep_due) ? <Badge tone="bad">{overdueText(x.prep_due)}</Badge> : <Badge status={x.status}>{CONTENT_STATUS[x.status]}</Badge>}
              </li>
            ))}</ul>
          )}
          <div className="mt-3 text-sm">Сторис сегодня: {st ? <b>{st.actual} из {st.planned}{st.actual < st.planned ? ` — частично, осталось ${st.planned - st.actual}` : ""}</b> : "не запланированы"}</div>
          <div className="mt-3 text-sm">
            <div className="font-semibold">Ближайшие съёмки</div>
            {(shoots ?? []).length === 0 ? <span className="text-muted">нет</span> : (shoots ?? []).map((sh: { id: string; title: string; starts_at: string; shoot_participants: { user_id: string; response: string }[] }) => (
              <div key={sh.id}><Link className="text-primary" href={`/app/shoots/${sh.id}`}>{sh.title}</Link> · {dateTime(sh.starts_at)} · {sh.shoot_participants.map((p) => `${nameOf(people, p.user_id)}: ${RESPONSE[p.response]}`).join(", ") || "команда не назначена"}</div>
            ))}
          </div>
        </Card>
        <Card title="Итог проверки">
          {contacts.length > 0 && (
            <ul className="mb-3 space-y-2 text-sm">{contacts.map((k, i) => (
              <li key={i} className="rounded-xl bg-surface-2 p-2"><b>{k.with}</b> · {k.channel} · {dateTime(k.at)}<div>Причина: {k.reason} · Итог: {k.result}</div>{k.promise && <div>Обещание: {k.promise}</div>}{k.next && <div className="text-muted">Далее: {k.next}</div>}</li>
            ))}</ul>
          )}
          {editable ? (
            <ActionForm action={saveCheck} className="space-y-3">
              <input type="hidden" name="id" value={id} />
              <Field label="Статусы работников и итог дня"><textarea name="summary" defaultValue={c.summary ?? ""} className="input" /></Field>
              <Field label="Сторис: план/факт, комментарий"><input name="stories_note" defaultValue={c.stories_note ?? ""} className="input" /></Field>
              <Field label="Задержки и причины, обещанные сроки"><textarea name="delays" defaultValue={c.delays ?? ""} className="input" /></Field>
              <fieldset className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-2">
                <legend className="px-1 text-xs font-semibold text-muted">Добавить контакт с исполнителем/клиентом</legend>
                <input name="c_with" placeholder="С кем" className="input" /><input name="c_channel" placeholder="Канал (звонок, Telegram…)" className="input" />
                <input name="c_reason" placeholder="Причина" className="input" /><input name="c_result" placeholder="Итог" className="input" />
                <input name="c_promise" placeholder="Обещание / срок" className="input" /><input name="c_next" placeholder="Следующее действие" className="input" />
              </fieldset>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="escalated" defaultChecked={c.escalated} /> Эскалировать управляющему</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="complete" defaultChecked={!!c.completed_at} /> Проверка проведена</label>
              <Submit>Сохранить</Submit>
            </ActionForm>
          ) : <p className="whitespace-pre-wrap text-sm">{c.summary ?? "—"}</p>}
        </Card>
      </div>
    </>
  );
}
