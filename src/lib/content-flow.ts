import { CONTENT_NEXT } from "@/lib/labels";

export type ContentHistoryRow = { from_status: string | null; to_status: string | null };

const HOLD = new Set(["paused", "blocked"]);

/**
 * Статус, в котором материал был до паузы / блокировки.
 * Повторяет правило БД (content_transition, 0024): последняя запись перехода в паузу/блокировку,
 * пришедшая не из другой паузы. История — от новых к старым.
 */
export function statusBeforeHold(historyNewestFirst: ContentHistoryRow[]): string {
  for (const h of historyNewestFirst) {
    if (h.to_status && HOLD.has(h.to_status) && h.from_status && !HOLD.has(h.from_status)) return h.from_status;
  }
  return "in_progress";
}

/**
 * Какие следующие статусы показать в форме «Следующий шаг».
 * С паузы исполнитель возвращает материал только туда, где он был; руководитель — туда же или «в работу».
 */
export function contentNextOptions(status: string, historyNewestFirst: ContentHistoryRow[], isMgr: boolean): string[] {
  if (!HOLD.has(status)) return CONTENT_NEXT[status] ?? [];
  const before = statusBeforeHold(historyNewestFirst);
  return isMgr ? Array.from(new Set([before, "in_progress"])) : [before];
}
