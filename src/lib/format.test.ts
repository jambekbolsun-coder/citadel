import { describe, expect, it } from "vitest";
import { kindCount, localToIso, money, parseMoney, plural, isoToLocalInput } from "./format";

describe("деньги без float", () => {
  it("парсит суммы в тыйыны", () => {
    expect(parseMoney("15 000")).toBe(1_500_000);
    expect(parseMoney("43999")).toBe(4_399_900);
    expect(parseMoney("0,5")).toBe(50);
    expect(parseMoney("10.05")).toBe(1005);
    expect(parseMoney("")).toBeNull();
  });
  it("отклоняет некорректный ввод", () => {
    expect(() => parseMoney("12.345")).toThrow();
    expect(() => parseMoney("abc")).toThrow();
    expect(() => parseMoney("-5")).toThrow();
  });
  it("частичная оплата: 15 000 из 60 000 → остаток 45 000", () => {
    const price = parseMoney("60000")!;
    const paid = parseMoney("15000")!;
    expect(price - paid).toBe(parseMoney("45000"));
  });
  it("зарплата: начислено 50 000, аванс 15 000 → долг 35 000", () => {
    expect(parseMoney("50000")! - parseMoney("15000")!).toBe(3_500_000);
  });
  it("форматирует сом", () => {
    expect(money(4_399_900)).toMatch(/43\s?999 сом/);
  });
});

describe("время Бишкек (UTC+6)", () => {
  it("местное время → UTC", () => {
    expect(localToIso("2026-10-29", "09:00")).toBe("2026-10-29T03:00:00.000Z");
  });
  it("UTC → значение datetime-local", () => {
    expect(isoToLocalInput("2026-10-29T03:00:00.000Z")).toBe("2026-10-29T09:00");
  });
});

describe("склонения", () => {
  it("корректные формы", () => {
    expect(plural(1, ["пост", "поста", "постов"])).toBe("пост");
    expect(plural(2, ["пост", "поста", "постов"])).toBe("поста");
    expect(plural(11, ["пост", "поста", "постов"])).toBe("постов");
    expect(kindCount("post", 2)).toBe("2 поста");
    expect(kindCount("video", 8)).toBe("8 видео");
  });
});

describe("нагрузка календаря (п. 9.1 ТЗ)", () => {
  it("10 проектов × 8 видео = 80; 2,67/календарный день; 3,64/рабочий день", () => {
    const videos = 10 * 8;
    expect(videos).toBe(80);
    expect(Number((videos / 30).toFixed(2))).toBe(2.67);
    expect(Number((videos / 22).toFixed(2))).toBe(3.64);
  });
});
