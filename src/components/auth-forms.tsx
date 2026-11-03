"use client";
import Link from "next/link";
import { useCallback, useEffect, useState, useTransition } from "react";
import { acceptInvite, getEmailQuota, login, requestReset, resendConfirmation, signUp, updatePassword } from "@/app/auth-actions";
import { KeepForm } from "@/components/keep-form";
import { btn, cn } from "@/components/ui";
import { MAIL_LIMIT_PER_HOUR, freeSlots, mmss, secondsUntilFree, type EmailQuota } from "@/lib/email-quota";

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

// ───────── лимит писем: 2 в час на весь проект ─────────

/** Состояние лимита писем с живым таймером; по окончании таймера сам перепроверяет сервер. */
export function useEmailQuota(initial: EmailQuota | null) {
  const [q, setQ] = useState(initial);
  const [fetchedAt, setFetchedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const left = secondsUntilFree(q, now, fetchedAt);
  const refresh = useCallback(async () => {
    const fresh = await getEmailQuota();
    setQ(fresh);
    setFetchedAt(Date.now());
    setNow(Date.now());
  }, []);
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  // когда таймер дойдёт до нуля — уточняем у сервера (за это время могли уйти другие письма)
  useEffect(() => {
    const wait = secondsUntilFree(q, Date.now(), fetchedAt);
    if (!q?.next_free_at || wait <= 0) return;
    const t = window.setTimeout(() => void refresh(), wait * 1000 + 1500);
    return () => window.clearTimeout(t);
  }, [q, fetchedAt, refresh]);
  return { q, left, busy: left > 0, refresh };
}

/** Плашка «лимит писем»: таймер до следующего письма или сколько писем свободно в этот час. */
export function QuotaNotice({ left, q, action = "регистрацию" }: { left: number; q: EmailQuota | null; action?: string }) {
  if (left > 0)
    return (
      <div className="rounded-xl border border-warn/40 bg-warn-soft p-4 text-sm text-warn" role="status" aria-live="polite">
        <div className="font-semibold">Лимит писем на этот час исчерпан</div>
        <div className="mt-1">
          Следующую {action} можно через <span className="font-display text-lg font-extrabold tabular-nums">{mmss(left)}</span>. Не нажимайте кнопку раньше — письмо всё равно не уйдёт.
        </div>
      </div>
    );
  return (
    <p className="rounded-xl bg-surface-2 px-3 py-2 text-xs text-muted">
      Писем свободно в этот час: <b className="text-ink">{freeSlots(q)} из {MAIL_LIMIT_PER_HOUR}</b>. Каждая регистрация, повторное письмо и сброс пароля тратят одно.
    </p>
  );
}

/** Повторная отправка письма: пауза 60 секунд и учёт общего лимита писем. */
function ResendButton({ email, next, wait = 60, quota }: { email: string; next: string; wait?: number; quota: ReturnType<typeof useEmailQuota> }) {
  const [left, setLeft] = useState(wait);
  const [state, setState] = useState<State>(null);
  const [pending, start] = useTransition();
  useEffect(() => {
    if (left <= 0) return;
    const t = window.setTimeout(() => setLeft((x) => x - 1), 1000);
    return () => window.clearTimeout(t);
  }, [left]);
  const waitFor = Math.max(left, quota.left);
  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={waitFor > 0 || pending}
        className={btn("secondary", "w-full")}
        onClick={() => start(async () => {
          const r = await resendConfirmation(email, next);
          setState(r);
          setLeft(60);
          await quota.refresh();
        })}
      >
        {pending ? "Отправляем…" : waitFor > 0 ? `Отправить письмо ещё раз — через ${mmss(waitFor)}` : "Отправить письмо ещё раз"}
      </button>
      <p className="text-xs text-muted">Повторное письмо тратит одно из {MAIL_LIMIT_PER_HOUR} писем часа. Сначала проверьте «Спам» и «Промоакции».</p>
      <Alert s={state} />
    </div>
  );
}

