"use client";
import { useState, useTransition, type ReactNode } from "react";

type State = { ok?: string; error?: string; data?: Record<string, unknown> } | null;
type Action = (prev: State, fd: FormData) => Promise<State>;

/**
 * Форма для длинных правок (CMS): в отличие от ActionForm не сбрасывает поля после отправки,
 * поэтому при ошибке проверки введённый текст не теряется.
 */
export function KeepForm({ action, children, className, onDone }: { action: Action; children: (pending: boolean) => ReactNode; className?: string; onDone?: (s: State, form: HTMLFormElement) => void }) {
  const [state, setState] = useState<State>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className={className}
      aria-busy={pending}
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        start(async () => {
          const r = await action(null, fd);
          setState(r);
          onDone?.(r, form);
        });
      }}
    >
      {children(pending)}
      {state?.error && <p role="alert" className="mt-2 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{state.error}</p>}
      {state?.ok && !state.error && <p role="status" className="mt-2 rounded-lg bg-good-soft px-3 py-2 text-sm text-good">{state.ok}</p>}
    </form>
  );
}
