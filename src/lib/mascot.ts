// Илбирс — персонаж SMM KADR: эмоция и фраза по делам сотрудника. Чистые функции, покрыты тестами (mascot.test.ts).

export type Emotion = "kind" | "happy" | "proud" | "strict" | "angry" | "calm" | "celebrate" | "remind";
export type AddressForm = "he" | "she" | "none";

/** Данные текущего сотрудника (RPC my_mood): только свои задачи и материалы. */
export type MoodStats = {
  overdue: number; // открытые задачи/материалы с истёкшим сроком
  max_overdue_days: number; // самая старая просрочка, дней
  due_today: number; // срок сегодня, ещё не сдано
  done_today: number; // закрыто/сдано сегодня
  open_total: number; // всего открытых задач и материалов
  late_recent: number; // сдано после срока за 7 дней
  done_recent: number; // закрыто/сдано за 7 дней
  birthday: boolean;
};

export const EMOTIONS: Emotion[] = ["kind", "happy", "proud", "strict", "angry", "calm", "celebrate", "remind"];
export const EMOTION_LABEL: Record<Emotion, string> = {
  kind: "Добрый", happy: "Радостный", proud: "Гордый", strict: "Строгий", angry: "«Злой»", calm: "Спокойный", celebrate: "Празднует", remind: "Напоминает",
};
export const EMOTION_RULE: Record<Emotion, string> = {
  angry: "3 и больше просрочек или просрочка дольше 2 дней",
  strict: "1–2 просрочки",
  remind: "сегодня срок сдачи, ещё не сдано",
  happy: "на сегодня всё сдано",
  proud: "неделя без просрочек и есть сданные работы",
  calm: "задач нет",
  celebrate: "день рождения, итоги соревнования",
  kind: "во всех остальных случаях",
};
export const mascotSrc = (e: Emotion, size: "lg" | "sm" = "lg") => `/mascot/${e}-${size}.webp`;

/** Эмоция по делам: правила сверху вниз, первое подходящее. */
export function pickEmotion(s: MoodStats | null): Emotion {
  if (!s) return "kind";
  if (s.birthday) return "celebrate";
  if (s.overdue >= 3 || (s.overdue > 0 && s.max_overdue_days > 2)) return "angry";
  if (s.overdue > 0) return "strict";
  if (s.due_today > 0) return "remind";
  if (s.done_today > 0) return "happy";
  if (s.late_recent === 0 && s.done_recent >= 3) return "proud";
  if (s.open_total === 0) return "calm";
  return "kind";
}

/** Приветствие по часу в Бишкеке. */
export function greetingFor(hour: number): string {
  if (hour >= 5 && hour < 11) return "Доброе утро";
  if (hour >= 11 && hour < 17) return "Добрый день";
  if (hour >= 17 && hour < 23) return "Добрый вечер";
  return "Доброй ночи";
}
export function bishkekHour(d = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bishkek", hour: "2-digit", hourCycle: "h23" }).format(d));
}
export function bishkekDay(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bishkek" }).format(d);
}

/**
 * Имя для приветствия: указанное сотрудником, иначе из ФИО («Фамилия Имя Отчество» → Имя).
 * Пол по имени не определяем — см. addressForm.
 */
export function greetName(fullName: string | null | undefined, custom?: string | null): string {
  if (custom?.trim()) return custom.trim();
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return parts[1];
  return parts[0] ?? "";
}

const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};
export const tasksWord = (n: number) => `${n} ${plural(n, "задача", "задачи", "задач")}`;

/** Слово-похвала по выбранному сотрудником обращению; без выбора — нейтральное. */
export const praise = (f: AddressForm) => (f === "he" ? "молодец" : f === "she" ? "умница" : "на высоте");

export const DEFAULT_PHRASES: Record<Emotion, string[]> = {
  angry: ["Почему вы ещё не сдали отчёт? Просрочено: {n}.", "{name}, илбирс обиделся: {n} уже после срока. Давайте закроем!", "Ну сколько можно ждать? {n} — после срока."],
  strict: ["Есть просрочка: {n}. Закройте её первой.", "{name}, {n} уже после срока — илбирс ждёт отчёт."],
  remind: ["Сегодня срок сдачи: {n}. Вы успеете!", "Не забудьте: сегодня нужно сдать {n}."],
  happy: ["Вы сегодня {praise}! Всё на сегодня сдано.", "Всё закрыто — так держать!"],
  proud: ["Неделя без просрочек — вы {praise}!", "Илбирс гордится вами: ни одной просрочки."],
  calm: ["Сегодня спокойно — задач нет. Можно взять новую.", "Задач нет — илбирс отдыхает вместе с вами."],
  celebrate: ["С днём рождения, {name}! Команда SMM KADR поздравляет вас!"],
  kind: ["Хорошего дня! Открытых задач: {n}.", "Рады вас видеть. Всё идёт по плану."],
};

/** Число для подстановки {n}: для просрочек — просроченные, для напоминания — сегодняшние, иначе — открытые. */
function countFor(e: Emotion, s: MoodStats | null): number {
  if (!s) return 0;
  if (e === "angry" || e === "strict") return s.overdue;
  if (e === "remind") return s.due_today;
  return s.open_total;
}

/** Фраза: вариант выбирается по дню (не мигает при обновлении), подстановки {name} {n} {praise}. */
export function pickPhrase(
  e: Emotion,
  s: MoodStats | null,
  opts: { name: string; form: AddressForm; day: string; custom?: Partial<Record<Emotion, string[]>> | null },
): string {
  const list = (opts.custom?.[e]?.filter((x) => x.trim()) ?? []).length ? opts.custom![e]!.filter((x) => x.trim()) : DEFAULT_PHRASES[e];
  let h = 0;
  for (const ch of opts.day + e) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const raw = list[h % list.length];
  const n = countFor(e, s);
  return raw
    .replaceAll("{n}", tasksWord(n))
    .replaceAll("{name}", opts.name || "коллега")
    .replaceAll("{praise}", praise(opts.form))
    .replace(/^,\s*/, "");
}

/** Куда ведёт кнопка заставки. */
export function actionFor(e: Emotion): { label: string; href: string } | null {
  if (e === "angry" || e === "strict") return { label: "Открыть просрочки", href: "/app/today" };
  if (e === "remind") return { label: "Мои задачи на сегодня", href: "/app/today" };
  if (e === "calm") return { label: "Посмотреть задачи", href: "/app/tasks" };
  return null;
}

/** Разбор фраз владельца из app_settings (JSON); мусор игнорируется. */
export function parsePhrases(raw: string | null | undefined): Partial<Record<Emotion, string[]>> | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const out: Partial<Record<Emotion, string[]>> = {};
    for (const e of EMOTIONS) {
      const v = o[e];
      if (Array.isArray(v)) out[e] = v.map(String).map((x) => x.slice(0, 200)).filter(Boolean).slice(0, 8);
    }
    return out;
  } catch {
    return null;
  }
}
