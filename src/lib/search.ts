/** Нормализация поискового запроса: без спецсимволов PostgREST-фильтров и LIKE-шаблонов. */
export function cleanQuery(raw: string | null | undefined): string {
  return (raw ?? "")
    .replace(/[%_,()\\*:"'.]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

export const MIN_QUERY = 2;

export type SearchHit = { id: string; title: string; sub: string | null; href: string };
export type SearchGroup = { key: string; label: string; items: SearchHit[] };

export type SearchScope = { clients: boolean; people: boolean; leads: boolean };

/** Какие разделы искать: финансовые записи в поиск не попадают никогда. */
export function searchScope(can: (p: string) => boolean): SearchScope {
  return {
    clients: can("clients.view") || can("clients.manage"),
    people: can("employees.view"),
    leads: can("leads.view") || can("leads.receive") || can("leads.manage"),
  };
}
