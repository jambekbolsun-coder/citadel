"use client";
import { useFormStatus } from "react-dom";
import { Check, LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";

export function TabButton({ value, current, children }: { value: string; current: boolean; children: ReactNode }) {
  const { pending, data } = useFormStatus();
  const mine = pending && data?.get("tab") === value;
  return (
    <button name="tab" value={value} disabled={pending} className="row w-full text-left disabled:opacity-70" aria-pressed={current}>
      {children}
      {mine ? <LoaderCircle size={20} className="animate-spin text-muted" aria-label="Сохраняем" /> : <Check size={20} aria-hidden className={current ? "text-brand" : "text-transparent"} />}
    </button>
  );
}
