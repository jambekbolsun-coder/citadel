import { describe, expect, it } from "vitest";
import { PAGE, pageRange, pageSlice } from "./paging";
import { cleanQuery, searchScope } from "./search";

describe("пагинация", () => {
  it("запрашивает PAGE + 1 строку (range включительно)", () => {
    const r = pageRange(1);
    expect(r).toEqual({ from: 0, to: PAGE, page: 1 });
    expect(r.to - r.from + 1).toBe(PAGE + 1);
  });
  it("31-я запись открывается на второй странице без пропусков и дублей", () => {
    const all = Array.from({ length: 75 }, (_, i) => i + 1);
    const seen: number[] = [];
    for (let p = 1; ; p++) {
      const { from, to } = pageRange(p);
      const { items, hasMore } = pageSlice(all.slice(from, to + 1));
      seen.push(...items);
      if (!hasMore) break;
    }
    expect(seen).toEqual(all);
    expect(pageSlice(all.slice(pageRange(2).from, pageRange(2).to + 1)).items[0]).toBe(31);
  });
  it("ровно 30 записей — без кнопки «Далее»", () => {
    expect(pageSlice(Array.from({ length: 30 })).hasMore).toBe(false);
    expect(pageSlice(Array.from({ length: 31 })).hasMore).toBe(true);
  });
  it("мусор в номере страницы → первая страница", () => {
    expect(pageRange(NaN).page).toBe(1);
    expect(pageRange(-3).page).toBe(1);
    expect(pageRange(2.7).page).toBe(2);
  });
});

describe("поиск", () => {
  it("убирает спецсимволы фильтров PostgREST и LIKE", () => {
    expect(cleanQuery("a%b_c,d(e)f*")).toBe("a b c d e f");
    expect(cleanQuery("  кофе   бишкек ")).toBe("кофе бишкек");
    expect(cleanQuery("x".repeat(100))).toHaveLength(60);
    expect(cleanQuery(null)).toBe("");
  });
  it("клиенты, люди и заявки ищутся только при наличии прав", () => {
    expect(searchScope(() => false)).toEqual({ clients: false, people: false, leads: false });
    expect(searchScope((p) => p === "employees.view")).toEqual({ clients: false, people: true, leads: false });
    expect(searchScope((p) => p === "leads.receive").leads).toBe(true);
  });
});
