"use client";
import type { ReactNode } from "react";

export const TARIFF_EVENT = "kadr:tariff";

/** Кнопка «Обсудить проект / Выбрать тариф»: подставляет тариф в форму заявки и прокручивает к ней. */
export function LeadCta({ tariff, className, children }: { tariff?: string; className?: string; children: ReactNode }) {
  return (
    <a
      href={tariff ? `?tariff=${encodeURIComponent(tariff)}#lead` : "#lead"}
      className={className}
      onClick={(e) => {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent(TARIFF_EVENT, { detail: tariff ?? "" }));
        const el = document.getElementById("lead");
        el?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
        // фокус на первое поле — сразу можно печатать (и для клавиатуры, и для экранных дикторов)
        window.setTimeout(() => (document.getElementById("lead-name") as HTMLInputElement | null)?.focus({ preventScroll: true }), 450);
      }}
    >
      {children}
    </a>
  );
}
