export type NavItem = { href: string; label: string; icon: string; perms?: string[]; group: string };

/** Минимум сведений о сотруднике, нужный навигации. Сами данные защищены RLS — здесь только видимость. */
export type Viewer = { roles: string[]; isOwner: boolean; can: (perm: string) => boolean };

export const NAV: NavItem[] = [
  { href: "/app", label: "Главная", icon: "home", group: "Работа" },
  { href: "/app/today", label: "Мои задачи", icon: "check", group: "Работа" },
  { href: "/app/tasks", label: "Поручения", icon: "list", group: "Работа" },
  { href: "/app/calendar", label: "Календарь", icon: "calendar", group: "Работа" },
  { href: "/app/notifications", label: "Уведомления", icon: "bell", group: "Работа" },
  { href: "/app/projects", label: "Проекты", icon: "folder", group: "Производство" },
  { href: "/app/content", label: "Контент", icon: "film", group: "Производство" },
  { href: "/app/shoots", label: "Съёмки", icon: "camera", group: "Производство" },
  { href: "/app/checks", label: "Проверки", icon: "shield", group: "Производство" },
  { href: "/app/campaigns", label: "Реклама", icon: "megaphone", perms: ["campaigns.manage", "campaigns.view_all"], group: "Производство" },
  { href: "/app/leads", label: "Заявки и продажи", icon: "inbox", perms: ["leads.view", "leads.receive", "leads.manage"], group: "Продажи" },
  { href: "/app/clients", label: "Клиенты", icon: "users", perms: ["clients.view", "clients.manage"], group: "Продажи" },
  { href: "/app/tariffs", label: "Тарифы", icon: "tag", perms: ["tariffs.manage", "prices.view"], group: "Продажи" },
  { href: "/app/cms", label: "Сайт / CMS", icon: "globe", perms: ["cms.manage"], group: "Продажи" },
  { href: "/app/finance", label: "Бухгалтерия", icon: "wallet", perms: ["finance.view", "expenses.create", "payments.confirm", "payments.create"], group: "Финансы" },
  { href: "/app/payroll", label: "Зарплаты", icon: "banknote", perms: ["payroll.view", "payroll.pay"], group: "Финансы" },
  { href: "/app/reports", label: "Отчёты", icon: "chart", perms: ["reports.view", "finance.view"], group: "Финансы" },
  { href: "/app/team", label: "Сотрудники", icon: "idcard", perms: ["employees.view", "employees.invite"], group: "Компания" },
  { href: "/app/settings/roles", label: "Роли и права", icon: "key", perms: ["roles.manage"], group: "Компания" },
  { href: "/app/audit", label: "Журнал аудита", icon: "scroll", perms: ["audit.view"], group: "Компания" },
  { href: "/app/settings", label: "Настройки", icon: "settings", group: "Компания" },
];

export function visibleNav(v: Viewer) {
  return NAV.filter((i) => !i.perms || i.perms.some((p) => v.can(p)));
}

export function allowed(v: Viewer, href: string) {
  const item = NAV.find((i) => i.href === href);
  return !item?.perms || item.perms.some((p) => v.can(p));
}

// ───────── 4-я позиция нижней панели: рабочий раздел под роль ─────────
export type WorkTabKey = "tasks" | "work" | "reports" | "finance";
export const WORK_TABS: Record<WorkTabKey, { href: string; label: string; icon: string; match: string[]; hint: string }> = {
  tasks: { href: "/app/today", label: "Задачи", icon: "check", match: ["/app/today", "/app/tasks", "/app/content"], hint: "Мои задачи и материалы на сегодня и неделю" },
  work: { href: "/app/projects", label: "Работа", icon: "folder", match: ["/app/projects", "/app/shoots", "/app/content", "/app/checks"], hint: "Проекты, производство и съёмки" },
  reports: { href: "/app/reports", label: "Отчёты", icon: "chart", match: ["/app/reports"], hint: "План-факт, финансы и загрузка компании" },
  finance: { href: "/app/finance", label: "Финансы", icon: "wallet", match: ["/app/finance", "/app/payroll"], hint: "Платежи, долги, расходы и выплаты" },
};

const PRODUCTION_ROLES = ["creative_director", "project_manager", "planning_director", "project_admin", "department_head"];

