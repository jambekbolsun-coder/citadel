import { describe, expect, it } from "vitest";
import { routeTemplate, vitalsBatch } from "./vitals";

describe("обезличивание маршрутов", () => {
  it("заменяет uuid и числовые id на :id", () => {
    expect(routeTemplate("/app/tasks/3f2b8c1e-9a4d-4e2b-8c7a-1b2c3d4e5f60")).toBe("/app/tasks/:id");
    expect(routeTemplate("/app/reports/client/42")).toBe("/app/reports/client/:id");
  });
  it("отбрасывает параметры запроса и хэш (там могут быть имена и поисковые фразы)", () => {
    expect(routeTemplate("https://citadel.example/app/search?q=Иванов#x")).toBe("/app/search");
    expect(routeTemplate("/app/calendar?person=3f2b8c1e-9a4d-4e2b-8c7a-1b2c3d4e5f60")).toBe("/app/calendar");
  });
  it("прячет длинные токены приглашений", () => {
    expect(routeTemplate("/invite/AbCdEfGhIjKlMnOpQrStUv123")).toBe("/invite/:id");
  });
  it("результат проходит ограничение таблицы", () => {
    for (const p of ["/", "/app", "/app/settings/profile", "/Приложение/../x", "/a".repeat(200)]) expect(routeTemplate(p)).toMatch(/^\/[a-z0-9/:_-]{0,119}$/);
  });
});

describe("приём пачки замеров", () => {
  const ok = { name: "LCP", value: 1234.5, rating: "good", route: "/app", nav: "navigate", width: 390, conn: "4g", standalone: true };
  it("принимает корректные замеры", () => {
    expect(vitalsBatch.safeParse([ok, { ...ok, name: "route-ready", rating: null }]).success).toBe(true);
  });
  it("отклоняет неизвестные метрики, отрицательные значения и лишние поля не сохраняет", () => {
    expect(vitalsBatch.safeParse([{ ...ok, name: "email" }]).success).toBe(false);
    expect(vitalsBatch.safeParse([{ ...ok, value: -1 }]).success).toBe(false);
    expect(vitalsBatch.safeParse([]).success).toBe(false);
    const r = vitalsBatch.safeParse([{ ...ok, user: "someone@mail" }]);
    expect(r.success && "user" in r.data[0]).toBe(false);
  });
  it("не больше 40 записей за раз", () => {
    expect(vitalsBatch.safeParse(Array.from({ length: 41 }, () => ok)).success).toBe(false);
  });
});
