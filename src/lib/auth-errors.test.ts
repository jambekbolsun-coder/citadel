import { describe, expect, it } from "vitest";
import { authErrorText } from "./auth-errors";

describe("ошибки входа и регистрации — по-русски и с подсказкой", () => {
  it("лимит писем Supabase (реальная причина сбоев регистрации 03.11)", () => {
    expect(authErrorText({ code: "over_email_send_rate_limit", status: 429, message: "email rate limit exceeded" })).toMatch(/лимит отправки писем.*данные сохранены/);
  });
  it("частые попытки", () => {
    expect(authErrorText({ status: 429, message: "For security purposes, you can only request this after 49 seconds." })).toMatch(/Подождите минуту/);
  });
  it("существующий аккаунт, неверный пароль, неподтверждённый email", () => {
    expect(authErrorText({ code: "user_already_exists", message: "User already registered" })).toMatch(/уже есть.*восстановите пароль/);
    expect(authErrorText({ code: "invalid_credentials", message: "Invalid login credentials" })).toBe("Неверный email или пароль.");
    expect(authErrorText({ message: "Email not confirmed" })).toMatch(/не подтверждён/);
  });
  it("слабый пароль, просроченная ссылка, сеть", () => {
    expect(authErrorText({ code: "weak_password", message: "Password should contain at least one character of each" })).toMatch(/слишком простой/);
    expect(authErrorText({ code: "otp_expired", message: "Email link is invalid or has expired" })).toMatch(/устарели/);
    expect(authErrorText(new Error("fetch failed"))).toMatch(/Нет связи/);
  });
  it("неизвестная ошибка — без внутренних деталей", () => {
    expect(authErrorText(new Error("ERROR: something odd"))).toBe("something odd");
    expect(authErrorText(null)).toMatch(/Не удалось/);
  });
});
