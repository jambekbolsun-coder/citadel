"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { action, check, int, opt, str } from "@/lib/actions";
import { parseMoney } from "@/lib/format";

const rf = () => revalidatePath("/app/finance");

export const createExpense = action(async (fd) => {
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  const amount = parseMoney(fd.get("amount"));
  if (!amount) throw new Error("Укажите сумму");
  const desc = str(fd, "description");
  if (!desc) throw new Error("Опишите расход");
  // касса и расход — в одной валюте (проверяется до загрузки чека, чтобы не оставлять «сиротские» файлы)
  const accountId = opt(fd, "account_id");
  if (accountId) {
    const { data: acc } = await supabase.from("financial_accounts").select("currency").eq("id", accountId).maybeSingle();
    if (acc && acc.currency !== (str(fd, "currency") || "KGS")) throw new Error(`Касса в ${acc.currency}, а расход в ${str(fd, "currency") || "KGS"} — выберите кассу той же валюты`);
  }
  let receipt: string | null = null;
  const file = fd.get("receipt");
  if (file instanceof File && file.size > 0) {
    if (file.size > 4 * 1024 * 1024) throw new Error("Файл чека — не больше 4 МБ");
    const path = `receipts/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
    check(await supabase.storage.from("finance").upload(path, file, { contentType: file.type }));
    receipt = path;
  }
  check(
    await supabase.from("expenses").insert({
      amount_minor: amount,
      currency: str(fd, "currency") || "KGS",
      purchased_on: str(fd, "purchased_on"),
      paid_on: opt(fd, "paid_on"),
      vendor: opt(fd, "vendor"),
      description: desc,
      category_id: str(fd, "category_id"),
      tags: str(fd, "tags").split(",").map((t) => t.trim()).filter(Boolean),
      project_id: opt(fd, "project_id"),
      department_id: opt(fd, "department_id"),
      account_id: opt(fd, "account_id"),
      method: opt(fd, "method"),
      responsible_id: opt(fd, "responsible_id") ?? u.user!.id,
      recurrence: opt(fd, "recurrence"),
      is_asset: fd.get("is_asset") === "on",
      receipt_path: receipt,
      status: fd.get("draft") === "on" ? "draft" : "pending",
      created_by: u.user!.id,
    }),
  );
  rf();
  return "Расход внесён и ожидает подтверждения";
});

export const confirmExpense = action(async (fd) => {
  const supabase = await createClient();
  const asset = fd.get("is_asset") === "1" ? { name: str(fd, "asset_name"), type: str(fd, "asset_type"), model: str(fd, "asset_model"), serial: str(fd, "asset_serial"), location: str(fd, "asset_location") } : null;
  check(await supabase.rpc("expense_confirm", { p_id: str(fd, "id"), p_account: opt(fd, "account_id"), p_asset: asset }));
  rf();
  return asset ? "Расход подтверждён, создана карточка имущества (без второго списания)" : "Расход подтверждён";
});

export const cancelExpense = action(async (fd) => {
  const supabase = await createClient();
  check(await supabase.rpc("expense_cancel", { p_id: str(fd, "id"), p_reason: str(fd, "reason") }));
  rf();
  return "Расход отменён (подтверждённый — сторнирован компенсирующей записью)";
});

export const createCategory = action(async (fd) => {
  const supabase = await createClient();
  check(await supabase.from("expense_categories").insert({ name: str(fd, "name"), parent_id: opt(fd, "parent_id"), requires_project: fd.get("requires_project") === "on", sort: int(fd, "sort") ?? 100 }));
  rf();
  return "Категория создана";
});

export const renameCategory = action(async (fd) => {
  const supabase = await createClient();
  check(await supabase.from("expense_categories").update({ name: str(fd, "name"), requires_project: fd.get("requires_project") === "on", archived_at: fd.get("archived") === "on" ? new Date().toISOString() : null }).eq("id", str(fd, "id")));
  rf();
  return "Категория обновлена; история расходов сохранена";
});

export const createAccount = action(async (fd) => {
  const supabase = await createClient();
  check(await supabase.from("financial_accounts").insert({ name: str(fd, "name"), kind: str(fd, "kind"), currency: str(fd, "currency") || "KGS", opening_balance_minor: parseMoney(fd.get("opening")) ?? 0, opening_date: str(fd, "opening_date") || new Date().toISOString().slice(0, 10) }));
  rf();
  return "Счёт создан";
});

export const addAdjustmentTx = action(async (fd) => {
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  const amount = parseMoney(fd.get("amount"));
  if (!amount) throw new Error("Укажите сумму");
  const desc = str(fd, "description");
  if (!desc) throw new Error("Укажите основание корректировки");
  check(await supabase.from("money_transactions").insert({ account_id: str(fd, "account_id"), direction: str(fd, "direction"), amount_minor: amount, occurred_on: str(fd, "occurred_on"), source_type: "adjustment", source_id: crypto.randomUUID(), description: desc, created_by: u.user!.id }));
  rf();
  return "Корректировка проведена";
});

export const updateAsset = action(async (fd) => {
  const supabase = await createClient();
  check(await supabase.from("asset_register").update({ location: opt(fd, "location"), status: str(fd, "status"), responsible_id: opt(fd, "responsible_id"), notes: opt(fd, "notes") }).eq("id", str(fd, "id")));
  rf();
  return "Сохранено";
});

export async function receiptUrl(path: string) {
  const supabase = await createClient();
  const { data } = await supabase.storage.from("finance").createSignedUrl(path, 300);
  return data?.signedUrl ?? null;
}
