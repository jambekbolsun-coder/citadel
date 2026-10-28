import { describe as suite, expect, it } from "vitest";
import { describe, expand, MAX_OCCURRENCES, ruleFromForm } from "./recurrence";

suite("expand", () => {
  it("каждый день, 3 раза", () => {
    expect(expand("2026-11-02", { freq: "daily", interval: 1, count: 3 })).toEqual(["2026-11-02", "2026-11-03", "2026-11-04"]);
  });
  it("каждые 2 недели по пн и чт до даты", () => {
    // 2026-11-02 — понедельник
    expect(expand("2026-11-02", { freq: "weekly", interval: 2, weekdays: [1, 4], until: "2026-11-30" })).toEqual([
      "2026-11-02", "2026-11-05", "2026-11-16", "2026-11-19", "2026-11-30",
    ]);
  });
  it("еженедельно начиная со среды: дни раньше старта в первой неделе пропускаются", () => {
    expect(expand("2026-11-04", { freq: "weekly", interval: 1, weekdays: [1, 3], count: 3 })).toEqual(["2026-11-04", "2026-11-09", "2026-11-11"]);
  });
  it("31-го каждый месяц — в коротких месяцах последний день", () => {
    expect(expand("2026-01-31", { freq: "monthly", interval: 1, monthly: "day", count: 3 })).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
  });
  it("первый понедельник месяца", () => {
    // 2026-11-02 — первый понедельник ноября; декабрь → 07.12, январь → 04.01
    expect(expand("2026-11-02", { freq: "monthly", interval: 1, monthly: "nth", count: 3 })).toEqual(["2026-11-02", "2026-12-07", "2027-01-04"]);
  });
  it("последняя пятница месяца", () => {
    expect(expand("2026-11-27", { freq: "monthly", interval: 1, monthly: "last", count: 3 })).toEqual(["2026-11-27", "2026-12-25", "2027-01-29"]);
  });
  it("пятый четверг есть не в каждом месяце — такие месяцы пропускаются", () => {
    // 2026-10-29 — пятый четверг октября; следующий пятый четверг — 31.12.2026
    expect(expand("2026-10-29", { freq: "monthly", interval: 1, monthly: "nth", count: 2 })).toEqual(["2026-10-29", "2026-12-31"]);
  });
  it("не больше лимита", () => {
    expect(expand("2026-01-01", { freq: "daily", interval: 1, until: "2030-01-01" })).toHaveLength(MAX_OCCURRENCES);
  });
});

suite("describe", () => {
  it("человекочитаемо", () => {
    expect(describe("2026-11-02", { freq: "weekly", interval: 1, weekdays: [1, 4], count: 8 })).toBe("Каждую неделю: пн, чт, 8 раз");
    expect(describe("2026-11-04", { freq: "monthly", interval: 1, monthly: "nth", until: "2027-03-01" })).toBe("Каждый месяц, первая среда до 01.03.2027");
    expect(describe("2026-11-29", { freq: "monthly", interval: 1, monthly: "last", count: 3 })).toBe("Каждый месяц, последнее воскресенье, 3 раза");
  });
});

suite("ruleFromForm", () => {
  it("без повтора — null", () => {
    expect(ruleFromForm(new FormData())).toBeNull();
  });
  it("требует количество ≥ 2", () => {
    const fd = new FormData();
    fd.set("repeat_freq", "daily");
    fd.set("repeat_count", "1");
    expect(() => ruleFromForm(fd)).toThrow();
  });
});
