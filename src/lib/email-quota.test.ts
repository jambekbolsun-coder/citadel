import { describe, expect, it } from "vitest";
import { freeSlots, mmss, secondsUntilFree, type EmailQuota } from "./email-quota";

const q = (p: Partial<EmailQuota>): EmailQuota => ({ limit: 2, used: 0, next_free_at: null, window_minutes: 60, now: "2026-11-03T11:00:00Z", ...p });

describe("лимит писем: 2 в час", () => {
  it("свободно — ждать не нужно", () => {
    expect(secondsUntilFree(q({ used: 1 }))).toBe(0);
    expect(freeSlots(q({ used: 1 }))).toBe(1);
  });
  it("2 письма ушли — таймер до освобождения", () => {
    const fetched = Date.parse("2026-11-03T11:00:00Z");
    const s = q({ used: 2, next_free_at: "2026-11-03T11:25:30Z" });
    expect(secondsUntilFree(s, fetched, fetched)).toBe(25 * 60 + 30);
    expect(secondsUntilFree(s, fetched + 60_000, fetched)).toBe(24 * 60 + 30);
    expect(freeSlots(s)).toBe(0);
  });
  it("часы телефона спешат на 5 минут — таймер всё равно по серверу", () => {
    const deviceNow = Date.parse("2026-11-03T11:05:00Z");
    expect(secondsUntilFree(q({ used: 2, next_free_at: "2026-11-03T11:10:00Z" }), deviceNow, deviceNow)).toBe(600);
  });
  it("формат таймера", () => {
    expect(mmss(0)).toBe("0:00");
    expect(mmss(754)).toBe("12:34");
    expect(mmss(3600)).toBe("1:00:00");
  });
});
