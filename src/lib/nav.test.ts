import { describe, expect, it } from "vitest";
import { availableWorkTabs, backFor, canOpen, defaultWorkTab, plusActions, resolveWorkTab, settingsGroups, titleFor, visibleNav, WORK_TABS, type Viewer } from "./nav";
import { AUTHOR_TEXT, HELP_TOPICS, searchHelp } from "./help-content";

// Права ролей — как в seed 0005; владелец получает всё
const ROLE_PERMS: Record<string, string[]> = {
  manager: ["leads.view", "leads.receive", "leads.manage", "clients.view", "clients.manage", "projects.view_all", "projects.create", "projects.manage", "content.plan", "content.manage", "content.publish", "tasks.view_all", "tasks.manage", "shoots.manage", "calendar.view_all", "campaigns.view_all", "employees.view", "employees.invite", "reports.view", "prices.view", "payments.create"],
  accountant: ["finance.view", "finance.manage", "payments.create", "payments.confirm", "expenses.create", "expenses.confirm", "payroll.view", "payroll.manage", "payroll.pay", "prices.view", "reports.view", "clients.view", "projects.view_all"],
  project_manager: ["projects.create", "content.plan", "content.manage", "tasks.manage", "shoots.manage", "calendar.view_all"],
  creative_director: ["content.plan", "content.manage", "projects.view_all", "calendar.view_all"],
  targetologist: ["campaigns.manage"],
  mobilographer: [],
  editor: [],
};
function viewer(...roles: string[]): Viewer {
  const isOwner = roles.includes("owner");
  const perms = new Set(roles.flatMap((r) => ROLE_PERMS[r] ?? []));
  return { roles, isOwner, can: (p) => isOwner || perms.has(p) };
}

describe("4-я позиция нижней панели", () => {
  it("владелец и управляющий → Отчёты", () => {
    expect(defaultWorkTab(viewer("owner"))).toBe("reports");
    expect(defaultWorkTab(viewer("manager"))).toBe("reports");
  });
  it("бухгалтер → Финансы", () => {
    expect(defaultWorkTab(viewer("accountant"))).toBe("finance");
  });
  it("креативный директор и проект-менеджер → Работа", () => {
    expect(defaultWorkTab(viewer("creative_director"))).toBe("work");
    expect(defaultWorkTab(viewer("project_manager"))).toBe("work");
  });
  it("исполнители → Задачи", () => {
    for (const r of ["mobilographer", "editor", "storymaker"]) expect(defaultWorkTab(viewer(r))).toBe("tasks");
  });
  it("таргетолог → «Реклама» (свои рекламные проекты), «Задачи» доступны на выбор", () => {
    const t = viewer("targetologist");
    expect(defaultWorkTab(t)).toBe("ads");
    expect(availableWorkTabs(t)).toContain("tasks");
    expect(resolveWorkTab(t, "tasks")).toBe("tasks");
    expect(resolveWorkTab(t, "finance")).toBe("ads");
  });
  it("без прав на рекламу вкладки «Реклама» нет", () => {
    expect(availableWorkTabs(viewer("mobilographer"))).not.toContain("ads");
  });
  it("никогда не ведёт в запрещённый раздел, даже если так выбрано", () => {
    const mob = viewer("mobilographer");
    expect(availableWorkTabs(mob)).toEqual(["tasks", "work"]);
    expect(resolveWorkTab(mob, "finance")).toBe("tasks");
    expect(resolveWorkTab(mob, "reports")).toBe("tasks");
    expect(resolveWorkTab(mob, "мусор")).toBe("tasks");
  });
  it("смешанная роль может закрепить другой доступный раздел", () => {
    const v = viewer("accountant", "project_manager");
    expect(defaultWorkTab(v)).toBe("finance");
    expect(resolveWorkTab(v, "work")).toBe("work");
    expect(resolveWorkTab(v, "reports")).toBe("reports");
  });
  it("ссылки вкладок ведут в существующие разделы", () => {
    expect(WORK_TABS.tasks.href).toBe("/app/today");
    expect(WORK_TABS.reports.href).toBe("/app/reports");
    expect(WORK_TABS.finance.href).toBe("/app/finance");
  });
});

