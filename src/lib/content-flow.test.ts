import { describe, expect, it } from "vitest";
import { contentNextOptions, statusBeforeHold } from "./content-flow";

describe("пауза материала", () => {
  it("возвращает статус до паузы", () => {
    const h = [
      { from_status: "editing", to_status: "paused" },
      { from_status: "shot", to_status: "editing" },
    ];
    expect(statusBeforeHold(h)).toBe("editing");
  });

  it("пауза → блокировка: берётся статус до первой паузы", () => {
    const h = [
      { from_status: "paused", to_status: "blocked" },
      { from_status: "design", to_status: "paused" },
      { from_status: "editing", to_status: "design" },
    ];
    expect(statusBeforeHold(h)).toBe("design");
  });

  it("без истории — «в работе»", () => {
    expect(statusBeforeHold([])).toBe("in_progress");
  });

  it("исполнитель видит только один путь назад, не «сделано»", () => {
    const h = [{ from_status: "review", to_status: "paused" }];
    expect(contentNextOptions("paused", h, false)).toEqual(["review"]);
    expect(contentNextOptions("paused", h, false)).not.toContain("done");
  });

  it("руководитель видит статус до паузы и «в работе»", () => {
    const h = [{ from_status: "editing", to_status: "blocked" }];
    expect(contentNextOptions("blocked", h, true)).toEqual(["editing", "in_progress"]);
    expect(contentNextOptions("blocked", [], true)).toEqual(["in_progress"]);
  });

  it("обычные статусы — как в карте переходов", () => {
    expect(contentNextOptions("review", [], false)).toEqual(["done", "revision"]);
  });
});
