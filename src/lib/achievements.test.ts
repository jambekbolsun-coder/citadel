import { describe, expect, it } from "vitest";
import { BADGES, badgeState, monthName, monthSummaryText, showMonthSummary, streakText } from "./achievements";

const zero = { tasks_done: 0, videos: 0, content: 0, story_days: 0, active_days: 0, contest_top3: 0, contest_wins: 0, best_streak: 0 };
const by = (k: string) => BADGES.find((b) => b.key === k)!;

describe("значки достижений", () => {
  it("ступени и прогресс до следующей", () => {
    expect(badgeState(by("videos"), { ...zero, videos: 0 })).toMatchObject({ tier: 0, next: 10, progress: 0 });
    expect(badgeState(by("videos"), { ...zero, videos: 5 })).toMatchObject({ tier: 0, next: 10, progress: 0.5 });
    expect(badgeState(by("videos"), { ...zero, videos: 10 })).toMatchObject({ tier: 1, next: 50, progress: 0 });
    expect(badgeState(by("videos"), { ...zero, videos: 30 })).toMatchObject({ tier: 1, next: 50, progress: 0.5 });
    expect(badgeState(by("videos"), { ...zero, videos: 999 })).toMatchObject({ tier: 3, next: null, progress: 1 });
  });
  it("серия без просрочек — по лучшей серии (не пропадает после срыва)", () => {
    expect(badgeState(by("streak"), { ...zero, best_streak: 30 }).tier).toBe(2);
  });
  it("у каждого значка пороги растут", () => {
    for (const b of BADGES) expect(b.tiers[0] < b.tiers[1] && b.tiers[1] < b.tiers[2]).toBe(true);
    expect(new Set(BADGES.map((b) => b.key)).size).toBe(BADGES.length);
  });
});

describe("серия и итоги месяца", () => {
  it("подписи серии", () => {
    expect(streakText({ streak_days: 1, overdue_now: false })).toBe("1 рабочий день без просрочек");
    expect(streakText({ streak_days: 12, overdue_now: false })).toBe("12 рабочих дней без просрочек");
    expect(streakText({ streak_days: 0, overdue_now: true })).toMatch(/прервалась/);
  });
  it("итоги месяца", () => {
    expect(monthName("2026-10-01")).toBe("октябрь");
    expect(monthSummaryText({ from: "2026-10-01", tasks: 24, content: 0, late: 0, active_days: 20, best_place: 3 }))
      .toBe("Ваш октябрь: 24 задачи, 0 просрочек, 3-е место в соревновании");
    expect(monthSummaryText({ from: "2026-10-01", tasks: 0, content: 0, late: 0, active_days: 0, best_place: null })).toBeNull();
    expect([showMonthSummary("2026-11-01"), showMonthSummary("2026-11-05"), showMonthSummary("2026-11-06")]).toEqual([true, true, false]);
  });
});
