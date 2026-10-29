// Расчёты рекламного учёта. Всё в целых минорных единицах, валюты никогда не складываются между собой.
//
// Формулы (документированы здесь же, тесты — ads-math.test.ts):
//  • Дневной план кампании на день D = сумма дневных бюджетов креативов, активных в D, по каждой валюте;
//    если у кампании нет креативов — её собственный дневной бюджет. Кампания не в статусе «активна» → план 0.
//  • План за период = сумма дневных планов по дням периода (только дни с известной историей статусов).
//  • Факт = сумма ДЕЙСТВУЮЩИХ записей журнала расходов (исправленные/распределённые не считаются).
//    Никогда не подменяется «бюджет × дни».
//  • CPL = факт / обращения, только если обращений > 0; иначе — нет значения («Нет заявок»).

export type Money = Record<string, number>; // валюта → сумма в минорных единицах

export type StatusEvent = { creative_id: string | null; to_status: string; effective_on: string; created_at?: string };
export type BudgetEvent = { creative_id: string | null; daily_budget_minor: number; currency: string; effective_from: string; created_at?: string };
export type SpendEntry = {
  id?: string;
  creative_id: string | null;
  day: string;
  currency: string;
  spend_minor: number;
  leads: number;
  impressions?: number | null;
  clicks?: number | null;
  superseded_at?: string | null;
};

const DAY = 86_400_000;
export function addDays(day: string, n: number): string {
  return new Date(Date.parse(day + "T00:00:00Z") + n * DAY).toISOString().slice(0, 10);
}
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / DAY);
}
function eachDay(from: string, to: string, fn: (d: string) => void) {
  for (let d = from; d <= to; d = addDays(d, 1)) fn(d);
}

function ordered<T extends { created_at?: string }>(list: T[], key: (x: T) => string) {
  return [...list].sort((a, b) => key(a).localeCompare(key(b)) || (a.created_at ?? "").localeCompare(b.created_at ?? ""));
}

/** Статус сущности на день: последнее изменение с датой действия ≤ дня. null — истории на этот день нет. */
export function statusOn(events: StatusEvent[], creativeId: string | null, day: string): string | null {
  let s: string | null = null;
  for (const e of ordered(events.filter((x) => x.creative_id === creativeId), (x) => x.effective_on)) if (e.effective_on <= day) s = e.to_status;
  return s;
}

export function budgetOn(events: BudgetEvent[], creativeId: string | null, day: string): { amount: number; currency: string } | null {
  let b: { amount: number; currency: string } | null = null;
  for (const e of ordered(events.filter((x) => x.creative_id === creativeId), (x) => x.effective_from)) {
    if (e.effective_from <= day) b = { amount: Number(e.daily_budget_minor), currency: e.currency };
  }
  return b;
}

export function addTo(m: Money, currency: string, amount: number) {
  m[currency] = (m[currency] ?? 0) + amount;
  return m;
}

/** Дневной план кампании на день: активные креативы своей валютой; без креативов — бюджет кампании. */
export function dailyPlanOn(day: string, creativeIds: string[], status: StatusEvent[], budget: BudgetEvent[]): Money {
  const out: Money = {};
  if (statusOn(status, null, day) !== "active") return out;
  if (!creativeIds.length) {
    const b = budgetOn(budget, null, day);
    if (b && b.amount > 0) addTo(out, b.currency, b.amount);
    return out;
  }
  for (const id of creativeIds) {
    if (statusOn(status, id, day) !== "active") continue;
    const b = budgetOn(budget, id, day);
    if (b && b.amount > 0) addTo(out, b.currency, b.amount);
  }
  return out;
}

/** Текущий активный дневной бюджет по креативам (без истории): $5 + $3 + $2 (пауза) = $8. */
export function activeDailyBudget(creatives: { status: string; daily_budget_minor: number; currency: string }[], campaign?: { status: string; daily_budget_minor: number | null; currency: string }): Money {
  const out: Money = {};
  if (campaign && campaign.status !== "active") return out;
  if (!creatives.length) {
    if (campaign?.daily_budget_minor) addTo(out, campaign.currency, Number(campaign.daily_budget_minor));
    return out;
  }
  for (const c of creatives) if (c.status === "active" && Number(c.daily_budget_minor) > 0) addTo(out, c.currency, Number(c.daily_budget_minor));
  return out;
}

