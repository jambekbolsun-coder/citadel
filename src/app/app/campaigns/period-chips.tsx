import Link from "next/link";
import { cn } from "@/components/ui";
import type { Period } from "./data";

/** Сегодня / 7 дней / месяц / свои даты — как ссылки (работают без JS), даты — GET-формой. */
export function PeriodChips({ base, params, period }: { base: string; params: Record<string, string>; period: Period }) {
  const href = (k: string) => `${base}?${new URLSearchParams({ ...params, period: k })}`;
  const items = [
    { key: "today", label: "Сегодня" },
    { key: "7d", label: "7 дней" },
    { key: "month", label: "Месяц" },
  ];
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
      {items.map((i) => (
        <Link key={i.key} href={href(i.key)} aria-current={period.key === i.key ? "page" : undefined} className={cn("inline-flex min-h-11 items-center rounded-xl px-3", period.key === i.key ? "bg-brand-soft font-semibold text-brand" : "bg-surface-2 text-muted")}>{i.label}</Link>
      ))}
      <details className="relative" open={period.key === "custom"}>
        <summary className={cn("inline-flex min-h-11 cursor-pointer list-none items-center rounded-xl px-3", period.key === "custom" ? "bg-brand-soft font-semibold text-brand" : "bg-surface-2 text-muted")}>Даты</summary>
        <form action={base} className="mt-2 flex flex-wrap items-end gap-2">
          {Object.entries(params).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <input type="hidden" name="period" value="custom" />
          <input name="from" type="date" defaultValue={period.from} aria-label="С" className="input w-auto" />
          <input name="to" type="date" defaultValue={period.to} aria-label="По" className="input w-auto" />
          <button className="min-h-11 rounded-xl bg-surface-2 px-4 font-semibold ring-1 ring-line">Показать</button>
        </form>
      </details>
    </div>
  );
}
