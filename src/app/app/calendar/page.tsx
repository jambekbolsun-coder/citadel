import Link from "next/link";
import { ChevronLeft, ChevronRight, SlidersHorizontal } from "lucide-react";
import { requireActive } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ButtonLink, Card, cn } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { activePeople, nameOf } from "@/lib/data";
import { CONTENT_KIND, CONTENT_STATUS } from "@/lib/labels";
import { localDateOf, localToIso, time, todayLocal } from "@/lib/format";
import { deleteCalendarEvent } from "./actions";
import { CalendarDnd, DragItem, DropDay } from "./dnd";
import { EventList, MonthMobile, type CalEvent } from "./views";

export const metadata = { title: "Календарь" };

type Ev = CalEvent & { at: string | null; who: string | null; project: string | null };
const WD = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const TYPES: Record<string, string> = { content: "Контент", shoot: "Съёмки", task: "Задачи", publish: "Публикации", event: "Смены/занятость", payday: "Выплаты" };
const CHIP: Record<CalEvent["tone"], string> = { info: "bg-info-soft text-info", good: "bg-good-soft text-good", warn: "bg-warn-soft text-warn", bad: "bg-bad-soft text-bad", brand: "bg-brand-soft text-brand", neutral: "bg-surface-2 text-muted" };

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
  const view = (["year", "month", "week", "day"].includes(String(sp.view)) ? sp.view : "month") as "year" | "month" | "week" | "day";
  const anchor = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : todayLocal();
  const project = typeof sp.project === "string" ? sp.project : "";
  const teamView = s.can("calendar.view_all");
  // Сотрудник видит свой календарь; с правом calendar.view_all — команду или выбранного человека
  const person = teamView ? (typeof sp.person === "string" ? sp.person : "") : s.userId;
  const types = typeof sp.types === "string" && sp.types ? sp.types.split(",") : Object.keys(TYPES);
  const q = typeof sp.q === "string" ? sp.q.toLowerCase() : "";

  const [y, m] = anchor.split("-").map(Number);
  const mm = String(m).padStart(2, "0");
  let start: string, end: string;
  if (view === "year") { start = `${y}-01-01`; end = `${y}-12-31`; }
  else if (view === "month") { start = addDays(`${y}-${mm}-01`, -(isoDow(`${y}-${mm}-01`) - 1)); end = addDays(start, 41); }
  else if (view === "week") { start = addDays(anchor, -(isoDow(anchor) - 1)); end = addDays(start, 6); }
  else { start = anchor; end = anchor; }
  const from = localToIso(start, "00:00"), to = localToIso(end, "23:59");

  const shift = (n: number) => (view === "year" ? `${y + n}-01-01` : view === "month" ? `${m + n > 12 ? y + 1 : m + n < 1 ? y - 1 : y}-${String(((m + n + 11) % 12) + 1).padStart(2, "0")}-01` : addDays(anchor, n * (view === "week" ? 7 : 1)));
  const qs = (o: Record<string, string>) => `/app/calendar?${new URLSearchParams({ view, date: anchor, project, person, types: typeof sp.types === "string" ? sp.types : "", q, ...o }).toString()}`;
  const today = todayLocal();
  const canMove = ["tasks.manage", "shoots.manage", "content.manage", "content.plan", "projects.manage"].some((p) => s.can(p));
  const title = view === "year" ? String(y) : view === "month" ? `${MONTHS[m - 1]} ${y}` : view === "week" ? `${Number(start.slice(8))}.${start.slice(5, 7)} — ${end.slice(8)}.${end.slice(5, 7)}` : new Intl.DateTimeFormat("ru-RU", { weekday: "short", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(anchor + "T12:00:00Z"));

  const [people, { data: projects }] = await Promise.all([activePeople(), supabase.from("projects").select("id,name").not("status", "in", "(closed,cancelled)").order("name")]);

  const controls = (
    <>
      <div className="mb-3 grid grid-cols-4 rounded-xl bg-surface-2 p-1 ring-1 ring-line sm:inline-grid">
        {(["year", "month", "week", "day"] as const).map((v) => (
          <Link key={v} href={qs({ view: v })} aria-current={v === view ? "page" : undefined} className={cn("flex min-h-9 items-center justify-center rounded-lg px-3 text-sm font-semibold", v === view ? "bg-surface text-ink shadow-sm" : "text-muted")}>
            {{ year: "Год", month: "Месяц", week: "Неделя", day: "День" }[v]}
          </Link>
        ))}
      </div>
      <div className="mb-3 flex items-center gap-1">
        <Link href={qs({ date: shift(-1) })} className="tap text-muted" aria-label="Назад"><ChevronLeft size={22} /></Link>
        <h2 className="min-w-0 flex-1 truncate text-center text-lg font-semibold first-letter:uppercase sm:flex-none">{title}</h2>
        <Link href={qs({ date: shift(1) })} className="tap text-muted" aria-label="Вперёд"><ChevronRight size={22} /></Link>
        <Link href={qs({ date: today })} className="ml-1 inline-flex min-h-9 items-center rounded-xl bg-surface px-3 text-sm font-semibold ring-1 ring-line">Сегодня</Link>
      </div>
      {teamView && (
        <div className="mb-3 flex gap-2 text-sm" role="group" aria-label="Чей календарь">
          <Link href={qs({ person: s.userId })} className={cn("inline-flex min-h-9 items-center rounded-full px-4 font-semibold ring-1 ring-line", person === s.userId ? "bg-ink text-bg" : "bg-surface")}>Мой</Link>
          <Link href={qs({ person: "" })} className={cn("inline-flex min-h-9 items-center rounded-full px-4 font-semibold ring-1 ring-line", person === "" ? "bg-ink text-bg" : "bg-surface")}>Вся команда</Link>
        </div>
      )}
      <details className="group mb-4" open={Boolean(project || q || (typeof sp.types === "string" && sp.types))}>
        <summary className="inline-flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-xl bg-surface px-3 text-sm font-semibold ring-1 ring-line">
          <SlidersHorizontal size={16} /> Фильтры{project || q || sp.types ? " · включены" : ""}
        </summary>
        <form className="mt-2 grid gap-2 sm:flex sm:flex-wrap">
          <input type="hidden" name="view" value={view} /><input type="hidden" name="date" value={anchor} />
          {teamView && <input type="hidden" name="person" value={person} />}
          <input name="q" type="search" defaultValue={q} placeholder="Поиск по событиям" className="input sm:max-w-[200px]" />
          <select name="project" defaultValue={project} aria-label="Проект" className="input sm:max-w-[220px]"><option value="">Все проекты</option>{((projects ?? []) as { id: string; name: string }[]).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          {teamView && <select name="person" defaultValue={person} aria-label="Сотрудник" className="input sm:max-w-[220px]"><option value="">Вся команда</option>{people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select>}
          <select name="types" defaultValue={typeof sp.types === "string" ? sp.types : ""} aria-label="Тип" className="input sm:max-w-[200px]"><option value="">Все типы</option>{Object.entries(TYPES).filter(([k]) => k !== "payday" || s.can("payroll.view")).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <button className="min-h-11 rounded-xl bg-surface px-4 text-sm font-semibold ring-1 ring-line">Применить</button>
        </form>
      </details>
    </>
  );

  const header = (
    <div className="mb-3 flex items-end justify-between gap-3">
      <h1 className="font-display text-[22px] font-semibold md:text-[28px]">Календарь</h1>
      <ButtonLink href="/app/calendar/new" variant="secondary">+ Смена/отпуск</ButtonLink>
    </div>
  );

  // Год — только агрегаты из БД, без загрузки всех записей
  if (view === "year") {
    const { data: sum } = await supabase.rpc("calendar_year_summary", { p_from: from, p_to: to, p_project: project || null, p_person: person || null });
    const cnt = (month: number, kind: string) => Number(((sum ?? []) as { month: number; kind: string; n: number }[]).find((r) => r.month === month && r.kind === kind)?.n ?? 0);
    return (
      <>
        {header}
        {controls}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {MONTHS.map((name, i) => {
            const total = ["shoot", "publish", "content", "task"].reduce((a, k) => a + cnt(i + 1, k), 0);
            return (
              <Link key={name} href={qs({ view: "month", date: `${y}-${String(i + 1).padStart(2, "0")}-01` })} className={cn("rounded-2xl border bg-surface p-3 active:bg-surface-2 md:p-4", `${y}-${String(i + 1).padStart(2, "0")}` === today.slice(0, 7) ? "border-brand" : "border-line")}>
                <div className="flex items-baseline justify-between gap-2"><span className="font-semibold">{name}</span><span className="text-xs text-muted">{total || ""}</span></div>
                <dl className="mt-2 grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs text-muted">
                  <dt>Съёмки</dt><dd className="text-right tabular-nums text-ink">{cnt(i + 1, "shoot")}</dd>
                  <dt>Публикации</dt><dd className="text-right tabular-nums text-ink">{cnt(i + 1, "publish")}</dd>
                  <dt>Контент</dt><dd className="text-right tabular-nums text-ink">{cnt(i + 1, "content")}</dd>
                  <dt>Задачи</dt><dd className="text-right tabular-nums text-ink">{cnt(i + 1, "task")}</dd>
                </dl>
              </Link>
            );
          })}
        </div>
      </>
    );
  }

  const want = (k: string) => types.includes(k);
  const [contentQ, shootsQ, tasksQ, eventsQ, termsQ] = await Promise.all([
    want("content") || want("publish")
      ? (() => { let x = supabase.from("content_items").select("id,title,kind,status,assignee_id,prep_due,publish_due,projects(id,name)").or(`and(prep_due.gte.${from},prep_due.lte.${to}),and(publish_due.gte.${from},publish_due.lte.${to})`).neq("status", "cancelled").limit(1000); if (project) x = x.eq("project_id", project); if (person) x = x.eq("assignee_id", person); return x; })()
      : Promise.resolve({ data: [] }),
    want("shoot")
      ? (() => { let x = supabase.from("shoots").select("id,title,starts_at,status,project_id,projects(name),shoot_participants(user_id)").gte("starts_at", from).lte("starts_at", to).neq("status", "cancelled").limit(500); if (project) x = x.eq("project_id", project); return x; })()
      : Promise.resolve({ data: [] }),
    want("task")
      ? (() => { let x = supabase.from("tasks").select("id,title,status,due_at,assignee_id,project_id,projects(name)").gte("due_at", from).lte("due_at", to).neq("status", "cancelled").limit(1000); if (project) x = x.eq("project_id", project); if (person) x = x.eq("assignee_id", person); return x; })()
      : Promise.resolve({ data: [] }),
    (() => { let x = supabase.from("calendar_events").select("id,user_id,kind,title,starts_at,ends_at").lte("starts_at", to).gte("ends_at", from).limit(500); if (person) x = x.eq("user_id", person); return x; })(),
    want("payday") && s.can("payroll.view") ? supabase.from("salary_terms").select("user_id,pay_days,effective_from") : Promise.resolve({ data: [] }),
  ]);

  const ev: Ev[] = [];
  const meta = (project: string | null, who: string | null) => [project, who ? nameOf(people, who) : null].filter((x) => x && x !== "—").join(" · ");
  const push = (e: Omit<Ev, "time" | "meta">) => ev.push({ ...e, time: e.at ? time(e.at) : null, meta: meta(e.project, e.who) });
  type CI = { id: string; title: string; kind: string; status: string; assignee_id: string | null; prep_due: string | null; publish_due: string | null; projects: { id: string; name: string } | null };
  for (const c of (contentQ.data ?? []) as unknown as CI[]) {
    if (want("content") && c.prep_due && c.prep_due >= from && c.prep_due <= to && !["done", "published"].includes(c.status))
      push({ id: c.id + "p", ref: c.id, day: localDateOf(c.prep_due), at: c.prep_due, title: `${CONTENT_KIND[c.kind]}: ${c.title}`, kind: "content", href: `/app/content/${c.id}`, tone: new Date(c.prep_due) < new Date() ? "bad" : "info", who: c.assignee_id, project: c.projects?.name ?? null, status: c.status });
    if (want("publish") && c.publish_due && c.publish_due >= from && c.publish_due <= to)
      push({ id: c.id + "u", ref: c.id, day: localDateOf(c.publish_due), at: c.publish_due, title: `Публикация: ${c.title}`, kind: "publish", href: `/app/content/${c.id}`, tone: c.status === "published" ? "good" : "brand", who: c.assignee_id, project: c.projects?.name ?? null, status: c.status });
  }
  for (const sh of (shootsQ.data ?? []) as unknown as { id: string; title: string; starts_at: string; status: string; projects: { name: string } | null; shoot_participants: { user_id: string }[] }[]) {
    if (person && !sh.shoot_participants.some((p) => p.user_id === person)) continue;
    push({ id: sh.id, ref: sh.id, day: localDateOf(sh.starts_at), at: sh.starts_at, title: `Съёмка: ${sh.title}`, kind: "shoot", href: `/app/shoots/${sh.id}`, tone: sh.status === "done" ? "good" : "warn", who: null, project: sh.projects?.name ?? null, status: null });
  }
  for (const t of (tasksQ.data ?? []) as unknown as { id: string; title: string; status: string; due_at: string; assignee_id: string | null; projects: { name: string } | null }[])
    push({ id: t.id, ref: t.id, day: localDateOf(t.due_at), at: t.due_at, title: `Задача: ${t.title}`, kind: "task", href: `/app/tasks/${t.id}`, tone: t.status === "done" ? "good" : new Date(t.due_at) < new Date() ? "bad" : "neutral", who: t.assignee_id, project: t.projects?.name ?? null, status: null });
  const personal = (eventsQ.data ?? []) as { id: string; user_id: string; kind: string; title: string; starts_at: string; ends_at: string }[];
  if (want("event"))
    for (const e of personal) {
      let d = localDateOf(e.starts_at);
      const last = localDateOf(e.ends_at);
      while (d <= last && d <= end) {
        if (d >= start) push({ id: e.id + d, ref: "", day: d, at: d === localDateOf(e.starts_at) ? e.starts_at : null, title: `${e.kind === "time_off" ? "Отпуск/выходной" : e.kind === "shift" ? "Смена" : "Занят"}: ${e.title}`, kind: "event", href: qs({ view: "day", date: d }), tone: "neutral", who: e.user_id, project: null, status: null });
        d = addDays(d, 1);
      }
    }
  for (const t of (termsQ.data ?? []) as { user_id: string; pay_days: number[] }[]) {
    if (person && t.user_id !== person) continue;
    for (let d = start; d <= end; d = addDays(d, 1)) if (t.pay_days.includes(Number(d.slice(8)))) push({ id: t.user_id + d, ref: "", day: d, at: null, title: `Выплата: ${nameOf(people, t.user_id)}`, kind: "payday", href: "/app/payroll", tone: "warn", who: null, project: null, status: null });
  }
  const filtered = q ? ev.filter((e) => e.title.toLowerCase().includes(q) || (e.project ?? "").toLowerCase().includes(q)) : ev;
  const byDay: Record<string, Ev[]> = {};
  filtered.sort((a, b) => (a.at ?? "").localeCompare(b.at ?? "")).forEach((e) => (byDay[e.day] ??= []).push(e));
  const plain = (list: Ev[]): CalEvent[] => list.map(({ id, ref, day, time, title, kind, href, tone, meta, status }) => ({ id, ref, day, time, title, kind, href, tone, meta, status }));

  const load: Record<string, { content: number; tasks: number }> = {};
  if (view === "week") for (const e of filtered) if (e.who && ["content", "task"].includes(e.kind)) { const l = (load[e.who] ??= { content: 0, tasks: 0 }); if (e.kind === "content") l.content++; else l.tasks++; }
  const { data: caps } = view === "week" && teamView ? await supabase.from("capacity_rules").select("key,value") : { data: [] };
  const editH = (caps ?? []).find((c: { key: string; value: number | null }) => c.key === "edit_hours")?.value as number | null | undefined;
  const shiftH = (caps ?? []).find((c: { key: string; value: number | null }) => c.key === "shift_hours")?.value as number | null | undefined;
  const mine = personal.filter((e) => e.user_id === s.userId);

  return (
    <>
      {header}
      {controls}
      <CalendarDnd enabled={canMove}>
        {view === "month" && (
          <>
            <MonthMobile
              days={Array.from({ length: 42 }, (_, i) => addDays(start, i))}
              month={`${y}-${mm}`}
              today={today}
              byDay={Object.fromEntries(Object.entries(byDay).map(([d, l]) => [d, plain(l)]))}
              statusLabels={CONTENT_STATUS}
            />
            <div className="hidden overflow-hidden rounded-2xl border border-line md:block">
              <div className="grid grid-cols-7 bg-surface-2 text-center text-xs font-semibold text-muted">{WD.map((d) => <div key={d} className="py-2">{d}</div>)}</div>
              <div className="grid grid-cols-7">
                {Array.from({ length: 42 }, (_, i) => addDays(start, i)).map((d) => {
                  const inMonth = d.slice(5, 7) === mm;
                  const items = byDay[d] ?? [];
                  return (
                    <DropDay key={d} day={d} className={cn("min-h-[112px] border-t border-l border-line p-1.5 first:border-l-0", !inMonth && "bg-surface-2/40", d === today && "bg-primary/5")}>
                      <Link href={qs({ view: "day", date: d })} className={cn("mb-1 inline-block rounded-md px-1.5 text-xs font-semibold", d === today ? "bg-brand text-white" : inMonth ? "" : "text-muted")}>{Number(d.slice(8))}</Link>
                      <div className="space-y-0.5">
                        {items.slice(0, 4).map((e) => <DragItem key={e.id} kind={e.kind} id={e.ref} day={e.day} title={e.title} href={e.href} className={cn("block truncate rounded px-1 py-0.5 text-[11px]", CHIP[e.tone])}>{e.time ? e.time + " " : ""}{e.title}</DragItem>)}
                        {items.length > 4 && <Link href={qs({ view: "day", date: d })} className="block px-1 text-[11px] text-muted">+ ещё {items.length - 4}</Link>}
                      </div>
                    </DropDay>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {view === "week" && (
          <>
            <div className="space-y-4 md:hidden">
              {Array.from({ length: 7 }, (_, i) => addDays(start, i)).map((d, i) => (
                <section key={d}>
                  <h3 className={cn("group-title", d === today && "text-brand")}>{WD[i]}, {Number(d.slice(8))}{d === today ? " · сегодня" : ""}</h3>
                  <EventList items={plain(byDay[d] ?? [])} statusLabels={CONTENT_STATUS} />
                </section>
              ))}
            </div>
            <div className="hidden gap-2 md:grid md:grid-cols-7">
              {Array.from({ length: 7 }, (_, i) => addDays(start, i)).map((d, i) => (
                <DropDay key={d} day={d} className={cn("min-h-[120px] rounded-2xl border border-line bg-surface p-2", d === today && "ring-2 ring-brand")}>
                  <Link href={qs({ view: "day", date: d })} className="mb-2 block text-sm font-semibold">{WD[i]}, {Number(d.slice(8))}</Link>
                  <div className="space-y-1">
                    {(byDay[d] ?? []).map((e) => (
                      <DragItem key={e.id} kind={e.kind} id={e.ref} day={e.day} title={e.title} href={e.href} className={cn("block rounded-lg px-2 py-1 text-xs", CHIP[e.tone])}>
                        <div className="font-semibold">{e.time ? e.time + " · " : ""}{e.title}</div>
                        {e.meta && <div className="opacity-80">{e.meta}</div>}
                      </DragItem>
                    ))}
                  </div>
                </DropDay>
              ))}
            </div>
            {teamView && (
              <Card title="Загрузка команды за неделю" className="mt-4">
                {Object.keys(load).length === 0 ? <p className="text-sm text-muted">Назначений нет.</p> : (
                  <div className="scroll-x"><table className="tbl">
                    <thead><tr><th>Сотрудник</th><th>Материалы</th><th>Задачи</th><th>Часы</th><th>% от смены</th></tr></thead>
                    <tbody>{Object.entries(load).map(([uid, l]) => (
                      <tr key={uid}><td>{nameOf(people, uid)}</td><td data-label="Материалы">{l.content}</td><td data-label="Задачи">{l.tasks}</td>
                        <td data-label="Часы">{editH ? `${l.content * editH} ч` : <span className="text-muted">ёмкость не рассчитана</span>}</td>
                        <td data-label="Смена">{editH && shiftH ? `${Math.round(((l.content * editH) / (shiftH * 5)) * 100)}%` : <span className="text-muted">нормативы не заданы</span>}</td></tr>
                    ))}</tbody>
                  </table></div>
                )}
                <p className="mt-2 text-xs text-muted">Часы считаются только по утверждённым нормативам (Настройки → Нормативы). Ролики ≠ выезды: одна съёмка может дать несколько видео.</p>
              </Card>
            )}
          </>
        )}

        {view === "day" && <EventList items={plain(byDay[anchor] ?? [])} statusLabels={CONTENT_STATUS} />}
      </CalendarDnd>

      {mine.length > 0 && (
        <Card title="Мои смены и отпуска в этом периоде" className="mt-6">
          <ul className="divide-y divide-line text-sm">
            {mine.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2 py-2">
                <span className="min-w-0 truncate">{e.title} · {localDateOf(e.starts_at)}–{localDateOf(e.ends_at)}</span>
                <ActionForm action={deleteCalendarEvent} confirm="Удалить запись из календаря?"><input type="hidden" name="event_id" value={e.id} /><button className="tap text-sm text-bad">Удалить</button></ActionForm>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

