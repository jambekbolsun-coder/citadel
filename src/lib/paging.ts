export const PAGE = 30;

/** Диапазон для .range(from, to): границы включительно, поэтому приходит PAGE + 1 строка — лишняя означает, что есть следующая страница. */
export function pageRange(page: number) {
  const p = Math.max(1, Math.floor(page) || 1);
  return { from: (p - 1) * PAGE, to: p * PAGE, page: p };
}

export function pageSlice<T>(rows: T[]) {
  return { items: rows.slice(0, PAGE), hasMore: rows.length > PAGE };
}
