"use client";
import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { btn, type BtnVariant } from "@/components/ui";

type State = { ok?: string; error?: string; data?: Record<string, unknown> } | null;
type Action = (prev: State, fd: FormData) => Promise<State>;

/** Форма серверного действия: показывает ошибку/успех, сбрасывается после успеха (если reset). */
export function ActionForm({
  action,
  children,
  className,
  reset = false,
  confirm,
  onDone,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  reset?: boolean;
  confirm?: string;
  onDone?: (s: State) => void;
}) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && reset) ref.current?.reset();
    if (state && onDone) onDone(state);
  }, [state, reset, onDone]);
  return (
    <form
      ref={ref}
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {children}
      {state?.error && (
        <p role="alert" className="mt-2 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
          {state.error}
        </p>
      )}
      {state?.ok && !state.error && (
        <p role="status" className="mt-2 rounded-lg bg-good-soft px-3 py-2 text-sm text-good">
          {state.ok}
        </p>
      )}
    </form>
  );
}

export function Submit({ children, variant = "primary", className, name, value }: { children: ReactNode; variant?: BtnVariant; className?: string; name?: string; value?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name={name} value={value} disabled={pending} className={btn(variant, className)}>
      {pending ? "Сохранение…" : children}
    </button>
  );
}
