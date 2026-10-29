"use client";
import Link from "next/link";
import { useState } from "react";
import { cn } from "@/components/ui";
import { MoveButton } from "./dnd";

export type CalEvent = { id: string; ref: string; day: string; time: string | null; title: string; kind: string; href: string; tone: "info" | "good" | "warn" | "bad" | "brand" | "neutral"; meta: string; status: string | null };

const TONE: Record<CalEvent["tone"], string> = {
  info: "bg-info", good: "bg-good", warn: "bg-warn", bad: "bg-bad", brand: "bg-brand", neutral: "bg-muted",
};
const WD = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function dayTitle(day: string) {
  return new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(day + "T12:00:00Z"));
}

export function EventList({ items, statusLabels }: { items: CalEvent[]; statusLabels: Record<string, string> }) {
  if (!items.length) return <p className="px-1 py-3 text-sm text-muted">Событий нет.</p>;
  return (
    <ul className="grouped">
      {items.map((e) => (
        <li key={e.id} className="flex items-center">
          <Link href={e.href} className="row min-w-0 flex-1 pr-1">
            <span className={cn("h-9 w-1 shrink-0 rounded-full", TONE[e.tone])} aria-hidden />
            <span className="w-12 shrink-0 text-[13px] font-semibold tabular-nums">{e.time ?? "весь день"}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{e.title}</span>
              {(e.meta || e.status) && <span className="block truncate text-[13px] text-muted">{[e.meta, e.status ? statusLabels[e.status] : null].filter(Boolean).join(" · ")}</span>}
            </span>
          </Link>
          <MoveButton kind={e.kind} id={e.ref} day={e.day} title={e.title} />
        </li>
      ))}
    </ul>
  );
}

/** Месяц на телефоне: сетка дней с маркерами и лента выбранного дня (без мелкого текста в ячейках). */
export function MonthMobile({ days, month, today, byDay, statusLabels }: { days: string[]; month: string; today: string; byDay: Record<string, CalEvent[]>; statusLabels: Record<string, string> }) {
  const initial = today.slice(0, 7) === month ? today : (days.find((d) => d.slice(0, 7) === month && byDay[d]?.length) ?? `${month}-01`);
  const [sel, setSel] = useState(initial);
  return (
    <div className="md:hidden">
      <div className="rounded-2xl border border-line bg-surface p-2">
        <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-muted">
          {WD.map((d) => <div key={d} className="py-1">{d}</div>)}
        </div>
        <div className="grid grid-cols-7" role="grid" aria-label="Дни месяца">
          {days.map((d) => {
            const items = byDay[d] ?? [];
            const inMonth = d.slice(0, 7) === month;
            const tones = [...new Set(items.map((e) => e.tone))].slice(0, 3);
            return (
              <button
                key={d}
                type="button"
                onClick={() => setSel(d)}
                aria-pressed={sel === d}
                aria-label={`${dayTitle(d)}: ${items.length ? `событий ${items.length}` : "нет событий"}`}
                className={cn("flex h-12 flex-col items-center justify-center gap-1 rounded-xl text-[15px] tabular-nums", !inMonth && "text-muted/60", sel === d ? "bg-brand text-white" : d === today ? "font-bold text-brand" : "")}
              >
                {Number(d.slice(8))}
                <span className="flex h-1.5 gap-0.5" aria-hidden>
                  {tones.map((t) => <span key={t} className={cn("h-1.5 w-1.5 rounded-full", sel === d ? "bg-white" : TONE[t])} />)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <h3 className="group-title mt-4 capitalize">{dayTitle(sel)}</h3>
      <EventList items={byDay[sel] ?? []} statusLabels={statusLabels} />
    </div>
  );
}
