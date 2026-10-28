// Форматирование для пользователя: часовой пояс Asia/Bishkek, суммы в минимальных единицах (тыйын).
export const TZ = "Asia/Bishkek";

export function money(minor: number | string | bigint | null | undefined, currency = "KGS") {
  if (minor === null || minor === undefined) return "—";
  const n = Number(minor) / 100;
  const sym = currency === "KGS" ? "сом" : currency;
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(n)} ${sym}`;
}

/** "15 000,50" → 1500050. Только целочисленная арифметика, без float. */
export function parseMoney(input: FormDataEntryValue | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  const s = String(input).replace(/\s/g, "").replace(",", ".");
  if (!s) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new Error("Некорректная сумма");
  const [int, frac = ""] = s.split(".");
  return Number(int) * 100 + Number((frac + "00").slice(0, 2));
}

export function minorToInput(minor: number | null | undefined) {
  if (minor === null || minor === undefined) return "";
  const n = Number(minor);
  return n % 100 === 0 ? String(n / 100) : (n / 100).toFixed(2);
}

const dtf = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("ru-RU", { timeZone: TZ, ...o });

export function date(d: string | Date | null | undefined) {
  if (!d) return "—";
  const v = typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + "T12:00:00Z") : new Date(d);
  return dtf({ day: "2-digit", month: "2-digit", year: "numeric" }).format(v);
}
export function dateTime(d: string | Date | null | undefined) {
  if (!d) return "—";
  return dtf({ day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(d));
}
export function time(d: string | Date | null | undefined) {
  if (!d) return "—";
  return dtf({ hour: "2-digit", minute: "2-digit" }).format(new Date(d));
}

/** Сегодняшняя дата в Бишкеке, YYYY-MM-DD */
export function todayLocal(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}
export function localDateOf(d: string | Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(d));
}

/** "2026-10-29" + "14:30" (местное) → ISO UTC. Бишкек — UTC+6 без перехода на летнее время. */
export function localToIso(day: string, hm = "00:00"): string {
  return new Date(`${day}T${hm}:00+06:00`).toISOString();
}
/** ISO → значение для <input type="datetime-local"> в местном времени */
export function isoToLocalInput(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(new Date(iso).getTime() + 6 * 3600_000);
  return d.toISOString().slice(0, 16);
}
export function localInputToIso(v: FormDataEntryValue | null): string | null {
  if (!v) return null;
  const s = String(v);
  if (!s) return null;
  return new Date(`${s}:00+06:00`).toISOString();
}

export function overdueText(due: string | null | undefined): string | null {
  if (!due) return null;
  const ms = Date.now() - new Date(due).getTime();
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3600_000);
  if (h < 1) return `Просрочено на ${Math.max(1, Math.floor(ms / 60000))} мин`;
  if (h < 48) return `Просрочено на ${h} ч`;
  return `Просрочено на ${Math.floor(h / 24)} дн`;
}

export function initials(name: string | null | undefined) {
  return (name ?? "?").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";
}

/** Русское склонение: plural(2, ["пост","поста","постов"]) → "поста" */
export function plural(n: number, forms: [string, string, string]) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}

const KIND_FORMS: Record<string, [string, string, string]> = {
  video: ["видео", "видео", "видео"],
  story: ["сторис", "сторис", "сторис"],
  post: ["пост", "поста", "постов"],
  carousel: ["карусель", "карусели", "каруселей"],
  ad_creative: ["рекламный креатив", "рекламных креатива", "рекламных креативов"],
  shoot: ["съёмка", "съёмки", "съёмок"],
};
export function kindCount(kind: string, n: number) {
  const f = KIND_FORMS[kind];
  return f ? `${n} ${plural(n, f)}` : `${n} ${kind}`;
}