/** План за период (включительно). Дни раньше historyFrom (история неизвестна) не считаются, а возвращаются отдельно. */
export function planForPeriod(opts: { from: string; to: string; historyFrom: string | null; creativeIds: string[]; status: StatusEvent[]; budget: BudgetEvent[] }): { plan: Money; unknownDays: number } {
  const plan: Money = {};
  let unknownDays = 0;
  eachDay(opts.from, opts.to, (d) => {
    if (opts.historyFrom && d < opts.historyFrom) {
      unknownDays++;
      return;
    }
    for (const [cur, v] of Object.entries(dailyPlanOn(d, opts.creativeIds, opts.status, opts.budget))) addTo(plan, cur, v);
  });
  return { plan, unknownDays };
}

/** Календарные и реально активные дни кампании за период. active = null, если история за период неполная. */
export function activeDays(opts: { from: string; to: string; historyFrom: string | null; status: StatusEvent[] }): { calendar: number; active: number | null } {
  const calendar = daysBetween(opts.from, opts.to) + 1;
  if (calendar <= 0) return { calendar: 0, active: 0 };
  if (opts.historyFrom && opts.from < opts.historyFrom) return { calendar, active: null };
  let active = 0;
  eachDay(opts.from, opts.to, (d) => {
    if (statusOn(opts.status, null, d) === "active") active++;
  });
  return { calendar, active };
}

export type SpendTotals = {
  spend: Money;
  leads: Record<string, number>; // обращения по валюте записи — для честного CPL
  leadsTotal: number;
  impressions: number;
  clicks: number;
  unallocated: Money; // общий расход кампании, не разнесённый по креативам
  byCreative: Record<string, { spend: Money; leads: number; impressions: number; clicks: number }>;
  days: number; // дней, за которые есть записи
  lastDay: string | null;
};

/** Итоги только по действующим записям; фильтр периода — включительно. */
export function spendTotals(entries: SpendEntry[], from?: string, to?: string): SpendTotals {
  const t: SpendTotals = { spend: {}, leads: {}, leadsTotal: 0, impressions: 0, clicks: 0, unallocated: {}, byCreative: {}, days: 0, lastDay: null };
  const days = new Set<string>();
  for (const e of entries) {
    if (e.superseded_at) continue;
    if ((from && e.day < from) || (to && e.day > to)) continue;
    const s = Number(e.spend_minor);
    addTo(t.spend, e.currency, s);
    t.leads[e.currency] = (t.leads[e.currency] ?? 0) + e.leads;
    t.leadsTotal += e.leads;
    t.impressions += e.impressions ?? 0;
    t.clicks += e.clicks ?? 0;
    days.add(e.day);
    if (!t.lastDay || e.day > t.lastDay) t.lastDay = e.day;
    if (!e.creative_id) addTo(t.unallocated, e.currency, s);
    else {
      const c = (t.byCreative[e.creative_id] ??= { spend: {}, leads: 0, impressions: 0, clicks: 0 });
      addTo(c.spend, e.currency, s);
      c.leads += e.leads;
      c.impressions += e.impressions ?? 0;
      c.clicks += e.clicks ?? 0;
    }
  }
  t.days = days.size;
  return t;
}

/** CPL в минорных единицах; null — обращений нет (показываем «Нет заявок», а не 0 и не ∞). */
export function cpl(spendMinor: number, leads: number): number | null {
  if (!leads || leads <= 0) return null;
  return Math.round(spendMinor / leads);
}

/** Следующая плановая проверка: последняя запись (или старт) + регламент. */
export function nextCheck(lastDay: string | null, startedOn: string | null, everyDays: number): string | null {
  const base = lastDay ?? startedOn;
  return base ? addDays(base, Math.max(1, everyDays)) : null;
}

export function nonZero(m: Money): [string, number][] {
  return Object.entries(m).filter(([, v]) => v !== 0).sort(([a], [b]) => (a === "USD" ? -1 : b === "USD" ? 1 : a.localeCompare(b)));
}
