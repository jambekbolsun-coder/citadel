"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { action, check, str } from "@/lib/actions";
import { parseMoney } from "@/lib/format";
import { METRICS } from "@/lib/contests";

export const saveContest = action(async (fd) => {
  const title = str(fd, "title");
  if (title.length < 2) throw new Error("Название сезона — хотя бы 2 символа");
  const starts = str(fd, "starts_on"), ends = str(fd, "ends_on");
  if (!starts || !ends) throw new Error("Укажите даты начала и окончания");
  if (ends < starts) throw new Error("Окончание раньше начала");
  const scope = str(fd, "scope") || "all";
  const scopeIds = scope === "departments" ? fd.getAll("departments").map(String) : scope === "roles" ? fd.getAll("roles").map(String) : [];
  if (scope !== "all" && !scopeIds.length) throw new Error(scope === "departments" ? "Выберите хотя бы один отдел" : "Выберите хотя бы одну роль");
  const weights = Object.fromEntries(METRICS.map((m) => [m.key, Math.max(0, Math.min(100, Number(str(fd, `w_${m.key}`)) || 0))]));
  const prizes = [1, 2, 3].map((place) => {
    let amount = 0;
    try { amount = parseMoney(fd.get(`prize_${place}`)) ?? 0; } catch { throw new Error(`Премия за ${place}-е место: укажите сумму цифрами`); }
    return { place, amount_minor: amount, text: str(fd, `prize_text_${place}`) };
  });
  const supabase = await createClient();
  const id = check(await supabase.rpc("contest_save", { p: {
    id: str(fd, "id"), title, description: str(fd, "description"), starts_on: starts, ends_on: ends, scope, scope_ids: scopeIds,
    ranking: str(fd, "ranking") || "overall", min_items: Number(str(fd, "min_items")) || 0, weights, prizes,
  } })) as string;
  revalidatePath("/app/contests");
  redirect(`/app/contests/${id}`);
});

export const revealContest = action(async (fd) => {
  const supabase = await createClient();
  check(await supabase.rpc("contest_reveal", { p_contest: str(fd, "id") }));
  revalidatePath("/app/contests", "layout");
  return "Итоги объявлены — участники получили уведомление";
});

export const issueBonuses = action(async (fd) => {
  const supabase = await createClient();
  const r = check(await supabase.rpc("contest_issue_bonuses", { p_contest: str(fd, "id") })) as { count: number; skipped: { name: string; reason: string }[] };
  revalidatePath(`/app/contests/${str(fd, "id")}`);
  revalidatePath("/app/payroll");
  const skipped = r.skipped?.length ? ` Пропущено: ${r.skipped.map((x) => `${x.name} (${x.reason})`).join(", ")}.` : "";
  return `Черновики премий созданы: ${r.count}. Утвердите их в «Зарплатах».${skipped}`;
});

export const cancelContest = action(async (fd) => {
  const supabase = await createClient();
  check(await supabase.rpc("contest_cancel", { p_contest: str(fd, "id") }));
  revalidatePath("/app/contests", "layout");
  return "Сезон отменён";
});

/** Отметка «был в приложении сегодня» для показателя активности (вызывается раз в день с устройства). */
export async function touchActivity(): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.rpc("touch_activity");
  } catch {}
}
