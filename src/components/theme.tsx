"use client";
import { useEffect } from "react";
import { isTheme, resolvedTheme, THEME_COLOR, THEME_STORAGE_KEY, type ThemeKey } from "@/lib/themes";

/** Применяет тему сразу: атрибут на <html>, копия на устройстве, цвет верхней полоски телефона. */
export function applyTheme(key: ThemeKey) {
  const root = document.documentElement;
  try {
    if (key === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, key);
  } catch {}
  if (key === "system") delete root.dataset.theme;
  else root.dataset.theme = key;
  const color = THEME_COLOR[resolvedTheme(key, window.matchMedia("(prefers-color-scheme: dark)").matches)];
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    m.setAttribute("content", color);
    m.removeAttribute("media");
  });
}

export function deviceTheme(): ThemeKey {
  try {
    const t = localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(t) ? t : "system";
  } catch {
    return "system";
  }
}

/**
 * Тема из профиля — одна на всех устройствах сотрудника. Если на этом устройстве сохранена другая
 * (например, выбрали тему на телефоне, а открыли ноутбук), берём тему из профиля.
 */
export function ThemeSync({ theme }: { theme: string | null | undefined }) {
  useEffect(() => {
    const want = isTheme(theme) ? theme : "system";
    if (deviceTheme() !== want) applyTheme(want);
  }, [theme]);
  return null;
}
