// Правила повтора для задач и съёмок. Даты — местные (Бишкек) "YYYY-MM-DD".
export type Freq = "daily" | "weekly" | "monthly";
export type MonthlyMode = "day" | "nth" | "last";
export type Rule = {
  freq: Freq;
  interval: number;
  weekdays?: number[]; // 1 = Пн … 7 = Вс
  monthly?: MonthlyMode;
  count?: number;
  until?: string;
};

export const MAX_OCCURRENCES = 60;
const WD_SHORT = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];
const WD_NOM = ["понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"];
const WD_GENDER = ["m", "m", "f", "m", "f", "f", "n"] as const;
const ORD = {
  m: ["первый", "второй", "третий", "четвёртый", "пятый", "последний"],
  f: ["первая", "вторая", "третья", "четвёртая", "пятая", "последняя"],
  n: ["первое", "второе", "третье", "четвёртое", "пятое", "последнее"],
};

function d2u(d: string) {
  return new Date(d + "T12:00:00Z");
}
function u2d(x: Date) {
  return x.toISOString().slice(0, 10);
}
export function addDays(d: string, n: number) {
  const x = d2u(d);
  x.setUTCDate(x.getUTCDate() + n);
  return u2d(x);
}
export function isoDow(d: string) {
  return ((d2u(d).getUTCDay() + 6) % 7) + 1;
}
function daysInMonth(y: number, m: number) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
function ymd(y: number, m: number, day: number) {
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Все даты серии, начиная с start (включительно). Не больше MAX_OCCURRENCES. */
export function expand(start: string, rule: Rule): string[] {
  const interval = Math.max(1, Math.min(52, Math.floor(rule.interval) || 1));
  const limit = Math.min(MAX_OCCURRENCES, rule.count && rule.count > 0 ? Math.floor(rule.count) : MAX_OCCURRENCES);
  const until = rule.until && /^\d{4}-\d{2}-\d{2}$/.test(rule.until) ? rule.until : null;
  if (!until && !(rule.count && rule.count > 0)) return [start];
  const out: string[] = [];
  const push = (d: string) => {
    if (d < start || (until && d > until) || out.length >= limit) return false;
    out.push(d);
    return true;
  };
  const done = (d: string) => out.length >= limit || (until !== null && d > until);

  if (rule.freq === "daily") {
    for (let d = start; !done(d); d = addDays(d, interval)) push(d);
  } else if (rule.freq === "weekly") {
    const days = [...new Set((rule.weekdays?.length ? rule.weekdays : [isoDow(start)]).filter((w) => w >= 1 && w <= 7))].sort();
    for (let monday = addDays(start, 1 - isoDow(start)); !done(monday); monday = addDays(monday, 7 * interval)) {
      for (const w of days) {
        const d = addDays(monday, w - 1);
        if (until && d > until) break;
        push(d);
      }
    }
  } else {
    const [sy, sm, sd] = start.split("-").map(Number);
    const mode = rule.monthly ?? "day";
    const wd = isoDow(start);
    const nth = Math.ceil(sd / 7);
    for (let k = 0; k < 1200; k += interval) {
      const y = sy + Math.floor((sm - 1 + k) / 12);
      const m = ((sm - 1 + k) % 12) + 1;
      const dim = daysInMonth(y, m);
      let day: number;
      if (mode === "day") day = Math.min(sd, dim);
      else {
        const firstDow = isoDow(ymd(y, m, 1));
        const firstMatch = 1 + ((wd - firstDow + 7) % 7);
        if (mode === "last") {
          day = firstMatch;
          while (day + 7 <= dim) day += 7;
        } else {
          day = firstMatch + 7 * (nth - 1);
          if (day > dim) continue;
        }
      }
      const d = ymd(y, m, day);
      if (done(d)) break;
      push(d);
    }
  }
  return out;
}

export function describe(start: string, rule: Rule): string {
  const n = Math.max(1, Math.floor(rule.interval) || 1);
  let s: string;
  if (rule.freq === "daily") s = n === 1 ? "Каждый день" : `Каждые ${n} дн.`;
  else if (rule.freq === "weekly") {
    const days = (rule.weekdays?.length ? [...rule.weekdays].sort() : [isoDow(start)]).map((w) => WD_SHORT[w - 1]).join(", ");
    s = `${n === 1 ? "Каждую неделю" : `Каждые ${n} нед.`}: ${days}`;
  } else {
    const every = n === 1 ? "Каждый месяц" : `Каждые ${n} мес.`;
    const sd = Number(start.slice(8));
    const w = isoDow(start) - 1;
    const ord = ORD[WD_GENDER[w]];
    s = rule.monthly === "nth" ? `${every}, ${ord[Math.ceil(sd / 7) - 1]} ${WD_NOM[w]}`
      : rule.monthly === "last" ? `${every}, ${ord[5]} ${WD_NOM[w]}` : `${every}, ${sd}-го числа`;
  }
  const c = rule.count ?? 0;
  const raz = [2, 3, 4].includes(c % 10) && ![12, 13, 14].includes(c % 100) ? "раза" : "раз";
  const end = rule.until ? ` до ${rule.until.split("-").reverse().join(".")}` : c ? `, ${c} ${raz}` : "";
  return s + end;
}

/** Правило из формы (поля repeat_*). null — без повтора. */
export function ruleFromForm(fd: FormData): Rule | null {
  const freq = String(fd.get("repeat_freq") ?? "");
  if (!["daily", "weekly", "monthly"].includes(freq)) return null;
  const end = String(fd.get("repeat_end") ?? "count");
  const count = Number(fd.get("repeat_count"));
  const until = String(fd.get("repeat_until") ?? "");
  const rule: Rule = {
    freq: freq as Freq,
    interval: Number(fd.get("repeat_interval")) || 1,
    weekdays: fd.getAll("repeat_weekday").map(Number).filter((w) => w >= 1 && w <= 7),
    monthly: (["day", "nth", "last"].includes(String(fd.get("repeat_monthly"))) ? String(fd.get("repeat_monthly")) : "day") as MonthlyMode,
  };
  if (end === "until") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(until)) throw new Error("Укажите дату окончания повторов");
    rule.until = until;
  } else {
    if (!(count >= 2)) throw new Error("Количество повторов — от 2");
    rule.count = Math.min(MAX_OCCURRENCES, Math.floor(count));
  }
  return rule;
}
