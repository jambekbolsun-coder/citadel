import { describe, expect, it } from "vitest";
import { balancesByCurrency, cashSummary, contentLeft, invoicePaid, nextPayDate, overpayments, payrollDebt, pieceworkTotal, receivables } from "./money-math";
import { moneyMulti } from "./format";

const som = (n: number) => n * 100;

describe("счёт клиента и возврат (ТЗ 8.2)", () => {
  it("60 000: подтверждено 15 000 → долг 45 000; ещё 45 000 → 0; возврат 5 000 → оплачено 55 000, долг 5 000", () => {
    const pays = [{ kind: "payment", status: "confirmed", amount_minor: som(15000) }];
    expect(som(60000) - invoicePaid(pays)).toBe(som(45000));
    pays.push({ kind: "payment", status: "confirmed", amount_minor: som(45000) });
    expect(som(60000) - invoicePaid(pays)).toBe(0);
    pays.push({ kind: "refund", status: "confirmed", amount_minor: som(5000) });
    expect(invoicePaid(pays)).toBe(som(55000));
    expect(receivables([{ amount_minor: som(60000), paid_minor: invoicePaid(pays), currency: "KGS" }])).toEqual({ KGS: som(5000) });
  });
  it("ожидающий и отклонённый платежи не уменьшают долг", () => {
    expect(invoicePaid([{ kind: "payment", status: "pending", amount_minor: 100 }, { kind: "payment", status: "rejected", amount_minor: 100 }])).toBe(0);
  });
  it("отменённый счёт не участвует в долге, переплата — отдельно и не гасит чужой долг", () => {
    const inv = [
      { amount_minor: som(1000), paid_minor: 0, pay_state: "void" },
      { amount_minor: som(1000), paid_minor: som(1500), currency: "KGS" },
      { amount_minor: som(2000), paid_minor: 0, currency: "KGS" },
    ];
    expect(receivables(inv)).toEqual({ KGS: som(2000) });
    expect(overpayments(inv)).toEqual({ KGS: som(500) });
  });
});

describe("движения по кассам", () => {
  it("покупка камеры 40 000 — одно списание, сторно возвращает расход в ноль", () => {
    const s = cashSummary([{ direction: "out", amount_minor: som(40000), currency: "KGS", source_type: "expense" }]);
    expect(s.expenses).toEqual({ KGS: som(40000) });
    expect(s.net).toEqual({ KGS: -som(40000) });
    const r = cashSummary([
      { direction: "out", amount_minor: som(40000), currency: "KGS", source_type: "expense" },
      { direction: "in", amount_minor: som(40000), currency: "KGS", source_type: "reversal" },
    ]);
    expect(r.expenses).toEqual({ KGS: 0 });
    expect(r.net).toEqual({ KGS: 0 });
  });
  it("касса KGS 100 000 и касса USD 500 — не «100 500 сом»", () => {
    const b = balancesByCurrency([{ currency: "KGS", balance_minor: som(100000) }, { currency: "USD", balance_minor: 50000 }]);
    expect(b).toEqual({ KGS: som(100000), USD: 50000 });
    const text = moneyMulti(b);
    expect(text).toContain("500 USD");
    expect(text).toMatch(/100\s000 сом/);
    expect(text).not.toMatch(/100\s?500/);
  });
  it("поступления, возвраты, зарплаты и денежный поток по валютам", () => {
    const s = cashSummary([
      { direction: "in", amount_minor: som(60000), currency: "KGS", source_type: "payment" },
      { direction: "out", amount_minor: som(5000), currency: "KGS", source_type: "refund" },
      { direction: "out", amount_minor: som(20000), currency: "KGS", source_type: "salary" },
      { direction: "in", amount_minor: 10000, currency: "USD", source_type: "payment" },
    ]);
    expect(s.inflow).toEqual({ KGS: som(60000), USD: 10000 });
    expect(s.net).toEqual({ KGS: som(35000), USD: 10000 });
  });
});

describe("зарплата (ТЗ 8.2)", () => {
  it("50 000 начислено, аванс 15 000 и выплата 20 000 → остаток 15 000", () => {
    expect(payrollDebt([{ accrued_minor: som(50000), paid_minor: som(35000), currency: "KGS" }])).toEqual({ KGS: som(15000) });
  });
  it("аванс до утверждения начисления не создаёт долга компании (черновик не учитывается)", () => {
    // в v_payroll_balance черновик не входит в accrued — остаётся только выплата
    expect(payrollDebt([{ accrued_minor: 0, paid_minor: som(15000), currency: "KGS" }])).toEqual({});
  });
  it("сдельно: 3 проверенных видео по 1 000 → 3 000, а не 6 000 при двух площадках", () => {
    const items = [
      { id: "v1", kind: "video" }, { id: "v1", kind: "video" },
      { id: "v2", kind: "video" }, { id: "v2", kind: "video" },
      { id: "v3", kind: "video" }, { id: "v3", kind: "video" },
    ];
    expect(pieceworkTotal(items, { video: som(1000) })).toBe(som(3000));
  });
});

describe("план-факт производства", () => {
  it("план 8: готово 3, опубликовано 2 → подготовить 5, опубликовать 6", () => {
    expect(contentLeft(8, 3, 2)).toEqual({ leftToPrepare: 5, leftToPublish: 6, overflow: 0 });
  });
  it("перевыполнение не уходит в минус", () => {
    expect(contentLeft(4, 6, 6)).toEqual({ leftToPrepare: 0, leftToPublish: 0, overflow: 2 });
  });
});

describe("даты выплат (Asia/Bishkek)", () => {
  it("31-е в феврале — последний день месяца", () => {
    expect(nextPayDate(31, "2027-02-10")).toBe("2027-02-28");
    expect(nextPayDate(30, "2028-02-01")).toBe("2028-02-29");
  });
  it("переход месяца и года", () => {
    expect(nextPayDate(5, "2026-10-29")).toBe("2026-11-05");
    expect(nextPayDate(3, "2026-12-30")).toBe("2027-01-03");
    expect(nextPayDate(29, "2026-10-29")).toBe("2026-10-29");
  });
});
