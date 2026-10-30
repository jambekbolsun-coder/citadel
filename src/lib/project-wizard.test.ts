import { describe, expect, it } from "vitest";
import { formatPhone, normalizePhone, phoneKey, phoneProblem } from "./phone";
import { applyTariff, buildPayload, defaultName, initialState, kindFromTariff, moneySummary, stepError, type Tariff, type WizardState } from "./project-wizard";
import { priceText, slidePrice, type PublicTariff } from "./site-model";
import DEFAULTS from "./site-defaults.json";

const T = (p: Partial<Tariff>): Tariff => ({ id: "t", code: "pro", name: "Про", version_id: "v1", price_minor: 4399900, currency: "KGS", period_type: "monthly", period_months: 1, composition: { video: 5 }, stories_method: null, notes: null, ...p });
const base = (): WizardState => initialState("me", "2026-10-30");
const withClient = (s: WizardState): WizardState => ({ ...s, client: { ...s.client, contact_name: "Асанов Бекжан", phone: "0555 123 456", company_name: "Kausar" } });

describe("телефоны (как public.normalize_phone в БД)", () => {
  it("кыргызские форматы приводятся к +996XXXXXXXXX", () => {
    for (const v of ["0555 123 456", "555123456", "+996 555 123 456", "996555123456", "(0555) 12-34-56"]) expect(normalizePhone(v)).toBe("+996555123456");
  });
  it("международные номера сохраняются с кодом страны", () => {
    expect(normalizePhone("+7 916 123 45 67")).toBe("+79161234567");
    expect(normalizePhone("+1 (415) 555-0100")).toBe("+14155550100");
  });
  it("пусто → null; мусор → понятная ошибка", () => {
    expect(normalizePhone("  ")).toBeNull();
    expect(() => normalizePhone("12345")).toThrow(/Некорректный номер/);
    expect(phoneProblem("12")).toMatch(/Некорректный номер/);
    expect(phoneProblem("")).toBe("Укажите номер телефона");
  });
  it("ключ дублей одинаков для разных записей одного номера", () => {
    expect(phoneKey("0555 123 456")).toBe(phoneKey("+996555123456"));
    expect(formatPhone("+996555123456")).toBe("+996 555 123 456");
  });
});

describe("мастер «Добавить проект»", () => {
  it("шаг 1: пустое ФИО и неверный телефон — человеческие сообщения", () => {
    expect(stepError(0, base())).toBe("Укажите ФИО контактного лица");
    const s = withClient(base());
    expect(stepError(0, { ...s, client: { ...s.client, phone: "123" } })).toMatch(/Некорректный номер/);
    expect(stepError(0, s)).toBeNull();
    expect(stepError(0, { ...base(), mode: "existing" })).toMatch(/Выберите клиента/);
  });
  it("разовый тариф не превращается в месячный проект", () => {
    expect(kindFromTariff({ period_type: "one_time" })).toBe("one_time");
    const s = applyTariff(base(), T({ code: "startup", period_type: "one_time", price_minor: 1550000, composition: { video: 2, post: 2 } }));
    expect(s.kind).toBe("one_time");
    expect(s.composition).toEqual({ video: "2", post: "2" });
    expect(s.price).toBe("15500");
  });
  it("месячный тариф подставляет договорный объём и метод сторис", () => {
    const s = applyTariff(base(), T({ code: "pro_max", price_minor: 6000000, composition: { video: 8, story: 120 }, stories_method: "fixed_per_period" }));
    expect(s.kind).toBe("monthly");
    expect(s.composition.story).toBe("120");
    expect(s.stories_method).toBe("fixed_per_period");
  });
  it("частичная оплата: заявлено ≠ оплачено, остаток считается от подтверждённой суммы", () => {
    const m = moneySummary({ price: "43 999", paid: "15000" });
    expect(m).toEqual({ price: 4399900, declared: 1500000, confirmed: 0, remainder: 4399900 });
    expect(stepError(2, { ...base(), price: "10000", paid: "15000" })).toMatch(/больше стоимости/);
  });
  it("запрос: суммы в тыйынах, телефон нормализован, ключ идемпотентности передан", () => {
    const s = { ...applyTariff(withClient(base()), T({})), paid: "15 000", next_payment_on: "2026-11-10" };
    const p = buildPayload(s, "key-1");
    expect(p.idempotency_key).toBe("key-1");
    expect(p.price_minor).toBe(4399900);
    expect(p.paid_minor).toBe(1500000);
    expect((p.client as { phone: string }).phone).toBe("+996555123456");
    expect(p.client_id).toBe("");
    expect(p.composition).toEqual({ video: 5 });
  });
  it("выбранный клиент из базы не перезаписывается без явного флажка", () => {
    const s: WizardState = { ...base(), mode: "existing", existing: { id: "c1", company_name: "Vent Fasad", contact_name: null, phone: null, niche: null }, price: "0" };
    const p = buildPayload(s, "k");
    expect(p.client_id).toBe("c1");
    expect(p.client).toEqual({});
    expect(p.update_client).toBe(false);
    expect(defaultName(s)).toBe("Vent Fasad");
  });
  it("некорректная сумма — понятная ошибка, а не NaN", () => {
    expect(stepError(1, { ...base(), price: "сорок" })).toMatch(/цифрами/);
    expect(stepError(1, { ...base(), price: "" })).toMatch(/Укажите стоимость/);
  });
});

describe("цены на сайте", () => {
  const tariffs: PublicTariff[] = [{ id: "1", code: "pro", name: "Про", price_on_request: false, price_minor: 4399900, currency: "KGS", period_type: "monthly", composition: {}, description: null }];
  it("формат прайса как в презентации", () => {
    expect(priceText(1050000)).toBe("10 500");
    expect(priceText(30000000)).toBe("300 000");
  });
  it("пустая цена в CMS берётся из справочника; расхождение подсвечивается", () => {
    expect(slidePrice({ tariff_code: "pro" }, tariffs)).toEqual({ text: "43 999", mismatch: null });
    expect(slidePrice({ tariff_code: "pro", price: "43 999" }, tariffs).mismatch).toBeNull();
    expect(slidePrice({ tariff_code: "pro", price: "45 000" }, tariffs).mismatch?.code).toBe("pro");
  });
  it("контент по умолчанию = 15 страниц презентации с обязательными сносками", () => {
    const d = DEFAULTS as { key: string; content: { footnote?: string; price?: string; title?: string } }[];
    expect(d).toHaveLength(15);
    const text = JSON.stringify(d);
    for (const must of ["МАРКЕТИНГ,\\nКОТОРЫЙ\\nПРОДАЁТ.", "ТАРИФЫ ОТ 10 500 СОМ", "10-20 ЛИДОВ КАЖДЫЙ ДЕНЬ*", "*При согласованном бюджете, сроке и критериях целевого лида.", "400-1 200", "*Диапазон зависит от ниши, цены, оффера и аудитории; критерии фиксируются в договоре.", "ОБСУДИТЬ ПРОЕКТ", "1 440", "DJI OSMO POCKET 4", "НЕ МАКЕТЫ."]) {
      expect(text).toContain(must);
    }
  });
});
