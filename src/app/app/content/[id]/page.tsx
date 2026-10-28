import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActive } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, Field, Notice, PageHeader } from "@/components/ui";
import { ActionForm, Submit } from "@/components/action-form";
import { PeopleSelect } from "@/components/people-select";
import { activePeople, nameOf } from "@/lib/data";
import { CONTENT_KIND, CONTENT_NEXT, CONTENT_STATUS, PLATFORMS } from "@/lib/labels";
import { dateTime, isoToLocalInput, overdueText } from "@/lib/format";
import { addComment } from "@/app/app/projects/actions";
import { addPlacement, assignContent, checkPlacement, saveContentDetails, transitionContent } from "../actions";

export default async function ContentPage({ params }: PageProps<"/app/content/[id]">) {
  const { id } = await params;
  const s = await requireActive();
  const supabase = await createClient();
  const { data: c } = await supabase.from("content_items").select("*, projects(id,name,admin_id,manager_id,requires_publication,platforms)").eq("id", id).maybeSingle();
  if (!c) notFound();
  const [people, { data: hist }, { data: pls }, { data: comments }] = await Promise.all([
    activePeople(),
    supabase.from("content_history").select("*").eq("content_id", id).order("created_at", { ascending: false }),
    supabase.from("placements").select("*").eq("content_id", id).order("published_at"),
    supabase.from("comments").select("*").eq("entity_type", "content").eq("entity_id", id).order("created_at"),
  ]);
  const proj = c.projects as { id: string; name: string; admin_id: string | null; manager_id: string | null; requires_publication: boolean; platforms: string[] };
  const isMgr = s.can("projects.manage") || s.can("content.manage") || proj.admin_id === s.userId || proj.manager_id === s.userId;
  const isExec = c.assignee_id === s.userId;
  const isRev = c.reviewer_id === s.userId || isMgr;
  const next = (CONTENT_NEXT[c.status] ?? []).filter(() => (c.status === "review" ? isRev : true)).filter((n) => n !== "published" || proj.requires_publication);
  const dueOver = !["done", "published", "cancelled"].includes(c.status) ? overdueText(c.status === "review" ? c.review_due : c.prep_due) : null;
  const placements = (pls ?? []) as { id: string; platform: string; url: string; published_at: string; checked_at: string | null; checked_by: string | null; created_by: string }[];

  return (
    <>
      <PageHeader back={`/app/projects/${proj.id}?tab=content`} title={`${CONTENT_KIND[c.kind]}: ${c.title}`}
        subtitle={<><Link className="hover:underline" href={`/app/projects/${proj.id}`}>{proj.name}</Link> · версия {c.version}</>}
        actions={<><Badge status={c.status}>{CONTENT_STATUS[c.status]}</Badge>{dueOver && <Badge tone="bad">{dueOver}</Badge>}</>} />
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <Card title="ТЗ и сценарий">
            {c.brief ? <p className="whitespace-pre-wrap rounded-xl bg-surface-2 p-3 text-sm">{c.brief}</p> : <Notice tone="warn">ТЗ не заполнено — исполнителя назначить нельзя.</Notice>}
            {(isMgr || isExec) ? (
              <ActionForm action={saveContentDetails} className="mt-4 grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="id" value={id} />
                <Field label="Название / тема"><input name="title" defaultValue={c.title} className="input" /></Field>
                <Field label="Формат"><input name="format" defaultValue={c.format ?? ""} placeholder="Reels 30 сек, 9:16" className="input" /></Field>
                <Field label="Цель" className="sm:col-span-2"><input name="goal" defaultValue={c.goal ?? ""} className="input" /></Field>
                <Field label="Сценарий / текст" className="sm:col-span-2"><textarea name="script" defaultValue={c.script ?? ""} className="input min-h-[140px]" /></Field>
                <Field label="Ссылки и референсы" className="sm:col-span-2"><textarea name="links" defaultValue={c.links ?? ""} className="input" /></Field>
                {c.kind === "carousel" && (
                  <Field label="Слайды карусели (по строке на слайд)" className="sm:col-span-2" hint="Вся карусель = 1 материал">
                    <textarea name="slides" defaultValue={((c.slides ?? []) as { spec: string }[]).map((x) => x.spec).join("\n")} className="input min-h-[120px]" />
                  </Field>
                )}
                <div className="sm:col-span-2"><Submit variant="secondary">Сохранить</Submit></div>
              </ActionForm>
            ) : (
              <div className="mt-3 space-y-2 text-sm">{c.script && <p className="whitespace-pre-wrap">{c.script}</p>}{c.links && <p className="whitespace-pre-wrap text-muted">{c.links}</p>}</div>
            )}
          </Card>

          {proj.requires_publication && (
            <Card title="Размещения">
              <p className="mb-3 text-xs text-muted">Один ролик на двух площадках = 1 произведённый материал и 2 размещения. Для отметки «выложено» нужна ссылка; затем администратор проверяет публикацию.</p>
              {placements.length === 0 ? <p className="text-sm text-muted">Размещений нет.</p> : (
                <ul className="divide-y divide-line">{placements.map((pl) => (
                  <li key={pl.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <span><b>{PLATFORMS[pl.platform] ?? pl.platform}</b> · <a href={pl.url} target="_blank" rel="noopener noreferrer" className="text-primary underline">ссылка</a> · {dateTime(pl.published_at)}</span>
                    {pl.checked_at ? <Badge tone="good">Проверено · {nameOf(people, pl.checked_by)}</Badge> : isMgr ? (
                      <ActionForm action={checkPlacement}><input type="hidden" name="id" value={id} /><input type="hidden" name="placement_id" value={pl.id} /><Submit variant="secondary" className="min-h-[32px] px-3 text-xs">Проверить</Submit></ActionForm>
                    ) : <Badge tone="warn">Ждёт проверки</Badge>}
                  </li>
                ))}</ul>
              )}
              {(isMgr || isExec || s.can("content.publish")) && ["done", "published"].includes(c.status) && (
                <ActionForm action={addPlacement} reset className="mt-3 grid gap-2 sm:grid-cols-4">
                  <input type="hidden" name="id" value={id} />
                  <select name="platform" className="input">{Object.entries(PLATFORMS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                  <input name="url" required placeholder="https://…" className="input sm:col-span-2" />
                  <input name="published_at" type="datetime-local" className="input" />
                  <Submit variant="secondary">Добавить размещение</Submit>
                </ActionForm>
              )}
            </Card>
          )}

          <Card title="Комментарии">
            <ul className="space-y-2">{(comments ?? []).map((m: { id: string; author_id: string; body: string; created_at: string }) => (
              <li key={m.id} className="rounded-xl bg-surface-2 p-3 text-sm"><div className="text-xs text-muted">{nameOf(people, m.author_id)} · {dateTime(m.created_at)}</div>{m.body}</li>
            ))}</ul>
            <ActionForm action={addComment} reset className="mt-3 flex gap-2">
              <input type="hidden" name="entity_type" value="content" /><input type="hidden" name="entity_id" value={id} /><input type="hidden" name="project_id" value={proj.id} /><input type="hidden" name="path" value={`/app/content/${id}`} />
              <input name="body" required placeholder="Комментарий" className="input" /><Submit variant="secondary">Отправить</Submit>
            </ActionForm>
          </Card>
        </div>

        <div className="space-y-4">
          {next.length > 0 && (isMgr || isExec || isRev) && (
            <Card title="Следующий шаг">
              <ActionForm action={transitionContent} className="space-y-2">
                <input type="hidden" name="id" value={id} />
                <select name="to" className="input">{next.map((n) => <option key={n} value={n}>{CONTENT_STATUS[n]}</option>)}{isMgr && !["published", "cancelled"].includes(c.status) && <option value="cancelled">Отменить</option>}{!["published", "cancelled", "blocked", "paused"].includes(c.status) && <><option value="blocked">Заблокировано</option><option value="paused">Приостановить</option></>}</select>
                <input name="result_url" defaultValue={c.result_url ?? ""} placeholder="Ссылка на результат (обязательно для проверки)" className="input" />
                <textarea name="note" placeholder="Причина / список правок (обязательно для доработки и блокировки)" className="input" />
                <Submit className="w-full">Применить</Submit>
              </ActionForm>
              <p className="mt-2 text-xs text-muted">При отправке на проверку этап исполнителя завершается и начинается срок проверяющего. «Сделано», «Выложено» и «Проверено» — разные факты.</p>
            </Card>
          )}
          <Card title="Назначение">
            <dl className="mb-3 grid grid-cols-2 gap-2 text-sm">
              <dt className="text-muted">Исполнитель</dt><dd>{nameOf(people, c.assignee_id)}</dd>
              <dt className="text-muted">Проверяющий</dt><dd>{nameOf(people, c.reviewer_id)}</dd>
              <dt className="text-muted">Подготовка</dt><dd>{dateTime(c.prep_due)}</dd>
              <dt className="text-muted">Проверка до</dt><dd>{dateTime(c.review_due)}</dd>
              <dt className="text-muted">Публикация</dt><dd>{dateTime(c.publish_due)}</dd>
              <dt className="text-muted">Результат</dt><dd>{c.result_url ? <a className="text-primary underline" href={c.result_url} target="_blank" rel="noopener noreferrer">открыть</a> : "—"}</dd>
            </dl>
            {isMgr && (
              <ActionForm action={assignContent} className="space-y-2">
                <input type="hidden" name="id" value={id} />
                <Field label="ТЗ *"><textarea name="brief" defaultValue={c.brief ?? ""} required className="input" /></Field>
                <Field label="Исполнитель *"><PeopleSelect name="assignee_id" people={people} defaultValue={c.assignee_id} required /></Field>
                <Field label="Проверяющий"><PeopleSelect name="reviewer_id" people={people} defaultValue={c.reviewer_id} /></Field>
                <Field label="Срок подготовки *"><input name="prep_due" type="datetime-local" required defaultValue={isoToLocalInput(c.prep_due)} className="input" /></Field>
                <Field label="Публикация"><input name="publish_due" type="datetime-local" defaultValue={isoToLocalInput(c.publish_due)} className="input" /></Field>
                <Submit variant="secondary" className="w-full">Назначить</Submit>
              </ActionForm>
            )}
          </Card>
          <Card title="История">
            <ol className="space-y-2 text-sm">{(hist ?? []).map((h: { id: number; from_status: string; to_status: string; note: string | null; actor_id: string | null; created_at: string; data: Record<string, string> | null }) => (
              <li key={h.id} className="border-l-2 border-line pl-3">
                <b>{h.from_status === h.to_status ? "Назначение" : `${CONTENT_STATUS[h.from_status]} → ${CONTENT_STATUS[h.to_status]}`}</b>
                {h.note && h.note !== "назначение" && <div>{h.note}</div>}
                {h.data?.result_url && <a className="text-xs text-primary underline" href={h.data.result_url} target="_blank" rel="noopener noreferrer">версия результата</a>}
                <div className="text-xs text-muted">{dateTime(h.created_at)} · {nameOf(people, h.actor_id)}</div>
              </li>
            ))}</ol>
          </Card>
        </div>
      </div>
    </>
  );
}
