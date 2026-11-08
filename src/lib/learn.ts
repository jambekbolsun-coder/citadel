import { allowed, canOpen, type Viewer } from "@/lib/nav";

/**
 * Обучение внутри приложения: типизированный контент в Git, без секретов и персональных данных.
 * Каждый видит только свои уроки и шаги: условие `show` урока и `when` шага считаются по ролям и правам сотрудника.
 * Названия кнопок и разделов в текстах совпадают с настоящими экранами — при переименовании кнопки поправьте и урок.
 */

export type LearnLink = { href: string; label: string };
export type LearnStep = {
  /** Ключ картинки из src/components/learn/scenes.tsx — у каждого шага своя */
  scene: string;
  title: string;
  text: string;
  link?: LearnLink;
  when?: (v: Viewer) => boolean;
};
export type Lesson = {
  id: string;
  title: string;
  hint: string;
  show: (v: Viewer) => boolean;
  steps: LearnStep[];
};

const any = (v: Viewer, ...perms: string[]) => perms.some((p) => v.can(p));
const hasRole = (v: Viewer, ...roles: string[]) => v.isOwner ? false : roles.some((r) => v.roles.includes(r));

/** Руководитель и управляющий учатся вести работу, остальные — выполнять свою часть. */
export function isLeader(v: Viewer) {
  return v.isOwner || v.roles.includes("manager");
}
const isStaff = (v: Viewer) => !isLeader(v);
const assignsWork = (v: Viewer) => isLeader(v) || any(v, "tasks.manage", "content.manage", "shoots.manage", "projects.manage");

