import { BADGES, TIER_LABEL, badgeState, countText, monthSummaryText, streakText, type MonthSummary, type Stats } from "@/lib/achievements";
import { cn } from "@/components/ui";
import { mascotSrc } from "@/lib/mascot";

const TIER_RING = ["border-line", "border-[#c07a3e]", "border-[#9aa3b2]", "border-[#e0a800]"];
const TIER_BG = ["bg-surface-2", "bg-[#c07a3e]/12", "bg-[#9aa3b2]/15", "bg-[#e0a800]/15"];

/** Огонёк серии без просрочек (главная, «Мои результаты»). */
export function StreakChip({ stats, className }: { stats: Pick<Stats, "streak_days" | "overdue_now">; className?: string }) {
  const on = !stats.overdue_now && stats.streak_days > 0;
  return (
    <div className={cn("inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm", on ? "bg-[#ff7a1a]/12 text-ink" : "bg-surface-2 text-muted", className)}>
      <span className={cn("text-base leading-none", !on && "grayscale opacity-60")} aria-hidden>🔥</span>
      <span>{on ? <><b className="tabular-nums">{stats.streak_days}</b> {streakText(stats).replace(/^\d+\s/, "")}</> : streakText(stats)}</span>
    </div>
  );
}

/** Сетка значков: полученная ступень и прогресс до следующей. */
export function BadgeGrid({ stats }: { stats: Stats }) {
  const list = BADGES.map((b) => badgeState(b, stats));
  return (
    <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {list.map(({ badge, value, tier, next, progress }) => (
        <li key={badge.key} className={cn("rounded-3xl border-2 p-3 text-center", TIER_RING[tier], TIER_BG[tier])}>
          <div className={cn("text-3xl leading-none", tier === 0 && "grayscale opacity-40")} aria-hidden>{badge.icon}</div>
          <div className="mt-1.5 text-sm font-semibold leading-tight">{badge.title}</div>
          <div className="text-xs text-muted">{tier ? TIER_LABEL[tier] : "ещё не получен"}</div>
          {next !== null ? (
            <>
              <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-line/60"><span className="block h-full rounded-full bg-primary" style={{ width: `${Math.round(progress * 100)}%` }} /></span>
              <div className="mt-1 text-[11px] leading-tight text-muted">{value} из {next} · {countText(next, badge.unit).replace(/^\d+\s/, "")}</div>
            </>
          ) : <div className="mt-2 text-[11px] leading-tight text-muted">{countText(value, badge.unit)} — высшая ступень!</div>}
        </li>
      ))}
    </ul>
  );
}

export const earnedCount = (stats: Stats) => BADGES.reduce((n, b) => n + badgeState(b, stats).tier, 0);

/** «Ваш октябрь: …» — карточка итогов прошлого месяца. */
export function MonthSummaryCard({ month, className }: { month: MonthSummary; className?: string }) {
  const text = monthSummaryText(month);
  if (!text) return null;
  const good = month.late === 0 && month.tasks + month.content > 0;
  return (
    <div className={cn("flex items-center gap-3 rounded-3xl border border-line bg-surface p-4", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={mascotSrc(good ? "proud" : "kind", "sm")} alt="" width={56} height={56} className="size-14 shrink-0" />
      <div className="min-w-0">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted">Итоги месяца</div>
        <div className="font-semibold">{text}</div>
        {good && <div className="text-sm text-muted">Ни одной просрочки — так держать!</div>}
      </div>
    </div>
  );
}
