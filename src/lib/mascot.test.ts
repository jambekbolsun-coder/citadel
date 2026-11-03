import { describe, expect, it } from "vitest";
import { greetName, greetingFor, parsePhrases, pickEmotion, pickPhrase, praise, tasksWord, type MoodStats } from "./mascot";

const S = (p: Partial<MoodStats> = {}): MoodStats => ({ overdue: 0, max_overdue_days: 0, due_today: 0, done_today: 0, open_total: 2, late_recent: 0, done_recent: 0, birthday: false, ...p });

describe("эмоция илбирса", () => {
  it("правила по приоритету", () => {
    expect(pickEmotion(S({ overdue: 3 }))).toBe("angry");
    expect(pickEmotion(S({ overdue: 1, max_overdue_days: 4 }))).toBe("angry");
    expect(pickEmotion(S({ overdue: 2, max_overdue_days: 1 }))).toBe("strict");
    expect(pickEmotion(S({ due_today: 1 }))).toBe("remind");
    expect(pickEmotion(S({ done_today: 2 }))).toBe("happy");
    expect(pickEmotion(S({ done_recent: 5 }))).toBe("proud");
    expect(pickEmotion(S({ done_recent: 5, late_recent: 1 }))).toBe("kind");
    expect(pickEmotion(S({ open_total: 0 }))).toBe("calm");
    expect(pickEmotion(S())).toBe("kind");
    expect(pickEmotion(null)).toBe("kind");
  });
  it("день рождения важнее всего", () => {
    expect(pickEmotion(S({ birthday: true, overdue: 5 }))).toBe("celebrate");
  });
});

describe("приветствие и обращение", () => {
  it("время суток по Бишкеку", () => {
    expect(greetingFor(6)).toBe("Доброе утро");
    expect(greetingFor(12)).toBe("Добрый день");
    expect(greetingFor(19)).toBe("Добрый вечер");
    expect(greetingFor(2)).toBe("Доброй ночи");
    expect(greetingFor(23)).toBe("Доброй ночи");
  });
  it("имя из ФИО или указанное сотрудником", () => {
    expect(greetName("Асанова Айгерим Маратовна")).toBe("Айгерим");
    expect(greetName("Тестовый Бекуш")).toBe("Бекуш");
    expect(greetName("Бекболсун")).toBe("Бекболсун");
    expect(greetName("Асанова Айгерим", "Айка")).toBe("Айка");
  });
  it("похвала: без выбора — нейтрально, пол по имени не угадываем", () => {
    expect(praise("none")).toBe("на высоте");
    expect(praise("he")).toBe("молодец");
    expect(praise("she")).toBe("умница");
  });
  it("склонение задач", () => {
    expect(tasksWord(1)).toBe("1 задача");
    expect(tasksWord(3)).toBe("3 задачи");
    expect(tasksWord(5)).toBe("5 задач");
    expect(tasksWord(11)).toBe("11 задач");
    expect(tasksWord(22)).toBe("22 задачи");
  });
});

describe("фразы", () => {
  it("подстановки и стабильность в течение дня", () => {
    const a = pickPhrase("angry", S({ overdue: 4 }), { name: "Бекуш", form: "none", day: "2026-11-04" });
    expect(a).toMatch(/4 задачи/);
    expect(pickPhrase("angry", S({ overdue: 4 }), { name: "Бекуш", form: "none", day: "2026-11-04" })).toBe(a);
    expect(pickPhrase("happy", S(), { name: "", form: "she", day: "2026-11-04", custom: { happy: ["Вы {praise}!"] } })).toBe("Вы умница!");
  });
  it("фразы владельца: мусор игнорируется", () => {
    expect(parsePhrases("не json")).toBeNull();
    expect(parsePhrases(JSON.stringify({ happy: ["Ура"], unknown: ["x"] }))).toEqual({ happy: ["Ура"] });
  });
});
