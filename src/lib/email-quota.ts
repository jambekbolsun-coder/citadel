// Лимит встроенной почты Supabase: 2 письма в час на весь проект.
// Письмо тратят: регистрация сотрудника, «Отправить письмо ещё раз», сброс пароля.
export type EmailQuota = { limit: number; used: number; next_free_at: string | null; window_minutes: number; now: string };

export const MAIL_LIMIT_PER_HOUR = 2;

/** Сколько секунд ждать до свободного письма (0 — можно отправлять). serverNow сглаживает разницу часов устройства и сервера. */
export function secondsUntilFree(q: EmailQuota | null, clientNowMs = Date.now(), fetchedAtMs = clientNowMs): number {
  if (!q?.next_free_at) return 0;
  const skew = new Date(q.now).getTime() - fetchedAtMs; // сервер − устройство в момент запроса
  const left = new Date(q.next_free_at).getTime() - (clientNowMs + skew);
  return Math.max(0, Math.ceil(left / 1000));
}

export function freeSlots(q: EmailQuota | null): number {
  if (!q) return MAIL_LIMIT_PER_HOUR;
  return Math.max(0, q.limit - q.used);
}

/** «12:05» для таймера, «1:00:00» если больше часа. */
export function mmss(total: number): string {
  const s = Math.max(0, Math.floor(total));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${p(m)}:${p(sec)}` : `${m}:${p(sec)}`;
}
