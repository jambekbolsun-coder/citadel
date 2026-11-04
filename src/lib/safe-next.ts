/**
 * Куда вернуть пользователя после входа: только адрес внутри приложения.
 * «//чужой.сайт», «/\чужой.сайт» (браузер читает как //), «https://…» и управляющие символы — на /app.
 */
export function safeNext(next: unknown, fallback = "/app"): string {
  if (typeof next !== "string" || next.length === 0 || next.length > 2000) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(next)) return fallback;
  return next;
}
