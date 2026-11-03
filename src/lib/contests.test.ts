import { describe, expect, it } from "vitest";
import { DEFAULT_WEIGHTS, daysLeft, medal, metricText, monthBounds, phaseOf } from "./contests";

describe("сезоны соревнований", () => {
  const c = { status: "active" as const, starts_on: "2026-11-01", ends_on: "2026-11-30" };
  it("фазы по датам: итоги — только после последнего дня", () => {
    expect(phaseOf(c, "2026-10-31")).toBe("upcoming");
    expect(phaseOf(c, "2026-11-15")).toBe("running");
    expect(phaseOf(c, "2026-11-30")).toBe("running");
    expect(phaseOf(c, "2026-12-01")).toBe("ended");
    expect(phaseOf({ ...c, status: "revealed" }, "2026-11-15")).toBe("revealed");
    expect(phaseOf({ ...c, status: "cancelled" }, "2026-11-15")).toBe("cancelled");
  });
  it("дни до конца, месяц по умолчанию, медали", () => {
    expect(daysLeft("2026-11-30", "2026-11-20")).toBe(10);
    expect(daysLeft("2026-11-30", "2026-12-05")).toBe(0);
    expect(monthBounds("2026-02-10")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(monthBounds("2028-02-10")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect([medal(1), medal(2), medal(3), medal(4), medal(null)]).toEqual(["🥇", "🥈", "🥉", "", ""]);
  });
  it("показатели: нет данных и веса по умолчанию = 100", () => {
    expect(metricText(-100)).toBe("—");
    expect(metricText(85)).toBe("85%");
    expect(Object.values(DEFAULT_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
  });
});
