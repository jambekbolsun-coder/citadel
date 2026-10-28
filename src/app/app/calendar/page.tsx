import Link from "next/link";
import { requireActive } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, Field, PageHeader, cn } from "@/components/ui";
import { ActionForm, Submit } from "@/components/action-form";
import { activePeople, nameOf } from "@/lib/data";
import { CONTENT_KIND, CONTENT_STATUS } from "@/lib/labels";
import { localDateOf, localToIso, time, todayLocal } from "@/lib/format";
import { addCalendarEvent, deleteCalendarEvent } from "./actions";
import { CalendarDnd, DragItem, DropDay } from "./dnd";

export const metadata = { title: "Календарь" };

type Ev = { id: string; ref: string; day: string; at: string | null; title: string; kind: string; href: string; tone: "info" | "good" | "warn" | "bad" | "brand" | "neutral"; who: string | null; project: string | null; status?: string };
const WD = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const TYPES: Record<string, string> = { content: "Контент", shoot: "Съёмки", task: "Задачи", publish: "Публикации", event: "Смены/занятость", payday: "Выплаты" };

function addDays(d: string, n: number) {
  const x = new Date(d + "T12:00:00Z");
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}
function isoDow(d: string) {
  return ((new Date(d + "T12:00:00Z").getUTCDay() + 6) % 7) + 1;
}

