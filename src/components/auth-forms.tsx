"use client";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { acceptInvite, login, requestReset, resendConfirmation, signUp, updatePassword, verifyEmailCode } from "@/app/auth-actions";
import { KeepForm } from "@/components/keep-form";
import { btn } from "@/components/ui";

type State = { ok?: string; error?: string; data?: Record<string, unknown> } | null;

// Формы входа и регистрации вызывают серверные действия напрямую, а не через <form action>:
// при ошибке React не очищает поля, и человеку не нужно заново придумывать пароль.

export function PasswordInput({ name, autoComplete, minLength, placeholder }: { name: string; autoComplete: string; minLength?: number; placeholder?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input name={name} type={show ? "text" : "password"} required minLength={minLength} autoComplete={autoComplete} placeholder={placeholder} className="input pr-24" />
      <button type="button" onClick={() => setShow(!show)} className="absolute right-2 top-1/2 flex min-h-10 -translate-y-1/2 items-center px-2 text-xs font-semibold text-primary" aria-label={show ? "Скрыть пароль" : "Показать пароль"}>
        {show ? "Скрыть" : "Показать"}
      </button>
    </div>
  );
}

function Alert({ s }: { s: State }) {
  if (s?.error) return <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{s.error}</p>;
  if (s?.ok) return <p role="status" className="rounded-lg bg-good-soft px-3 py-2 text-sm text-good">{s.ok}</p>;
  return null;
}

/** Кнопка повторной отправки письма с паузой 60 секунд (ограничение Supabase). */
function ResendButton({ email, next, wait = 60 }: { email: string; next: string; wait?: number }) {
  const [left, setLeft] = useState(wait);
  const [state, setState] = useState<State>(null);
  const [pending, start] = useTransition();
  useEffect(() => {
    if (left <= 0) return;
    const t = window.setTimeout(() => setLeft((x) => x - 1), 1000);
    return () => window.clearTimeout(t);
  }, [left]);
  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={left > 0 || pending}
        className={btn("secondary", "w-full")}
        onClick={() => start(async () => {
          const r = await resendConfirmation(email, next);
          setState(r);
          setLeft(60);
        })}
      >
        {pending ? "Отправляем…" : left > 0 ? `Отправить письмо ещё раз (через ${left} с)` : "Отправить письмо ещё раз"}
      </button>
      <Alert s={state} />
    </div>
  );
}

/** Экран после регистрации: где искать письмо, повторная отправка и ввод кода из письма. */
export function CheckEmail({ email, next, onBack }: { email: string; next: string; onBack?: () => void }) {
  const [code, setCode] = useState("");
  const [state, setState] = useState<State>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-4" role="status">
      <div className="rounded-xl bg-good-soft p-4 text-sm text-good">
        <div className="font-semibold">Письмо отправлено на {email}</div>
        <div className="mt-1">Откройте письмо «SMM KADR» и нажмите кнопку подтверждения. Не пришло за 2–3 минуты — проверьте «Спам» и «Промоакции».</div>
      </div>
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => setState(await verifyEmailCode(email, code, next)));
        }}
      >
        <label className="block">
          <span className="label">Или введите код из письма</span>
          <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" placeholder="6 цифр" maxLength={12} className="input tracking-[0.3em]" />
        </label>
        <button type="submit" disabled={pending || code.replace(/\D/g, "").length < 6} className={btn("primary", "w-full")}>{pending ? "Проверяем…" : "Подтвердить код"}</button>
        <Alert s={state} />
      </form>
      <ResendButton email={email} next={next} />
      <p className="text-xs text-muted">
        Открыли ссылку на другом устройстве или в приложении Gmail? Email всё равно подтвердится — вернитесь сюда и <Link href={`/login?next=${encodeURIComponent(next)}`} className="text-primary underline">войдите с паролем</Link>.
      </p>
      {onBack && <button type="button" onClick={onBack} className="text-sm text-primary">← Указать другой email</button>}
    </div>
  );
}

