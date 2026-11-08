"use client";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { X } from "lucide-react";

// Отметка хранится на устройстве: это подсказка новичку, а не данные о сотруднике.
const CHANGED = "kadr:learn-seen";
const keyOf = (userId: string) => `kadr.learn.${userId.slice(0, 8)}`;

function isSeen(key: string) {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return true; // хранилище недоступно — не показываем подсказку, которую нельзя скрыть навсегда
  }
}

function markSeen(key: string) {
  try {
    localStorage.setItem(key, "1");
  } catch {}
  window.dispatchEvent(new Event(CHANGED));
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGED, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGED, onChange);
  };
}

/** Карточка на главной: видна, пока сотрудник не открыл обучение и не скрыл её сам. */
export function LearnHomeCard({ userId, text, children }: { userId: string; text: string; children: ReactNode }) {
  const key = keyOf(userId);
  // На сервере и до загрузки считаем «уже видел»: тем, кто видел, карточка не мелькнёт
  const seen = useSyncExternalStore(subscribe, () => isSeen(key), () => true);
  if (seen) return null;
  return (
    <div className="relative mb-5 rounded-2xl border border-primary bg-surface">
      <Link href="/app/learn" className="flex items-center gap-3 rounded-2xl p-2 pr-12">
        <span className="w-24 shrink-0 overflow-hidden rounded-xl bg-surface-2">{children}</span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold leading-snug">Начните с обучения</span>
          <span className="mt-0.5 block text-sm text-muted">{text}</span>
          <span className="mt-1 block text-sm font-semibold text-primary">Открыть →</span>
        </span>
      </Link>
      <button type="button" onClick={() => markSeen(key)} aria-label="Скрыть подсказку об обучении" className="tap absolute right-0.5 top-0.5 text-muted">
        <X size={18} aria-hidden="true" />
      </button>
    </div>
  );
}

/** Открыл раздел обучения — подсказка на главной больше не нужна. */
export function LearnSeen({ userId }: { userId: string }) {
  const key = keyOf(userId);
  useEffect(() => markSeen(key), [key]);
  return null;
}
