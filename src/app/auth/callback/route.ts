import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/safe-next";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

const OTP_TYPES: EmailOtpType[] = ["signup", "email", "recovery", "invite", "magiclink", "email_change"];

// Обработка ссылок из писем Supabase (подтверждение email, восстановление пароля).
// Два формата: ?code= (PKCE — работает только в том же браузере, где начинали) и
// ?token_hash=&type= (шаблоны писем SMM KADR — работает в любом браузере и в приложении Gmail).
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const typeRaw = url.searchParams.get("type");
  const type = OTP_TYPES.includes(typeRaw as EmailOtpType) ? (typeRaw as EmailOtpType) : null;
  const nextRaw = url.searchParams.get("next") ?? "/app";
  const next = safeNext(nextRaw);
  const isRecovery = type === "recovery" || next.startsWith("/auth/update-password");
  const to = (path: string) => NextResponse.redirect(new URL(path, url.origin));

  // Supabase сам вернул ошибку (ссылка устарела / уже использована)
  if (url.searchParams.get("error_code") || url.searchParams.get("error")) {
    return to(isRecovery ? "/reset-password?expired=1" : `/login?expired=1&next=${encodeURIComponent(next)}`);
  }

  const supabase = await createClient();
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) return to(next);
    return to(isRecovery ? "/reset-password?expired=1" : `/login?expired=1&next=${encodeURIComponent(next)}`);
  }
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return to(next);
    // Ссылку открыли в другом браузере (например, в приложении Gmail): email при этом уже подтверждён Supabase,
    // но сессию здесь создать нельзя — объясняем и предлагаем войти паролем.
    if (isRecovery) return to("/reset-password?expired=1");
    return to(`/login?link=1&next=${encodeURIComponent(next)}`);
  }
  return to(`/login?next=${encodeURIComponent(next)}`);
}
