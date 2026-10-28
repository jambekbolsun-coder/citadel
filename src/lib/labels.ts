export const LEAD_STAGES: Record<string, string> = {
  new: "Новая",
  contacted: "Контакт установлен",
  qualified: "Квалифицирована",
  proposal: "Коммерческое предложение",
  negotiation: "Переговоры",
  contract: "Договор",
  awaiting_payment: "Ожидание оплаты",
  won: "Успешно",
  lost: "Проиграна",
};

export const PROJECT_STATUS: Record<string, string> = {
  draft: "Черновик",
  on_approval: "На согласовании",
  awaiting_payment: "Ожидает оплаты",
  ready_for_handoff: "Готов к передаче",
  in_progress: "В работе",
  awaiting_client: "Ожидает клиента",
  final_review: "Итоговая проверка",
  work_completed: "Работы завершены",
  closed: "Закрыт",
  paused: "Приостановлен",
  cancelled: "Отменён",
};

export const PROJECT_TRANSITIONS: Record<string, string[]> = {
  draft: ["on_approval", "awaiting_payment", "cancelled"],
  on_approval: ["draft", "awaiting_payment", "cancelled"],
  awaiting_payment: ["ready_for_handoff", "on_approval", "cancelled"],
  ready_for_handoff: ["awaiting_payment", "cancelled"],
  in_progress: ["awaiting_client", "final_review", "paused", "cancelled"],
  awaiting_client: ["in_progress", "paused", "cancelled"],
  final_review: ["in_progress", "work_completed"],
  work_completed: ["closed", "in_progress"],
  paused: ["in_progress", "cancelled"],
  closed: [],
  cancelled: [],
};

export const PROJECT_KIND: Record<string, string> = {
  one_time: "Разовый",
  monthly: "Месячный",
  yearly: "Годовой",
  custom: "Индивидуальный",
  one_time_shoot: "Разовая съёмка",
};

export const CONTENT_KIND: Record<string, string> = {
  video: "Видео",
  story: "Сторис",
  post: "Пост",
  carousel: "Карусель",
  ad_creative: "Рекламный креатив",
  shoot: "Съёмки",
  other: "Другое",
};

export const CONTENT_STATUS: Record<string, string> = {
  planned: "Запланировано",
  in_progress: "В работе",
  ready_to_shoot: "Готово к съёмке",
  shot: "Отснято",
  processing: "На обработке",
  editing: "На монтаже",
  design: "На оформлении",
  review: "На согласовании",
  revision: "На доработке",
  done: "Сделано",
  published: "Выложено",
  blocked: "Заблокировано",
  paused: "Приостановлено",
  cancelled: "Отменено",
};

// Подсказка для UI; окончательная проверка — на сервере (content_transition)
export const CONTENT_NEXT: Record<string, string[]> = {
  planned: ["in_progress", "ready_to_shoot", "editing", "design"],
  in_progress: ["ready_to_shoot", "editing", "design", "review"],
  ready_to_shoot: ["shot"],
  shot: ["processing", "editing"],
  processing: ["editing", "design", "review"],
  editing: ["design", "review"],
  design: ["editing", "review"],
  revision: ["in_progress", "editing", "design", "review"],
  review: ["done", "revision"],
  done: ["published", "revision"],
  blocked: ["in_progress"],
  paused: ["in_progress"],
  published: [],
  cancelled: [],
};

export const TASK_STATUS: Record<string, string> = {
  todo: "К выполнению",
  in_progress: "В работе",
  review: "На проверке",
  revision: "На доработке",
  done: "Сделано",
  blocked: "Заблокировано",
  cancelled: "Отменено",
};

export const PRIORITY: Record<string, string> = { low: "Низкий", normal: "Обычный", high: "Высокий", critical: "Критичный" };

export const PLATFORMS: Record<string, string> = {
  instagram_reels: "Instagram Reels",
  instagram_post: "Instagram пост",
  instagram_stories: "Instagram Stories",
  tiktok: "TikTok",
  facebook: "Facebook",
  youtube_shorts: "YouTube Shorts",
  telegram: "Telegram",
  other: "Другое",
};

export const PAY_STATE: Record<string, string> = {
  unpaid: "Не оплачено",
  partial: "Частично",
  paid: "Оплачено 100%",
  overdue: "Просрочено",
  void: "Аннулирован",
};

export const PAYMENT_STATUS: Record<string, string> = { pending: "Ожидает подтверждения", confirmed: "Подтверждён", rejected: "Отклонён" };
export const EXPENSE_STATUS: Record<string, string> = { draft: "Черновик", pending: "Ожидает подтверждения", confirmed: "Подтверждён", cancelled: "Отменён" };
export const PAY_TYPE: Record<string, string> = { fixed: "Фиксированная", piecework: "Сдельная", mixed: "Смешанная" };
export const SHOOT_ROLE: Record<string, string> = { mobilographer: "Мобилограф", ambassador: "Амбассадор", creative: "Креатив", other: "Другое" };
export const RESPONSE: Record<string, string> = { pending: "Ждём ответа", accepted: "Подтвердил", declined: "Отказался" };

export function tone(status: string): "neutral" | "good" | "warn" | "bad" | "info" | "brand" {
  if (["done", "published", "paid", "confirmed", "won", "accepted", "closed", "active", "approved", "work_completed"].includes(status)) return "good";
  if (["review", "partial", "pending", "awaiting_payment", "on_approval", "awaiting_client", "final_review", "draft_plan", "negotiation", "proposal"].includes(status)) return "warn";
  if (["overdue", "lost", "rejected", "blocked", "cancelled", "declined", "revision", "critical"].includes(status)) return "bad";
  if (["in_progress", "editing", "design", "processing", "shot", "ready_to_shoot", "contacted", "qualified"].includes(status)) return "info";
  if (["new"].includes(status)) return "brand";
  return "neutral";
}