describe("меню «+»", () => {
  const keys = (v: Viewer) => plusActions(v).map((a) => a.key);
  it("сдать работу и создать задачу доступны любому активному сотруднику", () => {
    expect(keys(viewer("mobilographer"))).toEqual(["submit", "task", "event"]);
  });
  it("исполнитель не видит создание проекта, приглашение и расходы", () => {
    const k = keys(viewer("editor"));
    for (const x of ["project", "invite", "expense", "client", "shoot", "lead"]) expect(k).not.toContain(x);
  });
  it("бухгалтер вносит расход, но не создаёт проект", () => {
    const k = keys(viewer("accountant"));
    expect(k).toContain("expense");
    expect(k).not.toContain("client"); // только clients.view, без clients.manage
    expect(k).not.toContain("project");
    expect(k).not.toContain("invite");
  });
  it("управляющий видит производственные действия", () => {
    const k = keys(viewer("manager"));
    for (const x of ["submit", "task", "shoot", "project", "invite", "lead"]) expect(k).toContain(x);
    // клиент заводится внутри мастера проекта — отдельного пункта «Добавить клиента» в «+» нет
    expect(k).not.toContain("client");
    expect(k[0]).toBe("project");
    expect(k).not.toContain("expense");
  });
  it("у «Сдать работу» нет ссылки — открывается панель сдачи; у остальных есть маршрут", () => {
    for (const a of plusActions(viewer("owner"))) {
      if (a.key === "submit") expect(a.href).toBeUndefined();
      else expect(a.href).toMatch(/^\/app\//);
    }
  });
});

describe("настройки", () => {
  const titles = (v: Viewer) => settingsGroups(v).map((g) => g.title);
  const hrefs = (v: Viewer) => settingsGroups(v).flatMap((g) => g.rows.map((r) => r.href));
  it("у исполнителя нет блока управления компанией и финансов", () => {
    const v = viewer("mobilographer");
    expect(titles(v)).toEqual(["Профиль и аккаунт", "Работа", "Приложение", "Безопасность", "Помощь"]);
    for (const h of ["/app/finance", "/app/payroll", "/app/reports", "/app/team", "/app/audit", "/app/settings/roles"]) expect(hrefs(v)).not.toContain(h);
  });
  it("владелец видит управление компанией", () => {
    const h = hrefs(viewer("owner"));
    for (const x of ["/app/settings/roles", "/app/team", "/app/settings/company", "/app/audit", "/app/finance", "/app/reports"]) expect(h).toContain(x);
  });
  it("каждый доступный раздел бокового меню достижим из настроек или нижней панели", () => {
    for (const roles of [["owner"], ["manager"], ["accountant"], ["mobilographer"], ["targetologist"]]) {
      const v = viewer(...roles);
      const reachable = new Set([...hrefs(v), "/app", "/app/calendar", "/app/settings"]);
      for (const i of visibleNav(v)) expect(reachable, `${roles} → ${i.href}`).toContain(i.href);
    }
  });
  it("PIN, push, смена пароля и выход сохранены", () => {
    const h = hrefs(viewer("editor"));
    for (const x of ["/app/settings/devices", "/app/settings/notifications", "/auth/update-password", "/app/settings/sessions"]) expect(h).toContain(x);
  });
});

describe("верхняя панель", () => {
  it("короткий заголовок по адресу", () => {
    expect(titleFor("/app")).toBe("SMM KADR");
    expect(titleFor("/app/tasks/123")).toBe("Поручения");
    expect(titleFor("/app/settings/roles")).toBe("Роли и права");
    expect(titleFor("/app/settings/pay")).toBe("Мои выплаты");
    expect(titleFor("/app/search")).toBe("Поиск");
  });
  it("«Назад» только на вложенных экранах", () => {
    expect(backFor("/app")).toBeNull();
    expect(backFor("/app/tasks")).toBeNull();
    expect(backFor("/app/tasks/123")).toBe("/app/tasks");
    expect(backFor("/app/settings/profile")).toBe("/app/settings");
    expect(backFor("/app/reports/client/9")).toBe("/app/reports");
  });
});

describe("инструкции и реклама", () => {
  const hrefs = (v: Viewer) => settingsGroups(v).flatMap((g) => g.rows.map((r) => r.href));
  const ALL = ["owner", "manager", "accountant", "project_manager", "creative_director", "targetologist", "mobilographer", "editor"];
  it("пункт «Инструкции» и «О приложении» есть у каждой роли", () => {
    for (const r of ALL) {
      const h = hrefs(viewer(r));
      expect(h, r).toContain("/app/help");
      expect(h, r).toContain("/app/help/about");
    }
  });
  it("ссылки инструкций не ведут в запрещённые разделы", () => {
    for (const r of ALL) {
      const v = viewer(r);
      for (const t of HELP_TOPICS) for (const l of t.links) if (!canOpen(v, l.href)) expect(visibleNav(v).map((i) => i.href)).not.toContain(l.href.split("?")[0]);
    }
    const mob = viewer("mobilographer");
    expect(canOpen(mob, "/app/finance")).toBe(false);
    expect(canOpen(mob, "/app/finance/expense")).toBe(false);
    expect(canOpen(mob, "/app/payroll")).toBe(false);
    expect(canOpen(mob, "/app/campaigns")).toBe(false);
    expect(canOpen(mob, "/app/today")).toBe(true);
    expect(canOpen(viewer("accountant"), "/app/finance/expense")).toBe(true);
    expect(canOpen(viewer("targetologist"), "/app/campaigns/new")).toBe(true);
  });
  it("статья «Таргет» объясняет отсутствие интеграций и правила расходов", () => {
    const t = HELP_TOPICS.find((x) => x.id === "ads")!;
    const text = [t.summary, ...t.steps, ...t.mistakes].join(" ");
    expect(text).toMatch(/интеграций с рекламными API.*НЕТ/i);
    expect(text).toContain("$5 + $3 + $2 (пауза) = $8");
    expect(text).toContain("$20");
    expect(text).not.toMatch(/подключ\w+ рекламн\w+ площад/i);
  });
  it("поиск по инструкциям", () => {
    expect(searchHelp("PIN").map((t) => t.id)).toContain("first-login");
    expect(searchHelp("CPL").map((t) => t.id)).toEqual(["ads"]);
    expect(searchHelp("несуществующееслово")).toEqual([]);
  });
  it("авторский текст сохранён дословно", () => {
    expect(AUTHOR_TEXT).toBe("Это идеальное приложение создал наш господин Жамшутов Бекболсун Ренатович. Его гениальность на высшем уровне, поэтому он смог создать такое удобное и расширенное приложение.");
  });
  it("в «+» у таргетолога есть запись расхода рекламы, у мобилографа — нет", () => {
    expect(plusActions(viewer("targetologist")).map((a) => a.key)).toContain("ads");
    expect(plusActions(viewer("mobilographer")).map((a) => a.key)).not.toContain("ads");
  });
  it("«Назад» из инструкций", () => {
    expect(backFor("/app/help")).toBe("/app/settings");
    expect(backFor("/app/help/ads")).toBe("/app/help");
    expect(titleFor("/app/help/about")).toBe("О приложении");
    expect(titleFor("/app/help/ads")).toBe("Инструкции");
  });
});
