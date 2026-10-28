import "server-only";

export type ActionState = { ok?: string; error?: string; data?: Record<string, unknown> } | null;

/** Перевод ошибок БД/Supabase в понятный текст без утечки внутренних деталей. */
export function humanError(e: unknown): string {
  const msg = typeof e === "object" && e && "message" in e ? String((e as { message: string }).message) : String(e);
  if (msg.includes("REAUTH_REQUIRED")) return "Подтвердите пароль ещё раз: операция требует недавнего входа.";
  if (msg.includes("row-level security") || msg.includes("permission denied")) return "Недостаточно прав для этого действия.";
  if (msg.includes("duplicate key")) return "Такая запись уже существует.";
  if (msg.includes("violates foreign key")) return "Связанная запись не найдена.";
  if (msg.includes("violates check constraint")) return "Значение не прошло проверку.";
  if (msg.includes("invalid input syntax")) return "Некорректный формат данных.";
  return msg.replace(/^.*?ERROR:\s*/, "").slice(0, 300);
}

/** Обёртка серверного действия: ловит ошибки и возвращает состояние для формы. */
export function action(fn: (fd: FormData) => Promise<string | void | { ok: string; data?: Record<string, unknown> }>) {
  return async (_prev: ActionState, fd: FormData): Promise<ActionState> => {
    try {
      const r = await fn(fd);
      if (typeof r === "string") return { ok: r };
      if (r && typeof r === "object") return r;
      return { ok: "Сохранено" };
    } catch (e) {
      // redirect() из next/navigation пробрасываем
      if (e && typeof e === "object" && "digest" in e && String((e as { digest: string }).digest).startsWith("NEXT_REDIRECT")) throw e;
      return { error: humanError(e) };
    }
  };
}

export function str(fd: FormData, k: string): string {
  return String(fd.get(k) ?? "").trim();
}
export function opt(fd: FormData, k: string): string | null {
  const v = str(fd, k);
  return v === "" ? null : v;
}
export function int(fd: FormData, k: string): number | null {
  const v = str(fd, k);
  if (v === "") return null;
  const n = Number(v);
  if (!Number.isInteger(n)) throw new Error("Ожидается целое число");
  return n;
}
/** Бросает ошибку Supabase, если есть */
export function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}
