// Ошибки Supabase Auth → понятный русский текст (что случилось и что делать).
// Коды: https://supabase.com/docs/guides/auth/debugging/error-codes

type AuthLikeError = { code?: string; status?: number; message?: string } | null | undefined;

export function authErrorText(e: unknown): string {
  const err = (e ?? {}) as AuthLikeError & object;
  const code = String(err?.code ?? "");
  const msg = String(err?.message ?? e ?? "");
  const has = (s: string) => msg.toLowerCase().includes(s);

  if (code === "over_email_send_rate_limit" || has("email rate limit"))
    return "Сейчас превышен лимит отправки писем. Подождите 10–15 минут и нажмите кнопку ещё раз — введённые данные сохранены. Если повторяется, сообщите руководителю.";
  if (code === "over_request_rate_limit" || code === "over_sms_send_rate_limit" || err?.status === 429 || has("rate limit") || has("security purposes"))
    return "Слишком много попыток подряд. Подождите минуту и повторите.";
  if (code === "user_already_exists" || code === "email_exists" || has("already registered"))
    return "Аккаунт с этим email уже есть. Войдите с паролем или восстановите пароль.";
  if (code === "weak_password" || has("password should"))
    return "Пароль слишком простой. Используйте минимум 10 символов: буквы и цифры, лучше добавить заглавную букву или символ.";
  if (code === "same_password") return "Новый пароль совпадает с текущим — придумайте другой.";
  if (code === "email_address_invalid" || has("invalid format") || has("unable to validate email"))
    return "Проверьте email: адрес написан с ошибкой или не принимается.";
  if (code === "email_address_not_authorized" || has("not authorized"))
    return "Почта для отправки писем ещё не настроена для внешних адресов. Сообщите руководителю.";
  if (code === "invalid_credentials" || has("invalid login")) return "Неверный email или пароль.";
  if (code === "email_not_confirmed" || has("email not confirmed")) return "Email ещё не подтверждён — откройте ссылку из письма или отправьте письмо ещё раз.";
  if (code === "otp_expired" || has("expired") || has("invalid or has expired") || has("token has expired"))
    return "Код или ссылка устарели либо уже использованы. Запросите новое письмо.";
  if (code === "signup_disabled" || has("signups not allowed")) return "Регистрация сейчас отключена. Сообщите руководителю.";
  if (code === "user_banned") return "Доступ к аккаунту закрыт. Обратитесь к руководителю.";
  if (has("fetch failed") || has("network")) return "Нет связи с сервером. Проверьте интернет и повторите — данные формы сохранены.";
  return msg.replace(/^.*?ERROR:\s*/, "").slice(0, 300) || "Не удалось выполнить действие. Повторите попытку.";
}