/** Экран после регистрации: где искать письмо и как продолжить, если ссылку открыли не там. */
export function CheckEmail({ email, next, onBack, quota }: { email: string; next: string; onBack?: () => void; quota: ReturnType<typeof useEmailQuota> }) {
  return (
    <div className="space-y-4" role="status">
      <div className="rounded-xl bg-good-soft p-4 text-sm text-good">
        <div className="font-semibold">Аккаунт создан, письмо отправлено на {email}</div>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Откройте письмо от Supabase Auth (тема «Confirm your signup»). Не пришло за 2–3 минуты — проверьте «Спам» и «Промоакции».</li>
          <li>Нажмите в письме ссылку подтверждения — лучше на этом же телефоне и в этом же браузере.</li>
          <li>Откроется «Заполните профиль» — заполните и нажмите «Присоединиться».</li>
        </ol>
      </div>
      <p className="text-sm">
        Ссылка открылась в приложении Gmail или на другом устройстве и попросила войти? Email уже подтверждён — <Link href={`/login?next=${encodeURIComponent(next)}`} className="font-semibold text-primary underline">войдите с этим email и паролем</Link>, приглашение откроется само.
      </p>
      <ResendButton email={email} next={next} quota={quota} />
      {onBack && <button type="button" onClick={onBack} className="text-sm text-primary">← Указать другой email</button>}
    </div>
  );
}

/** Регистрация: email + пароль; при ошибке поля остаются заполненными; при исчерпанном лимите — таймер. */
export function SignupForm({ next, fullName, submitLabel = "Создать аккаунт", quota: initialQuota = null }: { next: string; fullName?: string; submitLabel?: string; quota?: EmailQuota | null }) {
  const quota = useEmailQuota(initialQuota);
  const [state, setState] = useState<State>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [force, setForce] = useState(false);
  const [pending, start] = useTransition();
  if (sent) return <CheckEmail email={sent} next={next} quota={quota} onBack={() => { setSent(null); setState(null); }} />;
  const blocked = quota.busy && !force;
  return (
    <form
      className="space-y-4"
      aria-busy={pending}
      onSubmit={(e) => {
        e.preventDefault();
        if (blocked) return;
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const r = await signUp(null, fd);
          if (r?.data?.sent) setSent(String(r.data.email));
          else setState(r);
          setForce(false);
          await quota.refresh();
        });
      }}
    >
      <input type="hidden" name="next" value={next} />
      {fullName !== undefined && <input type="hidden" name="full_name" value={fullName} />}
      <QuotaNotice left={quota.left} q={quota.q} />
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
      <button type="submit" disabled={pending || blocked} aria-busy={pending} className={btn("primary", "w-full")}>
        {pending ? "Создаём аккаунт…" : blocked ? `Можно через ${mmss(quota.left)}` : submitLabel}
      </button>
      {quota.busy && !force && (
        <button type="button" onClick={() => setForce(true)} className={cn("w-full text-center text-xs text-muted underline")}>
          Руководитель сказал, что лимит уже свободен — попробовать сейчас
        </button>
      )}
    </form>
  );
}

/** Вход: при ошибке email и пароль сохраняются; неподтверждённый email — кнопка повторной отправки. */
export function LoginForm({ next }: { next: string }) {
  const [state, setState] = useState<State>(null);
  const [email, setEmail] = useState("");
  const [pending, start] = useTransition();
  const quota = useEmailQuota(null);
  return (
    <form
      className="space-y-4"
      aria-busy={pending}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const r = await login(null, fd);
          setState(r);
          if (r?.data?.unconfirmed) await quota.refresh();
        });
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
      {state?.data?.unconfirmed ? <ResendButton email={email} next={next} wait={0} quota={quota} /> : null}
      <button type="submit" disabled={pending} aria-busy={pending} className={btn("primary", "w-full")}>{pending ? "Входим…" : "Войти"}</button>
    </form>
  );
}

/** Запрос ссылки для смены пароля (поле email не очищается при ошибке). */
export function ResetRequestForm({ quota: initialQuota = null }: { quota?: EmailQuota | null }) {
  const quota = useEmailQuota(initialQuota);
  return (
    <KeepForm action={requestReset} className="space-y-4" onDone={() => void quota.refresh()}>
      {(pending) => (
        <>
          <QuotaNotice left={quota.left} q={quota.q} action="отправку письма" />
          <label className="block"><span className="label">Email</span><input name="email" type="email" required inputMode="email" autoComplete="email" className="input" /></label>
          <button type="submit" disabled={pending || quota.busy} className={btn("primary", "w-full")}>{pending ? "Отправляем…" : quota.busy ? `Можно через ${mmss(quota.left)}` : "Отправить ссылку"}</button>
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
