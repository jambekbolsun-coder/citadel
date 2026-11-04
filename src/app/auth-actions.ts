"use server";
import { redirect } from "next/navigation";
import { safeNext } from "@/lib/safe-next";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { action, check, str, type ActionState } from "@/lib/actions";
import { authErrorText } from "@/lib/auth-errors";
import type { EmailQuota } from "@/lib/email-quota";

async function origin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return process.env.NEXT_PUBLIC_SITE_URL && !host ? process.env.NEXT_PUBLIC_SITE_URL : `${proto}://${host}`;
}


// ───── лимит встроенной почты Supabase (2 письма в час): отметки отправок и состояние для таймера ─────
type MailKind = "signup" | "resend" | "recovery" | "limit";
const isMailLimit = (e: { code?: string; message?: string } | null) => !!e && (e.code === "over_email_send_rate_limit" || /email rate limit/i.test(e.message ?? ""));
async function noteMail(kind: MailKind) {
  try {
    const supabase = await createClient();
    await supabase.rpc("mail_quota_note", { p_kind: kind });
  } catch {} // отметка вспомогательная — никогда не ломает вход и регистрацию
}

/** Сколько писем ушло за час и когда можно следующее (для таймера на экранах приглашения, сброса пароля и «Команды»). */
export async function getEmailQuota(): Promise<EmailQuota | null> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("email_quota");
  return (data as EmailQuota | null) ?? null;
}

const callbackUrl = async (next: string) => `${await origin()}/auth/callback?next=${encodeURIComponent(next)}`;

// Все формы входа и регистрации вызывают эти действия напрямую (без сброса формы),
// поэтому ошибки возвращаются текстом, а введённые данные остаются на экране.

export async function login(_p: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: str(fd, "email").toLowerCase(), password: String(fd.get("password") ?? "") });
  if (error) {
    // data.unconfirmed — форма покажет кнопку «Отправить письмо ещё раз»
    const unconfirmed = error.code === "email_not_confirmed" || error.message.includes("Email not confirmed");
    return { error: authErrorText(error), data: unconfirmed ? { unconfirmed: true } : undefined };
  }
  redirect(safeNext(str(fd, "next") || "/app"));
}

function validatePassword(p: string) {
  if (p.length < 10) throw new Error("Пароль — минимум 10 символов");
  if (!/[a-zа-я]/i.test(p) || !/\d/.test(p)) throw new Error("Пароль должен содержать буквы и цифры");
}

/**
 * Регистрация (первый владелец или приглашённый сотрудник). Сессия появится после подтверждения email.
 * data.sent — письмо ушло (экран «проверьте почту»); data.exists — аккаунт уже есть
 * (Supabase в этом случае отвечает «успехом» и молча не отправляет письмо).
 */
export async function signUp(_p: ActionState, fd: FormData): Promise<ActionState> {
  const email = str(fd, "email").toLowerCase();
  const password = String(fd.get("password") ?? "");
  try {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Проверьте email: адрес написан с ошибкой");
    if (password !== String(fd.get("password2") ?? "")) throw new Error("Пароли не совпадают");
    validatePassword(password);
  } catch (e) {
    return { error: (e as Error).message };
  }
  const next = safeNext(str(fd, "next") || "/app");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: await callbackUrl(next), data: { full_name: str(fd, "full_name") } },
  });
  if (error) {
    if (isMailLimit(error)) await noteMail("limit");
    return { error: authErrorText(error), data: error.code === "user_already_exists" ? { exists: true } : isMailLimit(error) ? { limit: true } : undefined };
  }
  if (data.session) redirect(next); // если подтверждение email отключено в проекте
  if (data.user && (data.user.identities?.length ?? 0) === 0) return { error: authErrorText({ code: "user_already_exists" }), data: { exists: true } };
  await noteMail("signup");
  return { ok: "Письмо отправлено", data: { sent: true, email } };
}

/** Отправить письмо подтверждения ещё раз (Supabase разрешает не чаще раза в минуту). */
export async function resendConfirmation(email: string, next: string): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.auth.resend({ type: "signup", email: email.trim().toLowerCase(), options: { emailRedirectTo: await callbackUrl(safeNext(next)) } });
  if (error) {
    if (isMailLimit(error)) await noteMail("limit");
    return { error: authErrorText(error), data: isMailLimit(error) ? { limit: true } : undefined };
  }
  await noteMail("resend");
  return { ok: "Письмо отправлено ещё раз. Проверьте «Входящие» и «Спам»." };
}

export const claimOwner = action(async (fd) => {
  const supabase = await createClient();
  check(await supabase.rpc("claim_first_owner", { p_full_name: str(fd, "full_name") }));
  redirect("/app");
});

export const acceptInvite = action(async (fd) => {
  if (fd.get("rules") !== "on") throw new Error("Нужно принять правила доступа");
  const supabase = await createClient();
  check(
    await supabase.rpc("accept_invite", {
      p_token: str(fd, "token"),
      p_phone: str(fd, "phone"),
      p_about: str(fd, "about"),
      p_responsibilities: str(fd, "responsibilities"),
    }),
  );
  redirect("/pending?joined=1");
});

export const requestReset = action(async (fd) => {
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(str(fd, "email").toLowerCase(), {
    redirectTo: `${await origin()}/auth/callback?next=/auth/update-password`,
  });
  if (error) {
    if (isMailLimit(error)) await noteMail("limit");
    throw new Error(authErrorText(error));
  }
  await noteMail("recovery");
  return "Если такой email зарегистрирован, письмо со ссылкой отправлено. Откройте самое новое письмо; ссылка срабатывает один раз.";
});

export const updatePassword = action(async (fd) => {
  const password = String(fd.get("password") ?? "");
  if (password !== String(fd.get("password2") ?? "")) throw new Error("Пароли не совпадают");
  validatePassword(password);
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw new Error(authErrorText(error));
  // после смены пароля завершаем другие сеансы
  await supabase.auth.signOut({ scope: "others" });
  return "Пароль обновлён. Другие сеансы завершены.";
});

export async function logout(fd: FormData) {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: fd.get("scope") === "global" ? "global" : "local" });
  redirect(fd.get("next") ? safeNext(String(fd.get("next"))) : "/login");
}

/** Повторная проверка пароля для чувствительных операций (обновляет amr в JWT). */
export const reauth = action(async (fd) => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user?.email) throw new Error("Нет сессии");
  const { error } = await supabase.auth.signInWithPassword({ email: data.user.email, password: String(fd.get("password") ?? "") });
  if (error) throw new Error("Неверный пароль");
  return "Подтверждено на 15 минут";
});
