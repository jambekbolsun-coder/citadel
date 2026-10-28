"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { action, check, humanError, str, type ActionState } from "@/lib/actions";

async function origin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return process.env.NEXT_PUBLIC_SITE_URL && !host ? process.env.NEXT_PUBLIC_SITE_URL : `${proto}://${host}`;
}

function safeNext(n: string) {
  return n.startsWith("/") && !n.startsWith("//") ? n : "/app";
}

export async function login(_p: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: str(fd, "email").toLowerCase(), password: String(fd.get("password") ?? "") });
  if (error) {
    if (error.message.includes("Email not confirmed")) return { error: "Email не подтверждён — откройте ссылку из письма." };
    if (error.message.includes("Invalid login")) return { error: "Неверный email или пароль." };
    return { error: humanError(error) };
  }
  redirect(safeNext(str(fd, "next") || "/app"));
}

function validatePassword(p: string) {
  if (p.length < 10) throw new Error("Пароль — минимум 10 символов");
  if (!/[a-zа-я]/i.test(p) || !/\d/.test(p)) throw new Error("Пароль должен содержать буквы и цифры");
}

/** Регистрация (первый владелец или приглашённый сотрудник). Сессия появится после подтверждения email. */
export const signUp = action(async (fd) => {
  const email = str(fd, "email").toLowerCase();
  const password = String(fd.get("password") ?? "");
  if (password !== String(fd.get("password2") ?? "")) throw new Error("Пароли не совпадают");
  validatePassword(password);
  const next = safeNext(str(fd, "next") || "/app");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${await origin()}/auth/callback?next=${encodeURIComponent(next)}`, data: { full_name: str(fd, "full_name") } },
  });
  if (error) throw error;
  if (data.session) redirect(next); // если подтверждение email отключено в проекте
  return "Мы отправили письмо для подтверждения email. Откройте ссылку из письма, затем войдите.";
});

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
  if (error && !error.message.includes("rate")) throw error;
  return "Если такой email зарегистрирован, письмо со ссылкой отправлено.";
});

export const updatePassword = action(async (fd) => {
  const password = String(fd.get("password") ?? "");
  if (password !== String(fd.get("password2") ?? "")) throw new Error("Пароли не совпадают");
  validatePassword(password);
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
  // после смены пароля завершаем другие сеансы
  await supabase.auth.signOut({ scope: "others" });
  return "Пароль обновлён. Другие сеансы завершены.";
});

export async function logout(fd: FormData) {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: fd.get("scope") === "global" ? "global" : "local" });
  redirect("/login");
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