export function availableWorkTabs(v: Viewer): WorkTabKey[] {
  const out: WorkTabKey[] = ["tasks", "work"];
  if (allowed(v, "/app/reports")) out.push("reports");
  if (allowed(v, "/app/finance")) out.push("finance");
  return out;
}

export function defaultWorkTab(v: Viewer): WorkTabKey {
  const av = availableWorkTabs(v);
  if ((v.isOwner || v.roles.includes("manager")) && av.includes("reports")) return "reports";
  if (v.roles.includes("accountant") && av.includes("finance")) return "finance";
  if (v.roles.some((r) => PRODUCTION_ROLES.includes(r))) return "work";
  return "tasks";
}

/** Предпочтение сотрудника применяется, только если раздел ему доступен. */
export function resolveWorkTab(v: Viewer, preferred?: string | null): WorkTabKey {
  const av = availableWorkTabs(v);
  return preferred && (av as string[]).includes(preferred) ? (preferred as WorkTabKey) : defaultWorkTab(v);
}

export const WORK_TAB_COOKIE = "citadel_tab";

// ───────── центральная кнопка «+» ─────────
export type PlusAction = { key: string; label: string; hint: string; icon: string; href?: string };

export function plusActions(v: Viewer): PlusAction[] {
  const a: (PlusAction | false)[] = [
    { key: "submit", label: "Сдать работу", hint: "Отчитаться по назначенной задаче или материалу", icon: "send" },
    { key: "task", label: "Создать задачу", hint: "Себе или в своём проекте", icon: "check", href: "/app/tasks/new" },
    (v.can("shoots.manage") || v.can("projects.manage")) && { key: "shoot", label: "Запланировать съёмку", hint: "Дата, место, участники", icon: "camera", href: "/app/shoots/new" },
    v.can("projects.create") && { key: "project", label: "Добавить проект", hint: "Мастер договора и плана", icon: "folder", href: "/app/projects/new" },
    v.can("employees.invite") && { key: "invite", label: "Пригласить сотрудника", hint: "QR-приглашение и условия оплаты", icon: "userplus", href: "/app/team?tab=invite" },
    v.can("expenses.create") && { key: "expense", label: "Добавить расход", hint: "Сумма, категория, чек", icon: "receipt", href: "/app/finance/expense" },
    v.can("clients.manage") && { key: "client", label: "Добавить клиента", hint: "Компания и контакты", icon: "users", href: "/app/clients#new" },
    allowed(v, "/app/leads") && { key: "lead", label: "Новая заявка", hint: "Звонок или обращение вручную", icon: "inbox", href: "/app/leads#new" },
    { key: "event", label: "Запись в календарь", hint: "Смена, отпуск или занятость", icon: "calendarplus", href: "/app/calendar/new" },
  ];
  return a.filter((x): x is PlusAction => !!x);
}

// ───────── настройки: секции и строки ─────────
export type SettingsRow = { href: string; label: string; icon: string; status?: string };
export type SettingsGroup = { title: string; rows: SettingsRow[] };

