import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActive } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, Field, PageHeader } from "@/components/ui";
import { ActionForm, Submit } from "@/components/action-form";
import { PeopleSelect } from "@/components/people-select";
import { activePeople, nameOf } from "@/lib/data";
import { PRIORITY, TASK_STATUS } from "@/lib/labels";
import { dateTime, isoToLocalInput, overdueText } from "@/lib/format";
import { rescheduleTask, transitionTask } from "../actions";

const NEXT: Record<string, string[]> = {
  todo: ["in_progress", "review", "done", "blocked", "cancelled"],
  in_progress: ["review", "done", "blocked", "cancelled"],
  review: ["done", "revision"],
  revision: ["in_progress", "review"],
  blocked: ["in_progress", "cancelled"],
  done: ["revision"],
  cancelled: [],
};

export default async function TaskPage({ params }: PageProps<"/app/tasks/[id]">) {
  const { id } = await params;
  const s = await requireActive();
  const supabase = await createClient();
  const { data: t } = await supabase.from("tasks").select("*, projects(id,name)").eq("id", id).maybeSingle();
  if (!t) notFound();
  const [people, { data: hist }] = await Promise.all([activePeople(), supabase.from("task_history").select("*").eq("task_id", id).order("created_at", { ascending: false })]);
  const canManage = s.can("tasks.manage") || t.created_by === s.userId;
  const over = !["done", "cancelled"].includes(t.status) ? overdueText(t.due_at) : null;
  return (
    <>
      <PageHeader back="/app/tasks" title={t.title} subtitle={t.projects ? <Link className="hover:underline" href={`/app/projects/${t.projects.id}`}>{t.projects.name}</Link> : "Без проекта"}
        actions={<><Badge status={t.status}>{TASK_STATUS[t.status]}</Badge>{over && <Badge tone="bad">{over}</Badge>}</>} />
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Card title="Описание">
            <p className="whitespace-pre-wrap text-sm">{t.description ?? "—"}</p>
            <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
              <dt className="text-muted">Исполнитель</dt><dd>{nameOf(people, t.assignee_id)}</dd>
              <dt className="text-muted">Проверяющий</dt><dd>{nameOf(people, t.reviewer_id)}</dd>
              <dt className="text-muted">Срок</dt><dd>{dateTime(t.due_at)}{t.original_due_at && <span className="text-muted"> (исходно {dateTime(t.original_due_at)})</span>}</dd>
              <dt className="text-muted">Приоритет</dt><dd>{PRIORITY[t.priority]}</dd>
              <dt className="text-muted">Поставил</dt><dd>{nameOf(people, t.created_by)}</dd>
              <dt className="text-muted">Результат</dt><dd className="whitespace-pre-wrap">{t.result_note ?? "—"}</dd>
            </dl>
          </Card>
          <Card title="История">
            <ol className="space-y-2 text-sm">{(hist ?? []).map((h: { id: number; kind: string; data: Record<string, string>; actor_id: string; created_at: string }) => (
              <li key={h.id} className="border-l-2 border-line pl-3">
                {h.kind === "status" ? <b>{TASK_STATUS[h.data.from]} → {TASK_STATUS[h.data.to]}</b> : <b>Перенос: {dateTime(h.data.from)} → {dateTime(h.data.to)}</b>}
                {(h.data.note || h.data.reason) && <div>{h.data.note ?? h.data.reason}</div>}
                <div className="text-xs text-muted">{dateTime(h.created_at)} · {nameOf(people, h.actor_id)}</div>
              </li>
            ))}</ol>
          </Card>
        </div>
        <div className="space-y-4">
          {(NEXT[t.status] ?? []).length > 0 && (
            <Card title="Изменить статус">
              <ActionForm action={transitionTask} className="space-y-2">
                <input type="hidden" name="id" value={id} />
                <select name="to" className="input">{NEXT[t.status].map((n) => <option key={n} value={n}>{TASK_STATUS[n]}</option>)}</select>
                <textarea name="result" placeholder="Результат (ссылка/описание) — обязателен для проверки и завершения" className="input" />
                <input name="note" placeholder="Причина (для доработки, блокировки, отмены)" className="input" />
                <Submit className="w-full">Применить</Submit>
              </ActionForm>
            </Card>
          )}
          {canManage && (
            <Card title="Перенос / переназначение">
              <ActionForm action={rescheduleTask} className="space-y-2">
                <input type="hidden" name="id" value={id} />
                <Field label="Новый срок"><input name="due_at" type="datetime-local" required defaultValue={isoToLocalInput(t.due_at)} className="input" /></Field>
                <Field label="Исполнитель"><PeopleSelect name="assignee_id" people={people} defaultValue={t.assignee_id} /></Field>
                <Field label="Причина *"><input name="reason" required className="input" /></Field>
                <Submit variant="secondary" className="w-full">Сохранить</Submit>
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
