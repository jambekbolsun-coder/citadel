import { describe, expect, it } from "vitest";
import { fetchAll } from "./fetch-all";

// Имитация PostgREST: не больше `cap` строк за запрос, как max_rows = 1000 у Supabase
function fakeTable(total: number, cap = 1000) {
  const rows = Array.from({ length: total }, (_, i) => ({ id: i }));
  const calls: [number, number][] = [];
  const page = async (from: number, to: number) => {
    calls.push([from, to]);
    return { data: rows.slice(from, Math.min(to + 1, from + cap)), error: null };
  };
  return { page, calls };
}

describe("загрузка всех строк частями", () => {
  it("2 500 строк при потолке 1000 — все строки, 3 запроса", async () => {
    const t = fakeTable(2500);
    const r = await fetchAll<{ id: number }>(t.page);
    expect(r.data).toHaveLength(2500);
    expect(r.data[2499].id).toBe(2499);
    expect(t.calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
    expect(r.truncated).toBe(false);
  });

  it("ровно 1000 строк — один лишний пустой запрос, без потерь", async () => {
    const t = fakeTable(1000);
    const r = await fetchAll<{ id: number }>(t.page);
    expect(r.data).toHaveLength(1000);
    expect(t.calls).toHaveLength(2);
  });

  it("пустая таблица", async () => {
    expect((await fetchAll(fakeTable(0).page)).data).toEqual([]);
  });

  it("ошибка — возвращается, загруженное не теряется", async () => {
    let n = 0;
    const r = await fetchAll(async () => (n++ === 0 ? { data: Array(1000).fill({}), error: null } : { data: null, error: { message: "permission denied" } }));
    expect(r.error?.message).toBe("permission denied");
    expect(r.data).toHaveLength(1000);
  });

  it("предохранитель max — помечает обрезку", async () => {
    const r = await fetchAll(fakeTable(5000).page, { max: 2000 });
    expect(r.data).toHaveLength(2000);
    expect(r.truncated).toBe(true);
  });
});
