import { describe, expect, it } from "vitest";
import { activeDailyBudget, activeDays, cpl, dailyPlanOn, nextCheck, planForPeriod, spendTotals, type BudgetEvent, type SpendEntry, type StatusEvent } from "./ads-math";
import { moneyMulti } from "./format";

const usd = (n: number) => n * 100;

describe("дневной бюджет креативов (сценарий 2 ТЗ)", () => {
  const creatives = [
    { status: "active", daily_budget_minor: usd(5), currency: "USD" },
    { status: "active", daily_budget_minor: usd(3), currency: "USD" },
    { status: "paused", daily_budget_minor: usd(2), currency: "USD" },
  ];
  it("$5 + $3 активны, $2 на паузе → $8/день, а не $10", () => {
    expect(activeDailyBudget(creatives, { status: "active", daily_budget_minor: null, currency: "USD" })).toEqual({ USD: usd(8) });
  });
  it("кампания на паузе — активного плана нет", () => {
    expect(activeDailyBudget(creatives, { status: "paused", daily_budget_minor: null, currency: "USD" })).toEqual({});
  });
  it("разные валюты не складываются", () => {
    expect(activeDailyBudget([...creatives, { status: "active", daily_budget_minor: 50000, currency: "KGS" }])).toEqual({ USD: usd(8), KGS: 50000 });
  });
  it("возобновление третьего видео повышает план до $10 только с даты возобновления", () => {
    const status: StatusEvent[] = [
      { creative_id: null, to_status: "active", effective_on: "2026-10-01" },
      { creative_id: "a", to_status: "active", effective_on: "2026-10-01" },
      { creative_id: "b", to_status: "active", effective_on: "2026-10-01" },
      { creative_id: "c", to_status: "paused", effective_on: "2026-10-01" },
      { creative_id: "c", to_status: "active", effective_on: "2026-10-05" },
    ];
    const budget: BudgetEvent[] = [
      { creative_id: "a", daily_budget_minor: usd(5), currency: "USD", effective_from: "2026-10-01" },
      { creative_id: "b", daily_budget_minor: usd(3), currency: "USD", effective_from: "2026-10-01" },
      { creative_id: "c", daily_budget_minor: usd(2), currency: "USD", effective_from: "2026-10-01" },
    ];
    expect(dailyPlanOn("2026-10-04", ["a", "b", "c"], status, budget)).toEqual({ USD: usd(8) });
    expect(dailyPlanOn("2026-10-05", ["a", "b", "c"], status, budget)).toEqual({ USD: usd(10) });
    // 4 дня × $8 + 2 дня × $10 = $52 — план, а не факт
    expect(planForPeriod({ from: "2026-10-01", to: "2026-10-06", historyFrom: "2026-10-01", creativeIds: ["a", "b", "c"], status, budget }).plan).toEqual({ USD: usd(52) });
  });
  it("изменение бюджета действует с новой даты, прошлые дни не пересчитываются", () => {
    const status: StatusEvent[] = [{ creative_id: null, to_status: "active", effective_on: "2026-10-01" }, { creative_id: "a", to_status: "active", effective_on: "2026-10-01" }];
    const budget: BudgetEvent[] = [
      { creative_id: "a", daily_budget_minor: usd(5), currency: "USD", effective_from: "2026-10-01" },
      { creative_id: "a", daily_budget_minor: usd(7), currency: "USD", effective_from: "2026-10-03" },
    ];
    expect(planForPeriod({ from: "2026-10-01", to: "2026-10-03", historyFrom: null, creativeIds: ["a"], status, budget }).plan).toEqual({ USD: usd(17) });
  });
});

