/**
 * Цветные темы приложения (docs/THEMES_PLAN.md). Сами цвета — в src/app/globals.css ([data-theme="…"]),
 * здесь — список, подписи, цвет верхней полоски телефона и скрипт, ставящий тему до показа страницы.
 * Публичный сайт (.kadr, переменные --k-*) от темы не зависит.
 */

export const THEME_STORAGE_KEY = "citadel.theme";

export type ThemeKey = "system" | "light" | "dark" | "pink" | "violet" | "neon" | "sun";

export type ThemeInfo = { key: ThemeKey; label: string; hint: string; dark: boolean };

export const THEMES: ThemeInfo[] = [
  { key: "system", label: "Системная", hint: "как на телефоне", dark: false },
  { key: "light", label: "Светлая", hint: "спокойная", dark: false },
  { key: "dark", label: "Тёмная", hint: "тёмно-синяя", dark: true },
  { key: "pink", label: "Розовый", hint: "светлая, малиновая", dark: false },
  { key: "violet", label: "Фиолетовая ночь", hint: "тёмная, сиреневая", dark: true },
  { key: "neon", label: "Неон", hint: "тёмная, яркая", dark: true },
  { key: "sun", label: "Солнечный", hint: "светлая, тёплая", dark: false },
];

export const THEME_KEYS = THEMES.map((t) => t.key);

export function isTheme(v: unknown): v is ThemeKey {
  return typeof v === "string" && (THEME_KEYS as string[]).includes(v);
}

/** Цвет верхней полоски телефона (theme-color) — фон темы. */
export const THEME_COLOR: Record<Exclude<ThemeKey, "system">, string> = {
  light: "#f3f5f8",
  dark: "#0e1422",
  pink: "#fdeef6",
  violet: "#130b22",
  neon: "#07070c",
  sun: "#fff8e1",
};

/** Тема, которая реально применяется: «Системная» превращается в светлую или тёмную. */
export function resolvedTheme(key: ThemeKey, prefersDark: boolean): Exclude<ThemeKey, "system"> {
  return key === "system" ? (prefersDark ? "dark" : "light") : key;
}

/**
 * Скрипт в <head>: ставит тему с устройства до первой отрисовки (без мигания) и перекрашивает верхнюю полоску.
 * Чистая строка без зависимостей — выполняется раньше React.
 */
export const THEME_BOOT_SCRIPT = `try{var k=${JSON.stringify(THEME_KEYS)},c=${JSON.stringify(THEME_COLOR)},t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(t&&t!=='system'&&k.indexOf(t)>-1){document.documentElement.dataset.theme=t;var m=document.querySelectorAll('meta[name="theme-color"]');for(var i=0;i<m.length;i++){m[i].setAttribute('content',c[t]);m[i].removeAttribute('media')}}}catch(e){}`;
