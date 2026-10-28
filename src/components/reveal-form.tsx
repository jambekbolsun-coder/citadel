"use client";
import { useActionState, useEffect, useState } from "react";
import { Submit } from "@/components/action-form";

type State = { ok?: string; error?: string; data?: Record<string, unknown> } | null;

/** Показ секрета: значение живёт только в памяти страницы и скрывается через 30 секунд. */
export function RevealForm({ action, secretId, reauth }: { action: (p: State, fd: FormData) => Promise<State>; secretId: string; reauth: (p: State, fd: FormData) => Promise<State> }) {
  const [state, act] = useActionState(action, null);
  const [re, reAct] = useActionState(reauth, null);
  const [value, setValue] = useState<string | null>(null);
  useEffect(() => {
    if (state?.data?.value) {
      setValue(String(state.data.value));
      const t = setTimeout(() => setValue(null), 30_000);
      return () => clearTimeout(t);
    }
  }, [state]);
  const needReauth = state?.error?.includes("пароль");
  return (
    <div className="space-y-2">
      {value ? (
        <div className="flex items-center gap-2">
          <code className="rounded-lg bg-surface-2 px-2 py-1 text-sm">{value}</code>
          <button type="button" className="text-xs text-primary" onClick={() => navigator.clipboard.writeText(value)}>Копировать</button>
          <button type="button" className="text-xs text-muted" onClick={() => setValue(null)}>Скрыть</button>
        </div>
      ) : (
        <form action={act}>
          <input type="hidden" name="secret_id" value={secretId} />
          <Submit variant="secondary" className="min-h-[32px] px-3 text-xs">Показать</Submit>
        </form>
      )}
      {state?.error && <p className="text-xs text-bad">{state.error}</p>}
      {needReauth && (
        <form action={reAct} className="flex gap-2">
          <input name="password" type="password" required placeholder="Пароль" className="input max-w-[200px]" autoComplete="current-password" />
          <Submit variant="secondary" className="min-h-[36px] px-3 text-xs">Подтвердить</Submit>
          {re?.ok && <span className="text-xs text-good">{re.ok}</span>}
          {re?.error && <span className="text-xs text-bad">{re.error}</span>}
        </form>
      )}
    </div>
  );
}