describe("активные дни (сценарий 4 ТЗ)", () => {
  const status: StatusEvent[] = [
    { creative_id: null, to_status: "active", effective_on: "2026-10-01" },
    { creative_id: null, to_status: "paused", effective_on: "2026-10-04" },
    { creative_id: null, to_status: "active", effective_on: "2026-10-06" },
  ];
  it("10 календарных дней, из них 2 на паузе → 8 активных", () => {
    expect(activeDays({ from: "2026-10-01", to: "2026-10-10", historyFrom: "2026-10-01", status })).toEqual({ calendar: 10, active: 8 });
  });
  it("без полной истории статусов активные дни не выдумываются", () => {
    expect(activeDays({ from: "2026-09-25", to: "2026-10-10", historyFrom: "2026-10-01", status }).active).toBeNull();
  });
  it("план не превращается в факт: записей нет — факт пуст", () => {
    expect(spendTotals([]).spend).toEqual({});
    expect(moneyMulti(spendTotals([]).spend)).toBe("—");
  });
});

describe("факт расходов без двойного учёта (сценарии 3, 5 ТЗ)", () => {
  const e = (x: Partial<SpendEntry>): SpendEntry => ({ creative_id: null, day: "2026-10-10", currency: "USD", spend_minor: 0, leads: 0, ...x });
  it("$12 + $8 по двум видео = $20", () => {
    const t = spendTotals([e({ creative_id: "a", spend_minor: usd(12) }), e({ creative_id: "b", spend_minor: usd(8) })]);
    expect(t.spend).toEqual({ USD: usd(20) });
    expect(t.unallocated).toEqual({});
  });
  it("$20 общим, затем распределено $12 + $8 — итог остаётся $20 (исходная запись исправлена, не считается)", () => {
    const t = spendTotals([
      e({ spend_minor: usd(20), superseded_at: "2026-10-10T10:00:00Z" }),
      e({ creative_id: "a", spend_minor: usd(12) }),
      e({ creative_id: "b", spend_minor: usd(8) }),
    ]);
    expect(t.spend).toEqual({ USD: usd(20) });
  });
  it("частичное распределение показывает «не распределено»", () => {
    const t = spendTotals([e({ spend_minor: usd(20), superseded_at: "x" }), e({ creative_id: "a", spend_minor: usd(12) }), e({ spend_minor: usd(8) })]);
    expect(t.spend).toEqual({ USD: usd(20) });
    expect(t.unallocated).toEqual({ USD: usd(8) });
    expect(t.byCreative.a.spend).toEqual({ USD: usd(12) });
  });
  it("$75 и 3 000 сом — две суммы, не «3 075»", () => {
    const t = spendTotals([e({ spend_minor: usd(75) }), e({ currency: "KGS", spend_minor: 300000 })]);
    expect(t.spend).toEqual({ USD: usd(75), KGS: 300000 });
    const s = moneyMulti(t.spend);
    expect(s).toContain("75 USD");
    expect(s).toMatch(/3\s000 сом/);
    expect(s).not.toMatch(/3\s?075/);
  });
  it("фильтр периода включительно", () => {
    const t = spendTotals([e({ day: "2026-10-01", spend_minor: 100 }), e({ day: "2026-10-31", spend_minor: 200 }), e({ day: "2026-11-01", spend_minor: 400 })], "2026-10-01", "2026-10-31");
    expect(t.spend).toEqual({ USD: 300 });
  });
});

describe("CPL (сценарий 6 ТЗ)", () => {
  it("0 заявок → нет значения (не 0 и не бесконечность)", () => {
    expect(cpl(usd(50), 0)).toBeNull();
  });
  it("$50 и 10 заявок → $5", () => {
    expect(cpl(usd(50), 10)).toBe(usd(5));
  });
});

describe("плановая проверка", () => {
  it("последняя запись + регламент", () => {
    expect(nextCheck("2026-10-10", "2026-10-01", 2)).toBe("2026-10-12");
    expect(nextCheck(null, "2026-10-01", 3)).toBe("2026-10-04");
    expect(nextCheck(null, null, 2)).toBeNull();
  });
});