export function settingsGroups(v: Viewer): SettingsGroup[] {
  const has = (href: string) => allowed(v, href);
  const rows = (list: (SettingsRow | false)[]) => list.filter((x): x is SettingsRow => !!x);
  const groups: SettingsGroup[] = [
    {
      title: "Профиль и аккаунт",
      rows: rows([
        { href: "/app/settings/profile", label: "Редактировать профиль", icon: "user" },
        { href: "/app/settings/duties", label: "Должность и обязанности", icon: "briefcase" },
        { href: "/app/settings/pay", label: "Мои выплаты", icon: "banknote" },
        { href: "/app/settings/results", label: "Мои результаты", icon: "trophy" },
      ]),
    },
    {
      title: "Работа",
      rows: rows([
        { href: "/app/today", label: "Мои задачи", icon: "check" },
        { href: "/app/calendar", label: "Мой календарь", icon: "calendar" },
        { href: "/app/notifications", label: "Уведомления", icon: "bell" },
        { href: "/app/tasks", label: "Поручения", icon: "list" },
        { href: "/app/projects", label: "Проекты", icon: "folder" },
        { href: "/app/content", label: "Контент", icon: "film" },
        { href: "/app/shoots", label: "Съёмки", icon: "camera" },
        { href: "/app/checks", label: "Проверки проектов", icon: "shield" },
        has("/app/campaigns") && { href: "/app/campaigns", label: "Реклама", icon: "megaphone" },
        has("/app/leads") && { href: "/app/leads", label: "Заявки и продажи", icon: "inbox" },
        has("/app/clients") && { href: "/app/clients", label: "Клиенты", icon: "users" },
        has("/app/reports") && { href: "/app/reports", label: "Отчёты", icon: "chart" },
        has("/app/finance") && { href: "/app/finance", label: "Бухгалтерия", icon: "wallet" },
        has("/app/payroll") && { href: "/app/payroll", label: "Зарплаты", icon: "banknote" },
      ]),
    },
    {
      title: "Приложение",
      rows: rows([
        { href: "/app/settings/appearance", label: "Тема и язык", icon: "palette" },
        { href: "/app/settings/start", label: "Раздел в нижней панели", icon: "layout" },
        { href: "/app/settings/notifications", label: "Push-уведомления", icon: "bellring" },
        { href: "/app/settings/app", label: "Установка и о приложении", icon: "smartphone" },
      ]),
    },
    {
      title: "Безопасность",
      rows: rows([
        { href: "/auth/update-password", label: "Изменить пароль", icon: "key" },
        { href: "/app/settings/devices", label: "PIN-код и доверенные устройства", icon: "lock" },
        { href: "/app/settings/sessions", label: "Выход и сеансы", icon: "logout" },
      ]),
    },
  ];
  const company = rows([
    has("/app/settings/roles") && { href: "/app/settings/roles", label: "Роли и доступы", icon: "key" },
    has("/app/team") && { href: "/app/team", label: "Сотрудники", icon: "idcard" },
    has("/app/tariffs") && { href: "/app/tariffs", label: "Тарифы", icon: "tag" },
    v.can("projects.manage") && { href: "/app/settings/capacity", label: "Нормативы производства", icon: "gauge" },
    v.isOwner && { href: "/app/settings/company", label: "Параметры компании", icon: "building" },
    has("/app/cms") && { href: "/app/cms", label: "Публичный сайт", icon: "globe" },
    has("/app/audit") && { href: "/app/audit", label: "Журнал аудита", icon: "scroll" },
  ]);
  if (company.length) groups.push({ title: "Компания и управление", rows: company });
  groups.push({ title: "Помощь", rows: [{ href: "/privacy", label: "Политика конфиденциальности", icon: "file" }] });
  return groups;
}

/** Заголовок верхней панели по адресу (короткий, без приветствий). */
export function titleFor(path: string): string {
  if (path === "/app") return "Цитадель";
  const exact: Record<string, string> = {
    "/app/search": "Поиск",
    "/app/settings": "Настройки",
    "/app/settings/profile": "Профиль",
    "/app/settings/duties": "Обязанности",
    "/app/settings/pay": "Мои выплаты",
    "/app/settings/results": "Мои результаты",
    "/app/settings/appearance": "Тема и язык",
    "/app/settings/start": "Нижняя панель",
    "/app/settings/notifications": "Push-уведомления",
    "/app/settings/app": "Приложение",
    "/app/settings/devices": "PIN и устройства",
    "/app/settings/sessions": "Сеансы",
    "/app/settings/capacity": "Нормативы",
    "/app/settings/company": "Компания",
    "/app/tasks/new": "Новая задача",
    "/app/calendar/new": "Запись в календарь",
    "/app/finance/expense": "Новый расход",
    "/app/projects/new": "Новый проект",
    "/app/shoots/new": "Новая съёмка",
  };
  if (exact[path]) return exact[path];
  const item = [...NAV].sort((a, b) => b.href.length - a.href.length).find((i) => i.href !== "/app" && (path === i.href || path.startsWith(i.href + "/")));
  return item?.label ?? "Цитадель";
}

/** Куда ведёт «Назад» с вложенного экрана; null — экран верхнего уровня. */
export function backFor(path: string): string | null {
  const parts = path.split("/").filter(Boolean);
  if (parts.length <= 2) return null;
  if (parts[1] === "settings") return "/app/settings";
  if (parts[1] === "reports" && parts[2] === "client") return "/app/reports";
  return "/" + parts.slice(0, 2).join("/");
}

export function isActive(path: string, href: string) {
  return href === "/app" ? path === "/app" : path === href || path.startsWith(href + "/");
}
