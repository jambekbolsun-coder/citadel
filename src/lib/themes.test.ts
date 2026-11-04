import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isTheme, resolvedTheme, THEME_BOOT_SCRIPT, THEME_COLOR, THEME_KEYS, THEMES } from "./themes";

// Читаем настоящие цвета из globals.css: если кто-то поменяет цвет и текст станет плохо читаться — тест упадёт.
const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

function block(selector: string): Record<string, string> {
  const start = css.indexOf(selector + " {");
  if (start < 0) throw new Error("нет блока " + selector);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
  const vars: Record<string, string> = {};
  for (const m of body.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) vars[m[1]] = m[2].toLowerCase();
  return vars;
}

function luminance(hex: string) {
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const SELECTORS: Record<string, string> = {
  light: ':root, [data-theme="light"]',
  dark: '[data-theme="dark"]',
  pink: '[data-theme="pink"]',
  violet: '[data-theme="violet"]',
  neon: '[data-theme="neon"]',
  sun: '[data-theme="sun"]',
};

// [текст, фон, минимум]: основной текст — 7:1, остальное — 4,5:1 (WCAG AA)
const PAIRS: [string, string, number][] = [
  ["text", "bg", 7], ["text", "surface", 7], ["text", "surface-2", 4.5],
  ["muted", "bg", 4.5], ["muted", "surface", 4.5], ["muted", "surface-2", 4.5],
  ["primary-ink", "primary", 4.5], ["primary", "surface", 4.5], ["primary", "bg", 4.5],
  ["brand-ink", "brand", 4.5], ["brand", "surface", 4.5], ["brand", "brand-soft", 4.5],
  ["accent-ink", "accent", 4.5],
  ["good", "good-soft", 4.5], ["warn", "warn-soft", 4.5], ["bad", "bad-soft", 4.5], ["info", "info-soft", 4.5],
  ["bad-ink", "bad", 4.5], ["bad", "surface", 4.5], ["good", "surface", 4.5], ["warn", "surface", 4.5],
];

describe("цветные темы", () => {
  it("список тем: системная, светлая, тёмная и 4 цветные", () => {
    expect(THEME_KEYS).toEqual(["system", "light", "dark", "pink", "violet", "neon", "sun"]);
    expect(THEMES.every((t) => t.label.length > 0)).toBe(true);
  });

  it("у каждой темы есть набор цветов в globals.css", () => {
    for (const k of THEME_KEYS.filter((k) => k !== "system")) {
      expect(Object.keys(block(SELECTORS[k])).length).toBeGreaterThanOrEqual(21);
    }
  });

  for (const [theme, sel] of Object.entries(SELECTORS)) {
    it(`«${theme}»: текст читается на каждом фоне`, () => {
      const v = block(sel);
      const fails = PAIRS.filter(([a, b, min]) => contrast(v[a], v[b]) < min).map(([a, b, min]) => `${a}/${b} = ${contrast(v[a], v[b]).toFixed(2)} < ${min}`);
      expect(fails).toEqual([]);
    });
  }

  it("тёмная по системе совпадает с явной тёмной", () => {
    const start = css.indexOf(":root:not([data-theme]) {");
    const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
    const sys = Object.fromEntries([...body.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6,8})\s*;/g)].map((m) => [m[1], m[2]]));
    const dark = Object.fromEntries([...css.slice(css.indexOf('[data-theme="dark"] {')).split("}")[0].matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6,8})\s*;/g)].map((m) => [m[1], m[2]]));
    expect(sys).toEqual(dark);
  });

  it("цвет верхней полоски телефона = фон темы", () => {
    for (const k of Object.keys(THEME_COLOR) as (keyof typeof THEME_COLOR)[]) {
      expect(THEME_COLOR[k]).toBe(block(SELECTORS[k]).bg);
    }
  });

  it("системная тема превращается в светлую или тёмную", () => {
    expect(resolvedTheme("system", true)).toBe("dark");
    expect(resolvedTheme("system", false)).toBe("light");
    expect(resolvedTheme("neon", false)).toBe("neon");
  });

  it("проверка значения темы", () => {
    expect(isTheme("pink")).toBe(true);
    expect(isTheme("rainbow")).toBe(false);
    expect(isTheme(null)).toBe(false);
  });

  it("список тем совпадает с ограничением в базе (миграция 0025)", () => {
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/0025_profile_theme.sql"), "utf8");
    const list = [...(sql.match(/theme in \(([^)]*)\)/)?.[1] ?? "").matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
    expect(list).toEqual(THEME_KEYS);
  });

  it("стартовый скрипт знает все темы", () => {
    for (const k of THEME_KEYS) expect(THEME_BOOT_SCRIPT).toContain(`"${k}"`);
  });
});
