// Телефоны клиентов. Та же логика, что в БД (public.normalize_phone / public.phone_key) — проверяется тестами.

/** «0555 12-34-56», «555123456», «+996 555 123 456» → «+996555123456»; международные — «+<код><номер>». null — пусто, Error — некорректно. */
export function normalizePhone(input: string | null | undefined): string | null {
  const raw = (input ?? "").trim();
  const d = raw.replace(/\D/g, "");
  if (!d) return null;
  if (!raw.startsWith("+")) {
    if (d.length === 9) return `+996${d}`;
    if (d.length === 10 && d.startsWith("0")) return `+996${d.slice(1)}`;
    if (d.length === 12 && d.startsWith("996")) return `+${d}`;
  }
  if (d.length >= 10 && d.length <= 15) return `+${d}`;
  throw new Error("Некорректный номер телефона: укажите +996 XXX XXX XXX или международный номер с кодом страны");
}

/** Ключ поиска дублей: последние 9 цифр. */
export function phoneKey(input: string | null | undefined): string | null {
  const d = (input ?? "").replace(/\D/g, "");
  return d ? d.slice(-9) : null;
}

/** Мягкая проверка для подсказки в форме (без исключения). */
export function phoneProblem(input: string): string | null {
  if (!input.trim()) return "Укажите номер телефона";
  try {
    normalizePhone(input);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

/** «+996555123456» → «+996 555 123 456» для показа. */
export function formatPhone(p: string | null | undefined): string {
  if (!p) return "";
  const m = p.match(/^\+996(\d{3})(\d{3})(\d{3})$/);
  return m ? `+996 ${m[1]} ${m[2]} ${m[3]}` : p;
}

export const waLink = (p: string | null | undefined) => (p ? `https://wa.me/${p.replace(/\D/g, "")}` : null);
