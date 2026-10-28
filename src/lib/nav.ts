export type NavItem = { href: string; label: string; icon: string; perms?: string[]; group: string };

// Видимость по правам; доступ к данным дополнительно ограничен RLS на сервере.
export const NAV: NavItem[] = [
  { href: "/app", label: "Главная", icon: "home", group: "Работа" },
  { href: "/app/today", label: "Сегодня", icon: "sun", group: "Работа" },
  { href: "/app/tasks", label: "Мои задачи", icon: "check", group: "Работа" },
  { href: "/app/calendar", label: "Календарь", icon: "calendar", group: "Работа" },
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
  { href: "/app/audit", label: "Журнал аудита", icon: "list", perms: ["audit.view"], group: "Компания" },
  { href: "/app/settings", label: "Настройки", icon: "settings", group: "Компания" },
];

export const MOBILE_NAV = [
  { href: "/app", label: "Главная", icon: "home" },
  { href: "/app/projects", label: "Проекты", icon: "folder" },
  { href: "/app/calendar", label: "Календарь", icon: "calendar" },
  { href: "/app/tasks", label: "Задачи", icon: "check" },
  { href: "/app/notifications", label: "Уведомления", icon: "bell" },
];