/** Регистрация: email + пароль; при ошибке поля остаются заполненными. */
export function SignupForm({ next, fullName, submitLabel = "Создать аккаунт" }: { next: string; fullName?: string; submitLabel?: string }) {
  const [state, setState] = useState<State>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (sent) return <CheckEmail email={sent} next={next} onBack={() => { setSent(null); setState(null); }} />;
  return (
    <form
      className="space-y-4"
      aria-busy={pending}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const r = await signUp(null, fd);
          if (r?.data?.sent) setSent(String(r.data.email));
          else setState(r);
        });
      }}
    >
      <input type="hidden" name="next" value={next} />
      {fullName !== undefined && <input type="hidden" name="full_name" value={fullName} />}
      <label className="block"><span className="label">Рабочий email</span><input name="email" type="email" required className="input" autoComplete="email" inputMode="email" /></label>
      <label className="block">
        <span className="label">Придумайте пароль</span>
        <PasswordInput name="password" autoComplete="new-password" minLength={10} />
        <span className="mt-1 block text-xs text-muted">Минимум 10 символов, буквы и цифры. Запишите его — он понадобится для входа.</span>
      </label>
      <label className="block"><span className="label">Повторите пароль</span><PasswordInput name="password2" autoComplete="new-password" minLength={10} /></label>
      <Alert s={state} />
      {state?.data?.exists ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <Link href={`/login?next=${encodeURIComponent(next)}`} className={btn("primary")}>Войти</Link>
          <Link href="/reset-password" className={btn("secondary")}>Забыли пароль?</Link>
        </div>
      ) : null}
      <button type="submit" disabled={pending} aria-busy={pending} className={btn("primary", "w-full")}>{pending ? "Создаём аккаунт…" : submitLabel}</button>
    </form>
  );
}

/** Вход: при ошибке email и пароль сохраняются; неподтверждённый email — кнопка повторной отправки. */
export function LoginForm({ next }: { next: string }) {
  const [state, setState] = useState<State>(null);
  const [email, setEmail] = useState("");
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-4"
      aria-busy={pending}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => setState(await login(null, fd)));
      }}
    >
      <input type="hidden" name="next" value={next} />
      <label className="block">
        <span className="label">Email</span>
        <input name="email" type="email" required autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" />
      </label>
      <label className="block">
        <span className="label">Пароль</span>
        <PasswordInput name="password" autoComplete="current-password" />
      </label>
      <Alert s={state} />
      {state?.data?.unconfirmed ? <ResendButton email={email} next={next} wait={0} /> : null}
      <button type="submit" disabled={pending} aria-busy={pending} className={btn("primary", "w-full")}>{pending ? "Входим…" : "Войти"}</button>
    </form>
  );
}

/** Запрос ссылки для смены пароля (поле email не очищается при ошибке). */
export function ResetRequestForm() {
  return (
    <KeepForm action={requestReset} className="space-y-4">
      {(pending) => (
        <>
          <label className="block"><span className="label">Email</span><input name="email" type="email" required inputMode="email" autoComplete="email" className="input" /></label>
          <button type="submit" disabled={pending} className={btn("primary", "w-full")}>{pending ? "Отправляем…" : "Отправить ссылку"}</button>
        </>
      )}
    </KeepForm>
  );
}

/** Новый пароль после перехода по ссылке из письма. */
export function NewPasswordForm() {
  return (
    <KeepForm action={updatePassword} className="space-y-4">
      {(pending) => (
        <>
          <label className="block"><span className="label">Новый пароль</span><PasswordInput name="password" autoComplete="new-password" minLength={10} /><span className="mt-1 block text-xs text-muted">Минимум 10 символов, буквы и цифры</span></label>
          <label className="block"><span className="label">Повторите пароль</span><PasswordInput name="password2" autoComplete="new-password" minLength={10} /></label>
          <button type="submit" disabled={pending} className={btn("primary", "w-full")}>{pending ? "Сохраняем…" : "Сохранить"}</button>
        </>
      )}
    </KeepForm>
  );
}

/** Шаг «Заполните профиль» по приглашению: поля не очищаются, если сервер вернул ошибку. */
export function AcceptInviteForm({ token }: { token: string }) {
  return (
    <KeepForm action={acceptInvite} className="space-y-4">
      {(pending) => (
        <>
          <input type="hidden" name="token" value={token} />
          <label className="block"><span className="label">Телефон</span><input name="phone" type="tel" inputMode="tel" className="input" autoComplete="tel" placeholder="+996 ___ ___ ___" /></label>
          <label className="block"><span className="label">Зоны ответственности и обязанности</span><textarea name="responsibilities" className="input" /></label>
          <label className="block"><span className="label">О себе</span><textarea name="about" className="input" /></label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="rules" required className="mt-1 h-4 w-4" />
            <span>Принимаю правила доступа: данные компании конфиденциальны, доступы не передаются третьим лицам, действия фиксируются в журнале.</span>
          </label>
          <button type="submit" disabled={pending} className={btn("primary", "w-full")}>{pending ? "Сохраняем…" : "Присоединиться"}</button>
        </>
      )}
    </KeepForm>
  );
}
