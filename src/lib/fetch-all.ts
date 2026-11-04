/**
 * Загрузить все строки частями. Supabase (PostgREST) отдаёт не больше 1000 строк за запрос, а `.limit(20000)`
 * этот потолок не поднимает — суммы и выгрузки молча обрезались бы. Запрос должен иметь устойчивый порядок (`.order(...)`).
 *
 *   const tx = await fetchAll<Tx>((a, b) => supabase.from("money_transactions").select("…").order("id").range(a, b));
 */
export type PageResult = { data: unknown; error: { message: string } | null };

export const PAGE_ROWS = 1000;
/** Предохранитель: больше этого число строк не грузим (и сообщаем через truncated). */
export const MAX_ROWS = 100_000;

export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<PageResult>,
  { size = PAGE_ROWS, max = MAX_ROWS }: { size?: number; max?: number } = {},
): Promise<{ data: T[]; error: { message: string } | null; truncated: boolean }> {
  const out: T[] = [];
  for (let from = 0; from < max; from += size) {
    const { data, error } = await page(from, Math.min(from + size, max) - 1);
    if (error) return { data: out, error, truncated: false };
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < size) return { data: out, error: null, truncated: false };
  }
  return { data: out, error: null, truncated: true };
}
