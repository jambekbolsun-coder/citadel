"use client";
import { useEffect, useState, useTransition } from "react";
import { Check } from "lucide-react";
import { applyTheme, deviceTheme } from "@/components/theme";
import { cn } from "@/components/ui";
import { THEMES, type ThemeKey } from "@/lib/themes";

/** Мини-образец темы: фон, карточка, кнопка и яркий «+» — настоящими цветами темы (data-theme на плитке). */
function Swatch({ theme }: { theme: Exclude<ThemeKey, "system"> }) {
  return (
    <div data-theme={theme} className="flex h-full flex-col gap-1.5 bg-bg p-2 text-ink">
      <div className="rounded-md border border-line bg-surface px-1.5 py-1">
        <div className="h-1.5 w-3/4 rounded-full bg-ink/80" />
        <div className="mt-1 h-1.5 w-1/2 rounded-full bg-muted/70" />
      </div>
      <div className="flex items-center gap-1.5">
        <span className="h-3 flex-1 rounded-md bg-primary" />
        <span className="h-4 w-4 shrink-0 rounded-full bg-accent" />
      </div>
      <div className="flex gap-1">
        <span className="h-1.5 flex-1 rounded-full bg-bad" />
        <span className="h-1.5 flex-1 rounded-full bg-warn" />
        <span className="h-1.5 flex-1 rounded-full bg-good" />
      </div>
    </div>
  );
}

export function ThemePicker({ saveTheme }: { saveTheme: (t: string) => Promise<{ ok: boolean; error?: string }> }) {
  const [current, setCurrent] = useState<ThemeKey>("system");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // тема устройства известна только в браузере
  useEffect(() => setCurrent(deviceTheme()), []); // eslint-disable-line react-hooks/set-state-in-effect

  const choose = (key: ThemeKey) => {
    setCurrent(key);
    setMsg(null);
    applyTheme(key);
    start(async () => {
      const r = await saveTheme(key);
      if (!r.ok) setMsg(r.error ?? "Не удалось сохранить тему");
    });
  };

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Тема приложения">
        {THEMES.map((t) => {
          const on = current === t.key;
          return (
            <button
              key={t.key}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => choose(t.key)}
              className={cn("overflow-hidden rounded-2xl border-2 bg-surface text-left transition-colors", on ? "border-primary" : "border-line hover:border-muted")}
            >
              <div className="relative h-20 overflow-hidden">
                {t.key === "system" ? (
                  <div className="grid h-full grid-cols-2"><Swatch theme="light" /><Swatch theme="dark" /></div>
                ) : (
                  <Swatch theme={t.key} />
                )}
                {on && (
                  <span className="absolute right-1.5 top-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-ink">
                    <Check size={15} strokeWidth={3} aria-hidden="true" />
                  </span>
                )}
              </div>
              <div className="px-3 py-2">
                <div className="text-sm font-semibold">{t.label}</div>
                <div className="text-xs text-muted">{t.hint}</div>
              </div>
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-muted" aria-live="polite">
        {msg ?? (pending ? "Сохраняем…" : "Тема сохраняется в профиле и будет такой же на всех ваших устройствах.")}
      </p>
    </div>
  );
}