// Порядок в массиве — порядок прохождения.
export const LESSONS: Lesson[] = [
  {
    id: "start",
    title: "Первые шаги",
    hint: "Приложение, профиль и уведомления",
    show: () => true,
    steps: [
      {
        scene: "start-install",
        title: "Поставьте приложение",
        text: "Android: Chrome → ⋮ → «Установить приложение». iPhone: Safari → «Поделиться» → «На экран Домой».",
        link: { href: "/app/settings/app", label: "Установка" },
      },
      {
        scene: "start-profile",
        title: "Заполните профиль",
        text: "Поставьте фото и имя — так коллеги узнают вас в задачах.",
        link: { href: "/app/settings/profile", label: "Открыть профиль" },
      },
      {
        scene: "start-push",
        title: "Включите уведомления",
        text: "Новые задачи и правки будут сразу приходить на телефон.",
        link: { href: "/app/settings/notifications", label: "Включить" },
      },
    ],
  },

  // ───────── сотрудник: своя работа ─────────
  {
    id: "my-tasks",
    title: "Где мои задачи",
    hint: "Что делать сегодня и на неделе",
    show: isStaff,
    steps: [
      {
        scene: "tasks-where",
        title: "Откройте «Мои задачи»",
        text: "Там всё на сегодня и на 7 дней вперёд. Начинайте день отсюда.",
        link: { href: "/app/today", label: "Мои задачи" },
      },
      {
        scene: "tasks-bell",
        title: "Следите за колокольчиком",
        text: "Красная цифра вверху — новые поручения и правки.",
        link: { href: "/app/notifications", label: "Уведомления" },
      },
      {
        scene: "tasks-calendar",
        title: "Смотрите календарь",
        text: "Съёмки, смены и сроки по дням — кнопка «Календарь» внизу.",
        link: { href: "/app/calendar", label: "Календарь" },
      },
    ],
  },
  {
    id: "do-task",
    title: "Как выполнять задачу",
    hint: "Прочитать, начать, сообщить о проблеме",
    show: isStaff,
    steps: [
      {
        scene: "do-read",
        title: "Прочитайте задание",
        text: "Откройте задачу: что сделать и к какому сроку. Непонятно — спросите до начала работы.",
      },
      {
        scene: "do-start",
        title: "Начните работу",
        text: "Задача: «Изменить статус» → «В работе» → «Применить». Материал: блок «Следующий шаг».",
      },
      {
        scene: "do-blocked",
        title: "Если что-то мешает",
        text: "В задаче поставьте «Заблокировано» и напишите причину — не ждите молча.",
      },
    ],
  },
  {
    id: "submit-work",
    title: "Как сдать работу",
    hint: "Отчёт за минуту через «+»",
    show: isStaff,
    steps: [
      { scene: "submit-plus", title: "Нажмите «+»", text: "Круглая кнопка внизу экрана → «Сдать работу»." },
      { scene: "submit-pick", title: "Выберите работу", text: "В списке — ваши открытые задачи и материалы. Нажмите нужную." },
      { scene: "submit-link", title: "Приложите результат", text: "Вставьте ссылку на файл или опишите, что сделано. Нажмите «Сдать»." },
      { scene: "submit-wait", title: "Дождитесь ответа", text: "Если есть проверяющий, работа уйдёт к нему. Ответ придёт уведомлением." },
    ],
  },
  {
    id: "redo",
    title: "Если вернули на доработку",
    hint: "Что исправить и как сдать снова",
    show: isStaff,
    steps: [
      { scene: "redo-notice", title: "Придёт уведомление", text: "Статус работы станет «На доработке»." },
      { scene: "redo-read", title: "Прочитайте правки", text: "Откройте работу: причина и список правок — в уведомлении и в «Истории»." },
      { scene: "redo-fix", title: "Исправьте", text: "Вносите правки в эту же работу, новую создавать не нужно." },
      { scene: "redo-again", title: "Сдайте снова", text: "«+» → «Сдать работу» и новая ссылка на результат." },
    ],
  },
  {
    id: "shoots",
    title: "Съёмки",
    hint: "Подтвердить, снять, сдать исходники",
    show: (v) => hasRole(v, "mobilographer", "ambassador"),
    steps: [
      { scene: "shoot-confirm", title: "Подтвердите участие", text: "Откройте съёмку и нажмите «Подтверждаю». Не сможете — «Не смогу» и причина." },
      { scene: "shoot-film", title: "Снимите по плану", text: "Темы, место и оборудование указаны в карточке съёмки." },
      {
        scene: "shoot-upload",
        title: "Сдайте исходники",
        text: "Загрузите файлы в облако, вставьте ссылку и нажмите «Съёмка проведена».",
        when: (v) => hasRole(v, "mobilographer"),
      },
    ],
  },
  {
    id: "stories",
    title: "Сторис",
    hint: "Как отметить, что сделано за день",
    show: (v) => hasRole(v, "storymaker"),
    steps: [
      { scene: "story-count", title: "Отметьте факт", text: "Проект → вкладка «Сторис». В строке дня укажите, сколько сделано, и нажмите OK." },
      { scene: "story-reason", title: "Сделали меньше плана", text: "В той же строке напишите причину. Подтверждает руководитель проекта." },
    ],
  },
  {
    id: "ads",
    title: "Реклама",
    hint: "Кампании и ежедневные расходы",
    show: (v) => hasRole(v, "targetologist"),
    steps: [
      {
        scene: "ads-project",
        title: "Откройте свои проекты",
        text: "Вкладка «Реклама» внизу: клиенты, кампании и видео, назначенные вам.",
        link: { href: "/app/campaigns", label: "Реклама" },
      },
      { scene: "ads-spend", title: "Записывайте расход", text: "«+» → «Записать расход рекламы»: кампания, сумма, обращения." },
      { scene: "ads-check", title: "Меняйте статусы вручную", text: "Приложение не связано с рекламным кабинетом: паузу ставьте и там, и здесь." },
    ],
  },

  // ───────── руководитель: вести работу ─────────
  {
    id: "add-employee",
    title: "Как добавить сотрудника",
    hint: "QR-приглашение и открытие доступа",
    show: (v) => v.can("employees.invite"),
    steps: [
      {
        scene: "team-open",
        title: "Откройте приглашение",
        text: "«+» → «Пригласить сотрудника».",
        link: { href: "/app/team?tab=invite", label: "Добавить сотрудника" },
      },
      { scene: "team-form", title: "Заполните карточку", text: "ФИО, рабочий email, должность и роль. Нажмите «Создать QR-приглашение»." },
      { scene: "team-qr", title: "Передайте QR или ссылку", text: "Сотрудник регистрируется на этот email. Писем уходит только 2 в час — добавляйте людей по очереди." },
      {
        scene: "team-approve",
        title: "Откройте доступ",
        text: "Сотрудники → карточка человека → «Утвердить и открыть доступ».",
        when: (v) => v.can("employees.manage"),
        link: { href: "/app/team", label: "Сотрудники" },
      },
      {
        scene: "team-ask-owner",
        title: "Доступ открывает владелец",
        text: "Новый сотрудник появится в списке. Попросите владельца утвердить его.",
        when: (v) => !v.can("employees.manage"),
      },
    ],
  },
  {
    id: "add-project",
    title: "Как добавить проект",
    hint: "Клиент, тариф, команда, запуск",
    show: (v) => v.can("projects.create"),
    steps: [
      {
        scene: "project-plus",
        title: "Нажмите «+»",
        text: "«+» → «Добавить проект». Дальше всего 3 шага.",
        link: { href: "/app/projects/new", label: "Добавить проект" },
      },
      { scene: "project-client", title: "Шаг 1. Клиент", text: "Введите нового клиента или выберите «Уже в базе»." },
      { scene: "project-tariff", title: "Шаг 2. Проект и тариф", text: "Выберите тариф — цена и состав работ подставятся сами." },
      { scene: "project-team", title: "Шаг 3. Команда и оплата", text: "Назначьте команду, укажите оплату и нажмите «Создать проект»." },
      {
        scene: "project-launch",
        title: "Запустите проект",
        text: "Вкладка «Обзор и допуск»: отметьте чек-лист. После оплаты — «Допустить к производству».",
        when: (v) => isLeader(v) || v.can("projects.manage"),
      },
      {
        scene: "project-plan",
        title: "Сформируйте план",
        text: "Вкладка «План-факт»: «Сформировать план на период», затем «Утвердить план».",
        when: (v) => isLeader(v) || any(v, "projects.manage", "content.plan"),
      },
    ],
  },
  {
    id: "give-work",
    title: "Как давать поручения",
    hint: "Задачи, материалы и съёмки",
    show: assignsWork,
    steps: [
      {
        scene: "give-task",
        title: "Поручите задачу",
        text: "«+» → «Создать задачу»: что сделать, исполнитель, срок.",
        link: { href: "/app/tasks/new", label: "Создать задачу" },
      },
      {
        scene: "give-content",
        title: "Назначьте материал",
        text: "Контент → «Без исполнителя» → откройте материал. Заполните ТЗ, исполнителя и срок → «Назначить».",
        when: (v) => any(v, "content.manage", "projects.manage"),
        link: { href: "/app/content?view=unassigned", label: "Без исполнителя" },
      },
      {
        scene: "give-shoot",
        title: "Запланируйте съёмку",
        text: "«+» → «Запланировать съёмку»: дата, место, участники.",
        when: (v) => any(v, "shoots.manage", "projects.manage"),
        link: { href: "/app/shoots/new", label: "Запланировать" },
      },
    ],
  },
  {
    id: "plan-day",
    title: "Как распределить работу на сегодня и завтра",
    hint: "Кто занят, кто свободен, что горит",
    show: (v) => v.can("calendar.view_all"),
    steps: [
      {
        scene: "plan-calendar",
        title: "Посмотрите всю команду",
        text: "Календарь → «Вся команда» → «День» или «Неделя»: кто чем занят сегодня и завтра.",
        link: { href: "/app/calendar", label: "Календарь" },
      },
      { scene: "plan-load", title: "Сравните загрузку", text: "В режиме «Неделя» внизу — «Загрузка команды». Давайте работу тем, у кого её меньше." },
      { scene: "plan-move", title: "Перенесите срок", text: "В календаре нажмите значок переноса у задачи, выберите день и укажите причину. Исполнитель получит уведомление." },
      {
        scene: "plan-late",
        title: "Начните с просрочек",
        text: "Поручения → «Просроченные». Сначала разберите их, потом новое.",
        link: { href: "/app/tasks?view=overdue", label: "Просроченные" },
      },
    ],
  },
  {
    id: "review",
    title: "Как проверять сделанное",
    hint: "Принять или вернуть с правками",
    show: assignsWork,
    steps: [
      {
        scene: "review-where",
        title: "Найдите работы на проверке",
        text: "Мои задачи → «Ждут моей проверки». Или Поручения и Контент → «На мою проверку».",
        link: { href: "/app/today", label: "Мои задачи" },
      },
      { scene: "review-open", title: "Откройте результат", text: "Посмотрите ссылку на файл и сравните с заданием." },
      { scene: "review-accept", title: "Всё хорошо — примите", text: "Выберите «Сделано» и нажмите «Применить»." },
      { scene: "review-return", title: "Нужны правки — верните", text: "Выберите «На доработке», напишите, что исправить, и нажмите «Применить»." },
    ],
  },
  {
    id: "leads",
    title: "Заявки от клиентов",
    hint: "От заявки до проекта",
    show: (v) => allowed(v, "/app/leads"),
    steps: [
      {
        scene: "lead-new",
        title: "Возьмите заявку",
        text: "Новая заявка приходит уведомлением. Откройте её и нажмите «Взять в работу».",
        link: { href: "/app/leads", label: "Заявки" },
      },
      { scene: "lead-stage", title: "Двигайте по стадиям", text: "После каждого разговора нажимайте «Изменить стадию»." },
      {
        scene: "lead-client",
        title: "Договорились — создайте проект",
        text: "В заявке, в блоке «Клиент и проект», переведите её в клиента и добавьте проект.",
        when: (v) => v.can("clients.manage"),
      },
    ],
  },
  {
    id: "money",
    title: "Как работать с бухгалтерией",
    hint: "Оплаты, расходы, зарплаты",
    show: (v) => isLeader(v) || any(v, "finance.view", "payments.create", "payments.confirm", "expenses.create", "payroll.view", "payroll.pay"),
    steps: [
      {
        scene: "money-overview",
        title: "Смотрите кассы и долги",
        text: "Бухгалтерия → «Сводка и кассы»: сколько денег. «Дебиторка» — кто должен.",
        when: (v) => v.can("finance.view"),
        link: { href: "/app/finance", label: "Бухгалтерия" },
      },
      {
        scene: "money-income",
        title: "Внесите оплату",
        text: "Проект → вкладка «Финансы»: сумма, касса → «Внести».",
        when: (v) => v.can("payments.create"),
      },
      {
        scene: "money-confirm",
        title: "Подтвердите оплату",
        text: "Бухгалтерия → «Поступления» → «Подтвердить». Деньги попадут в кассу только после этого.",
        when: (v) => v.can("payments.confirm"),
      },
      {
        scene: "money-expense",
        title: "Добавьте расход",
        text: "«+» → «Добавить расход»: сумма, категория, фото чека.",
        when: (v) => v.can("expenses.create"),
        link: { href: "/app/finance/expense", label: "Добавить расход" },
      },
      {
        scene: "money-payroll",
        title: "Начислите зарплату",
        text: "Зарплаты: «Рассчитать начисление» → «Утвердить» → «Зарегистрировать выплату».",
        when: (v) => any(v, "payroll.view", "payroll.pay"),
        link: { href: "/app/payroll", label: "Зарплаты" },
      },
    ],
  },
];

/** Уроки сотрудника: только его шаги и только те ссылки, которые ему можно открыть. */
export function lessonsFor(v: Viewer): Lesson[] {
  return LESSONS.filter((l) => l.show(v))
    .map((l) => ({
      ...l,
      steps: l.steps
        .filter((s) => !s.when || s.when(v))
        .map((s) => (s.link && !canOpen(v, s.link.href) ? { ...s, link: undefined } : s)),
    }))
    .filter((l) => l.steps.length > 0);
}

/** Урок по адресу, если он положен этому сотруднику; и следующий по порядку. */
export function lessonFor(v: Viewer, id: string): { lesson: Lesson; index: number; total: number; next: Lesson | null } | null {
  const list = lessonsFor(v);
  const index = list.findIndex((l) => l.id === id);
  if (index < 0) return null;
  return { lesson: list[index], index, total: list.length, next: list[index + 1] ?? null };
}
