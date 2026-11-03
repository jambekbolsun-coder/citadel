// Значки достижений, серия без просрочек и итоги месяца. Счётчики — в БД (my_achievements), здесь только правила и подписи.
import { plural } from "./format";

export type MonthSummary = { from: string; tasks: number; content: number; late: number; active_days: number; best_place: number | null };
export type Stats = {
  tasks_done: number; videos: number; content: number; story_days: number; active_days: number;
  contest_top3: number; contest_wins: number; streak_days: number; best_streak: number; overdue_now: boolean;
  month: MonthSummary;
};
export type StatKey = Exclude<keyof Stats, "overdue_now" | "month" | "streak_days">;

export type Badge = { key: string; stat: StatKey; icon: string; title: string; unit: [string, string, string]; tiers: [number, number, number] };
/** Три ступени: бронза → серебро → золото. Пороги — по реальной работе агентства. */
export const BADGES: Badge[] = [
  { key: "streak", stat: "best_streak", icon: "🔥", title: "Без просрочек", unit: ["рабочий день подряд", "рабочих дня подряд", "рабочих дней подряд"], tiers: [10, 30, 90] },
  { key: "tasks", stat: "tasks_done", icon: "✅", title: "Исполнитель", unit: ["задача выполнена", "задачи выполнено", "задач выполнено"], tiers: [10, 50, 200] },
  { key: "videos", stat: "videos", icon: "🎬", title: "Видеомейкер", unit: ["видео сдано", "видео сдано", "видео сдано"], tiers: [10, 50, 150] },
  { key: "content", stat: "content", icon: "🎨", title: "Контент-мастер", unit: ["материал принят", "материала принято", "материалов принято"], tiers: [25, 100, 300] },
  { key: "stories", stat: "story_days", icon: "📱", title: "Мастер сторис", unit: ["день с планом сторис", "дня с планом сторис", "дней с планом сторис"], tiers: [10, 30, 100] },
  { key: "active", stat: "active_days", icon: "📅", title: "Всегда на связи", unit: ["день в приложении", "дня в приложении", "дней в приложении"], tiers: [20, 100, 250] },
  { key: "podium", stat: "contest_top3", icon: "🏅", title: "Призёр", unit: ["раз в тройке", "раза в тройке", "раз в тройке"], tiers: [1, 3, 10] },
  { key: "champion", stat: "contest_wins", icon: "🏆", title: "Чемпион", unit: ["победа", "победы", "побед"], tiers: [1, 3, 5] },
];
export const TIER_LABEL = ["", "бронза", "серебро", "золото"] as const;

export type BadgeState = { badge: Badge; value: number; tier: 0 | 1 | 2 | 3; next: number | null; progress: number };
/** Достигнутая ступень и путь до следующей (progress 0..1; у золота — 1). */
export function badgeState(badge: Badge, stats: Pick<Stats, StatKey>): BadgeState {
  const value = Math.max(0, Number(stats[badge.stat]) || 0);
  const tier = badge.tiers.filter((t) => value >= t).length as 0 | 1 | 2 | 3;
  const next: number | null = tier < 3 ? (badge.tiers as number[])[tier] : null;
  const prev = tier > 0 ? badge.tiers[tier - 1] : 0;
  const progress = next === null ? 1 : Math.min(1, (value - prev) / (next - prev));
  return { badge, value, tier, next, progress };
}

export const countText = (n: number, unit: [string, string, string]) => `${n} ${plural(n, unit)}`;

/** Подпись серии для главной. */
export function streakText(s: Pick<Stats, "streak_days" | "overdue_now">): string {
  if (s.overdue_now) return "Серия прервалась — сдайте просроченное, и начнётся новая";
  if (s.streak_days === 0) return "Серия начнётся с первого рабочего дня без просрочек";
  return `${countText(s.streak_days, ["рабочий день", "рабочих дня", "рабочих дней"])} без просрочек`;
}

const MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
export const monthName = (from: string) => MONTHS[Number(from.slice(5, 7)) - 1] ?? "";

/** «Ваш октябрь: 24 задачи, 0 просрочек, 3-е место». Пусто, если в месяце не было ни работы, ни заходов. */
export function monthSummaryText(m: MonthSummary): string | null {
  if (m.tasks + m.content + m.active_days === 0) return null;
  const parts = [
    m.tasks ? countText(m.tasks, ["задача", "задачи", "задач"]) : "",
    m.content ? countText(m.content, ["материал", "материала", "материалов"]) : "",
    countText(m.late, ["просрочка", "просрочки", "просрочек"]),
    m.best_place ? `${m.best_place}-е место в соревновании` : "",
  ].filter(Boolean);
  return `Ваш ${monthName(m.from)}: ${parts.join(", ")}`;
}

/** Итоги месяца показываем на главной в первые дни нового месяца. */
export const showMonthSummary = (today: string) => Number(today.slice(8, 10)) <= 5;
