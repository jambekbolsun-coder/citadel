"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { action, check, opt, str } from "@/lib/actions";
import { parseMoney } from "@/lib/format";

const rp = () => revalidatePath("/app/payroll");

export const computeAccrual = action(async (fd) => {
  const supabase = await createClient();
  check(await supabase.rpc("payroll_compute", { p_user: str(fd, "user_id"), p_month: str(fd, "month") }));
  rp();
  return "Черновик начисления рассчитан по действующим условиям";
});

export const computeAll = action(async (fd) => {
  const supabase = await createClient();
  const ids = fd.getAll("user_id").map(String);
  let ok = 0;
  const errs: string[] = [];
  for (const id of ids) {
    const { error } = await supabase.rpc("payroll_compute", { p_user: id, p_month: str(fd, "month") });
    if (error) errs.push(error.message);
    else ok++;
  }
  rp();
  return errs.length ? `Рассчитано: ${ok}. Пропущено: ${errs.length} (утверждённые или без условий).` : `Рассчитано: ${ok}`;
});

export const adjustDraft = action(async (fd) => {
  const supabase = await createClient();
  const note = str(fd, "note");
  const bonus = parseMoney(fd.get("bonus")) ?? 0;
  const ded = parseMoney(fd.get("deduction")) ?? 0;
  if ((bonus || ded) && !note) throw new Error("Укажите причину бонуса/удержания");
  check(await supabase.from("payroll_accruals").update({ bonus_minor: bonus, deduction_minor: ded, note: opt(fd, "note") }).eq("id", str(fd, "id")));
  rp();
  return "Черновик обновлён";
});

export const approveAccrual = action(async (fd) => {
  const supabase = await createClient();
  check(await supabase.rpc("payroll_approve", { p_id: str(fd, "id") }));
  rp();
  return "Начисление утверждено";
});

export const addAdjustment = action(async (fd) => {
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  const raw = String(fd.get("amount") ?? "").trim();
  const neg = raw.startsWith("-");
  const amount = parseMoney(neg ? raw.slice(1) : raw);
  if (!amount) throw new Error("Укажите сумму корректировки");
  const reason = str(fd, "reason");
  if (!reason) throw new Error("Укажите причину");
  check(await supabase.from("payroll_adjustments").insert({ accrual_id: str(fd, "id"), amount_minor: neg ? -amount : amount, reason, created_by: u.user!.id }));
  rp();
  return "Корректировка добавлена";
});

export const paySalary = action(async (fd) => {
  const supabase = await createClient();
  const amount = parseMoney(fd.get("amount"));
  if (!amount) throw new Error("Укажите сумму");
  check(await supabase.rpc("salary_pay", { p_user: str(fd, "user_id"), p_accrual: opt(fd, "accrual_id"), p_kind: str(fd, "kind"), p_amount: amount, p_date: str(fd, "paid_on"), p_account: opt(fd, "account_id"), p_note: opt(fd, "note") }));
  rp();
  return "Выплата зарегистрирована";
});
