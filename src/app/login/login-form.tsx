"use client";
import { useActionState, useState } from "react";
import { login } from "@/app/auth-actions";
import { Submit } from "@/components/action-form";

export function LoginForm({ next }: { next: string }) {
  const [state, act] = useActionState(login, null);
  const [show, setShow] = useState(false);
  return (
    <form action={act} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <label className="block">
        <span className="label">Email</span>
        <input name="email" type="email" required autoComplete="username" className="input" />
      </label>
      <label className="block">
        <span className="label">Пароль</span>
        <div className="relative">
          <input name="password" type={show ? "text" : "password"} required autoComplete="current-password" className="input pr-24" />
          <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-primary">
            {show ? "Скрыть" : "Показать"}
          </button>
        </div>
      </label>
      {state?.error && <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{state.error}</p>}
      <Submit className="w-full">Войти</Submit>
    </form>
  );
}
