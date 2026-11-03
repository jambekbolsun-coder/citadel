// Соревнования сотрудников: подписи показателей, фазы сезона и разбор формы. Расчёт баллов — в БД (contest_compute).

export type MetricKey = "completion" | "discipline" | "quality" | "stories" | "activity";
export const METRICS: { key: MetricKey; label: string; hint: string; def: number }[] = [
  { key: "completion", label: "План выполнен", hint: "сдано из назначенного со сроком в сезоне (задачи «себе» не считаются)", def: 35 },
  { key: "discipline", label: "Вовремя", hint: "сдано до срока", def: 25 },
  { key: "quality", label: "Без правок", hint: "меньше возвратов на доработку", def: 15 },
  { key: "stories", label: "Сторис по плану", hint: "дни, когда дневной план сторис выполнен", def: 10 },
  { key: "activity", label: "Дни в приложении", hint: "рабочие дни, когда сотрудник заходил в приложение", def: 15 },
];
export const DEFAULT_WEIGHTS: Record<MetricKey, number> = Object.fromEntries(METRICS.map((m) => [m.key, m.def])) as Record<MetricKey, number>;

export type Prize = { place: number; amount_minor: number; text: string };
export type Contest = {
  id: string; title: string; description: string | null; starts_on: string; ends_on: string;
  scope: "all" | "departments" | "roles"; scope_ids: string[]; ranking: "overall" | "by_department";
  weights: Record<MetricKey, number>; min_items: number; prizes: Prize[];
  status: "active" | "revealed" | "cancelled"; revealed_at: string | null; bonuses_issued_at: string | null;
};
export type Metrics = Record<string, number>;
export type Row = { user_id: string; full_name: string; group_key: string; group_label: string | null; score: number; eligible: boolean; place: number | null; metrics: Metrics };

export type Phase = "upcoming" | "running" | "ended" | "revealed" | "cancelled";
/** Фаза сезона по датам (Бишкек): итоги можно показать со дня, следующего за ends_on. */
export function phaseOf(c: Pick<Contest, "status" | "starts_on" | "ends_on">, today: string): Phase {
  if (c.status === "cancelled") return "cancelled";
  if (c.status === "revealed") return "revealed";
  if (today < c.starts_on) return "upcoming";
  if (today <= c.ends_on) return "running";
  return "ended";
}
export const PHASE_LABEL: Record<Phase, string> = { upcoming: "скоро начнётся", running: "идёт", ended: "завершён — ждём итогов", revealed: "итоги объявлены", cancelled: "отменён" };

/** Дней до конца сезона включительно (0 — последний день). */
export function daysLeft(endsOn: string, today: string): number {
  return Math.max(0, Math.round((Date.parse(endsOn) - Date.parse(today)) / 86_400_000));
}

/** Значение показателя для показа: −1 из БД = «нет данных». */
export const metricText = (v: number | undefined) => (v === undefined || v < 0 ? "—" : `${v}%`);

export const medal = (place: number | null) => (place === 1 ? "🥇" : place === 2 ? "🥈" : place === 3 ? "🥉" : "");

/** Первый и последний день месяца (для сезона «на месяц» по умолчанию). */
export function monthBounds(today: string): { from: string; to: string } {
  const [y, m] = today.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const p = (n: number) => String(n).padStart(2, "0");
  return { from: `${y}-${p(m)}-01`, to: `${y}-${p(m)}-${p(last)}` };
}