export default async function CalendarPage({ searchParams }: PageProps<"/app/calendar">) {
  const sp = await searchParams;
  const s = await requireActive();
  const supabase = await createClient();
  const view = (typeof sp.view === "string" ? sp.view : "month") as "year" | "month" | "week" | "day";
  const anchor = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : todayLocal();
  const project = typeof sp.project === "string" ? sp.project : "";
  const person = typeof sp.person === "string" ? sp.person : s.can("calendar.view_all") ? "" : s.userId;
  const types = typeof sp.types === "string" && sp.types ? sp.types.split(",") : Object.keys(TYPES);
  const q = typeof sp.q === "string" ? sp.q.toLowerCase() : "";

  // диапазон
  const [y, m] = anchor.split("-").map(Number);
  let start: string, end: string;
  if (view === "year") { start = `${y}-01-01`; end = `${y}-12-31`; }
  else if (view === "month") { start = addDays(`${y}-${String(m).padStart(2, "0")}-01`, -(isoDow(`${y}-${String(m).padStart(2, "0")}-01`) - 1)); end = addDays(start, 41); }
  else if (view === "week") { start = addDays(anchor, -(isoDow(anchor) - 1)); end = addDays(start, 6); }
  else { start = anchor; end = anchor; }
  const from = localToIso(start, "00:00"), to = localToIso(end, "23:59");

  const [people, { data: projects }, contentQ, shootsQ, tasksQ, eventsQ, termsQ] = await Promise.all([
    activePeople(),
    supabase.from("projects").select("id,name").not("status", "in", "(closed,cancelled)").order("name"),
    (() => { let x = supabase.from("content_items").select("id,title,kind,status,assignee_id,prep_due,publish_due,projects(id,name)").or(`and(prep_due.gte.${from},prep_due.lte.${to}),and(publish_due.gte.${from},publish_due.lte.${to})`).neq("status", "cancelled").limit(2000); if (project) x = x.eq("project_id", project); if (person) x = x.eq("assignee_id", person); return x; })(),
    (() => { let x = supabase.from("shoots").select("id,title,starts_at,status,project_id,projects(name),shoot_participants(user_id)").gte("starts_at", from).lte("starts_at", to).neq("status", "cancelled").limit(1000); if (project) x = x.eq("project_id", project); return x; })(),
    (() => { let x = supabase.from("tasks").select("id,title,status,due_at,assignee_id,project_id,projects(name)").gte("due_at", from).lte("due_at", to).not("status", "in", "(cancelled)").limit(1000); if (project) x = x.eq("project_id", project); if (person) x = x.eq("assignee_id", person); return x; })(),
    (() => { let x = supabase.from("calendar_events").select("*").lte("starts_at", to).gte("ends_at", from).limit(1000); if (person) x = x.eq("user_id", person); return x; })(),
    s.can("payroll.view") ? supabase.from("salary_terms").select("user_id,pay_days,effective_from") : Promise.resolve({ data: [] }),
  ]);

  const ev: Ev[] = [];
  type CI = { id: string; title: string; kind: string; status: string; assignee_id: string | null; prep_due: string | null; publish_due: string | null; projects: { id: string; name: string } | null };
  for (const c of (contentQ.data ?? []) as unknown as CI[]) {
    if (types.includes("content") && c.prep_due && c.prep_due >= from && c.prep_due <= to && !["done", "published"].includes(c.status))
      ev.push({ id: c.id + "p", ref: c.id, day: localDateOf(c.prep_due), at: c.prep_due, title: `${CONTENT_KIND[c.kind]}: ${c.title}`, kind: "content", href: `/app/content/${c.id}`, tone: new Date(c.prep_due) < new Date() ? "bad" : "info", who: c.assignee_id, project: c.projects?.name ?? null, status: c.status });
    if (types.includes("publish") && c.publish_due && c.publish_due >= from && c.publish_due <= to)
      ev.push({ id: c.id + "u", ref: c.id, day: localDateOf(c.publish_due), at: c.publish_due, title: `Публикация: ${c.title}`, kind: "publish", href: `/app/content/${c.id}`, tone: c.status === "published" ? "good" : "brand", who: c.assignee_id, project: c.projects?.name ?? null, status: c.status });
  }
  if (types.includes("shoot"))
    for (const sh of (shootsQ.data ?? []) as unknown as { id: string; title: string; starts_at: string; status: string; projects: { name: string } | null; shoot_participants: { user_id: string }[] }[]) {
      if (person && !sh.shoot_participants.some((p) => p.user_id === person)) continue;
      ev.push({ id: sh.id, ref: sh.id, day: localDateOf(sh.starts_at), at: sh.starts_at, title: `Съёмка: ${sh.title}`, kind: "shoot", href: `/app/shoots/${sh.id}`, tone: sh.status === "done" ? "good" : "warn", who: null, project: sh.projects?.name ?? null });
    }
  if (types.includes("task"))
    for (const t of (tasksQ.data ?? []) as unknown as { id: string; title: string; status: string; due_at: string; assignee_id: string | null; projects: { name: string } | null }[])
      ev.push({ id: t.id, ref: t.id, day: localDateOf(t.due_at), at: t.due_at, title: `Задача: ${t.title}`, kind: "task", href: `/app/tasks/${t.id}`, tone: t.status === "done" ? "good" : new Date(t.due_at) < new Date() ? "bad" : "neutral", who: t.assignee_id, project: t.projects?.name ?? null });
  const personal = (eventsQ.data ?? []) as { id: string; user_id: string; kind: string; title: string; starts_at: string; ends_at: string }[];
  if (types.includes("event"))
    for (const e of personal) {
      let d = localDateOf(e.starts_at); const last = localDateOf(e.ends_at);
      while (d <= last && d <= end) { if (d >= start) ev.push({ id: e.id + d, ref: "", day: d, at: d === localDateOf(e.starts_at) ? e.starts_at : null, title: `${e.kind === "time_off" ? "Отпуск/выходной" : e.kind === "shift" ? "Смена" : "Занят"}: ${e.title}`, kind: "event", href: "#", tone: "neutral", who: e.user_id, project: null }); d = addDays(d, 1); }
    }
  if (types.includes("payday"))
    for (const t of (termsQ.data ?? []) as { user_id: string; pay_days: number[] }[]) {
      if (person && t.user_id !== person) continue;
      for (let d = start; d <= end; d = addDays(d, 1)) if (t.pay_days.includes(Number(d.slice(8)))) ev.push({ id: t.user_id + d, ref: "", day: d, at: null, title: `Выплата: ${nameOf(people, t.user_id)}`, kind: "payday", href: "/app/payroll", tone: "warn", who: t.user_id, project: null });
    }
  const filtered = q ? ev.filter((e) => e.title.toLowerCase().includes(q) || (e.project ?? "").toLowerCase().includes(q)) : ev;
  const byDay: Record<string, Ev[]> = {};
  filtered.sort((a, b) => (a.at ?? "").localeCompare(b.at ?? "")).forEach((e) => (byDay[e.day] ??= []).push(e));

  const shift = (n: number) => (view === "year" ? `${y + n}-01-01` : view === "month" ? `${m + n > 12 ? y + 1 : m + n < 1 ? y - 1 : y}-${String(((m + n + 11) % 12) + 1).padStart(2, "0")}-01` : addDays(anchor, n * (view === "week" ? 7 : 1)));
  const qs = (o: Record<string, string>) => {
    const p = new URLSearchParams({ view, date: anchor, project, person, types: types.join(","), q, ...o });
    return `/app/calendar?${p.toString()}`;
  };
  const today = todayLocal();
  const canMove = ["tasks.manage", "shoots.manage", "content.manage", "content.plan", "projects.manage"].some((p) => s.can(p));
  const title = view === "year" ? String(y) : view === "month" ? `${MONTHS[m - 1]} ${y}` : view === "week" ? `Неделя ${start.slice(8)}.${start.slice(5, 7)} — ${end.slice(8)}.${end.slice(5, 7)}.${end.slice(0, 4)}` : new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long" }).format(new Date(anchor + "T12:00:00Z"));

  // загрузка по людям (неделя)
  const load: Record<string, { content: number; tasks: number; shoots: number }> = {};
  if (view === "week") for (const e of filtered) if (e.who && ["content", "task"].includes(e.kind)) { const l = (load[e.who] ??= { content: 0, tasks: 0, shoots: 0 }); if (e.kind === "content") l.content++; else l.tasks++; }
  const { data: caps } = view === "week" ? await supabase.from("capacity_rules").select("key,value") : { data: [] };
  const editH = (caps ?? []).find((c: { key: string; value: number | null }) => c.key === "edit_hours")?.value as number | null | undefined;
  const shiftH = (caps ?? []).find((c: { key: string; value: number | null }) => c.key === "shift_hours")?.value as number | null | undefined;

  return (
    <>
      <PageHeader title="Календарь" subtitle="Съёмки, производство, дедлайны, публикации, смены и выплаты" />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl bg-surface-2 p-1 ring-1 ring-line">
          {(["year", "month", "week", "day"] as const).map((v) => <Link key={v} href={qs({ view: v })} className={cn("rounded-lg px-3 py-1.5 text-sm font-semibold", v === view ? "bg-surface text-ink shadow-sm" : "text-muted")}>{{ year: "Год", month: "Месяц", week: "Неделя", day: "День" }[v]}</Link>)}
        </div>
        <Link href={qs({ date: shift(-1) })} className="rounded-xl bg-surface-2 px-3 py-2 text-sm ring-1 ring-line" aria-label="Назад">←</Link>
        <Link href={qs({ date: today })} className="rounded-xl bg-surface-2 px-3 py-2 text-sm font-semibold ring-1 ring-line">Сегодня</Link>
        <Link href={qs({ date: shift(1) })} className="rounded-xl bg-surface-2 px-3 py-2 text-sm ring-1 ring-line" aria-label="Вперёд">→</Link>
        <h2 className="ml-1 text-lg font-semibold capitalize">{title}</h2>
      </div>
      <form className="mb-4 flex flex-wrap gap-2">
        <input type="hidden" name="view" value={view} /><input type="hidden" name="date" value={anchor} />
        <input name="q" defaultValue={q} placeholder="Поиск" className="input max-w-[180px]" />
        <select name="project" defaultValue={project} className="input max-w-[200px]"><option value="">Все проекты</option>{(projects ?? []).map((p: { id: string; name: string }) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        {s.can("calendar.view_all") && <select name="person" defaultValue={person} className="input max-w-[200px]"><option value="">Вся команда</option>{people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select>}
        <select name="types" defaultValue={typeof sp.types === "string" ? sp.types : ""} className="input max-w-[180px]"><option value="">Все типы</option>{Object.entries(TYPES).filter(([k]) => k !== "payday" || s.can("payroll.view")).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <button className="rounded-xl bg-surface-2 px-4 text-sm font-semibold ring-1 ring-line">Применить</button>
      </form>

      {view === "year" && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {MONTHS.map((name, i) => {
            const mm = String(i + 1).padStart(2, "0");
            const items = filtered.filter((e) => e.day.slice(0, 7) === `${y}-${mm}`);
            const by = (k: string) => items.filter((e) => e.kind === k).length;
            return (
              <Link key={mm} href={qs({ view: "month", date: `${y}-${mm}-01` })} className="rounded-2xl border border-line bg-surface p-4 hover:border-primary">
                <div className="font-semibold">{name}</div>
                <div className="mt-2 grid grid-cols-2 gap-1 text-xs text-muted">
                  <span>Съёмки: {by("shoot")}</span><span>Публикации: {by("publish")}</span><span>Контент: {by("content")}</span><span>Задачи: {by("task")}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {view === "month" && (
        <>
          <CalendarDnd enabled={canMove}>
          <div className="hidden overflow-hidden rounded-2xl border border-line md:block">
            <div className="grid grid-cols-7 bg-surface-2 text-center text-xs font-semibold text-muted">{WD.map((d) => <div key={d} className="py-2">{d}</div>)}</div>
            <div className="grid grid-cols-7">
              {Array.from({ length: 42 }, (_, i) => addDays(start, i)).map((d) => {
                const inMonth = d.slice(5, 7) === String(m).padStart(2, "0");
                const items = byDay[d] ?? [];
                return (
                  <DropDay key={d} day={d} className={cn("min-h-[112px] border-t border-l border-line p-1.5 first:border-l-0", !inMonth && "bg-surface-2/40", d === today && "bg-primary/5")}>
                    <Link href={qs({ view: "day", date: d })} className={cn("mb-1 inline-block rounded-md px-1.5 text-xs font-semibold", d === today ? "bg-primary text-primary-ink" : inMonth ? "" : "text-muted")}>{Number(d.slice(8))}</Link>
                    <div className="space-y-0.5">
                      {items.slice(0, 4).map((e) => <DragItem key={e.id} kind={e.kind} id={e.ref} day={e.day} title={e.title} href={e.href} className={cn("block truncate rounded px-1 py-0.5 text-[11px]", { info: "bg-info-soft text-info", good: "bg-good-soft text-good", warn: "bg-warn-soft text-warn", bad: "bg-bad-soft text-bad", brand: "bg-brand-soft text-brand", neutral: "bg-surface-2 text-muted" }[e.tone])}>{e.at ? time(e.at) + " " : ""}{e.title}</DragItem>)}
                      {items.length > 4 && <Link href={qs({ view: "day", date: d })} className="block px-1 text-[11px] text-muted">+ ещё {items.length - 4}</Link>}
                    </div>
                  </DropDay>
                );
              })}
            </div>
          </div>
          </CalendarDnd>
          <div className="space-y-2 md:hidden">
            {Object.keys(byDay).filter((d) => d.slice(5, 7) === String(m).padStart(2, "0")).sort().map((d) => <DayList key={d} day={d} items={byDay[d]} people={people} />)}
            {Object.keys(byDay).length === 0 && <p className="text-sm text-muted">Событий нет.</p>}
          </div>
        </>
      )}

      {view === "week" && (
        <>
          <CalendarDnd enabled={canMove}>
          <div className="grid gap-2 md:grid-cols-7">
            {Array.from({ length: 7 }, (_, i) => addDays(start, i)).map((d, i) => (
              <DropDay key={d} day={d} className={cn("min-h-[120px] rounded-2xl border border-line bg-surface p-2", d === today && "ring-2 ring-primary")}>
                <Link href={qs({ view: "day", date: d })} className="mb-2 block text-sm font-semibold">{WD[i]}, {Number(d.slice(8))}</Link>
                <div className="space-y-1">{(byDay[d] ?? []).map((e) => <EvChip key={e.id} e={e} people={people} />)}</div>
              </DropDay>
            ))}
          </div>
          </CalendarDnd>
          {s.can("calendar.view_all") && (
            <Card title="Загрузка команды за неделю" className="mt-4">
              {Object.keys(load).length === 0 ? <p className="text-sm text-muted">Назначений нет.</p> : (
                <div className="scroll-x"><table className="tbl">
                  <thead><tr><th>Сотрудник</th><th>Материалы</th><th>Задачи</th><th>Часы</th><th>% от смены</th></tr></thead>
                  <tbody>{Object.entries(load).map(([uid, l]) => (
                    <tr key={uid}><td>{nameOf(people, uid)}</td><td>{l.content}</td><td>{l.tasks}</td>
                      <td>{editH ? `${l.content * editH} ч` : <span className="text-muted">ёмкость не рассчитана</span>}</td>
                      <td>{editH && shiftH ? `${Math.round((l.content * editH) / (shiftH * 5) * 100)}%` : <span className="text-muted">нормативы не заданы</span>}</td></tr>
                  ))}</tbody>
                </table></div>
              )}
              <p className="mt-2 text-xs text-muted">Часы считаются только по утверждённым нормативам (Настройки → Нормативы). Ролики ≠ выезды: одна съёмка может дать несколько видео.</p>
            </Card>
          )}
        </>
      )}

      {view === "day" && <DayList day={anchor} items={byDay[anchor] ?? []} people={people} big />}

      <Card title="Добавить смену / отпуск / занятость" className="mt-6">
        <ActionForm action={addCalendarEvent} reset className="grid gap-2 sm:grid-cols-5">
          <select name="kind" className="input"><option value="busy">Занят</option><option value="shift">Смена</option><option value="time_off">Отпуск / выходной</option><option value="report">Отчёт</option></select>
          <input name="title" placeholder="Комментарий" className="input" />
          <Field label="С"><input name="starts_at" type="datetime-local" required className="input" /></Field>
          <Field label="По"><input name="ends_at" type="datetime-local" required className="input" /></Field>
          {s.can("employees.manage") ? <select name="user_id" defaultValue={s.userId} className="input">{people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select> : <span />}
          <Submit variant="secondary">Добавить</Submit>
        </ActionForm>
        {personal.filter((e) => e.user_id === s.userId).length > 0 && (
          <ul className="mt-3 space-y-1 text-sm">{personal.filter((e) => e.user_id === s.userId).map((e) => (
            <li key={e.id} className="flex items-center gap-2">{e.title} · {localDateOf(e.starts_at)}–{localDateOf(e.ends_at)}
              <ActionForm action={deleteCalendarEvent}><input type="hidden" name="event_id" value={e.id} /><button className="text-xs text-bad">удалить</button></ActionForm></li>
          ))}</ul>
        )}
      </Card>
    </>
  );
}

function EvChip({ e, people }: { e: Ev; people: { id: string; full_name: string; job_title: string | null; avatar_url: string | null }[] }) {
  return (
    <DragItem kind={e.kind} id={e.ref} day={e.day} title={e.title} href={e.href} className={cn("block rounded-lg px-2 py-1 text-xs", { info: "bg-info-soft text-info", good: "bg-good-soft text-good", warn: "bg-warn-soft text-warn", bad: "bg-bad-soft text-bad", brand: "bg-brand-soft text-brand", neutral: "bg-surface-2 text-muted" }[e.tone])}>
      <div className="font-semibold">{e.at ? time(e.at) + " · " : ""}{e.title}</div>
      <div className="opacity-80">{[e.project, e.who ? nameOf(people, e.who) : null].filter(Boolean).join(" · ")}</div>
    </DragItem>
  );
}

function DayList({ day, items, people, big }: { day: string; items: Ev[]; people: { id: string; full_name: string; job_title: string | null; avatar_url: string | null }[]; big?: boolean }) {
  return (
    <Card title={new Intl.DateTimeFormat("ru-RU", { weekday: "short", day: "numeric", month: "long" }).format(new Date(day + "T12:00:00Z"))}>
      {items.length === 0 ? <p className="text-sm text-muted">Событий нет.</p> : (
        <ul className={cn("space-y-1.5", big && "space-y-2")}>
          {items.map((e) => (
            <li key={e.id}><Link href={e.href} className="flex items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">
              <span className="min-w-0"><span className="font-semibold">{e.at ? time(e.at) : "весь день"}</span> · {e.title}<span className="block text-xs text-muted">{[e.project, e.who ? nameOf(people, e.who) : null].filter(Boolean).join(" · ")}</span></span>
              {e.status && <Badge status={e.status}>{CONTENT_STATUS[e.status]}</Badge>}
            </Link></li>
          ))}
        </ul>
      )}
    </Card>
  );
}
