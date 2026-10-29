"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { action, check, int, opt, str } from "@/lib/actions";
import { parseMoney } from "@/lib/format";

// Реклама — ручной журнал. Ни одно действие здесь не обращается к Meta/Google/TikTok: статусы и цифры вносит сотрудник.

const CUR = /^[A-Z]{3}$/;
function currency(fd: FormData, k = "currency") {
  const c = str(fd, k).toUpperCase() || "USD";
  if (!CUR.test(c)) throw new Error("Некорректная валюта");
  return c;
}
function refresh(id: string) {
  revalidatePath(`/app/campaigns/${id}`);
  revalidatePath("/app/campaigns");
}

export const createCampaign = action(async (fd) => {
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  const project = str(fd, "project_id");
  if (!project) throw new Error("Выберите проект");
  const daily = parseMoney(fd.get("daily_budget"));
  const row = check(
    await supabase
      .from("campaigns")
      .insert({
        project_id: project,
        name: str(fd, "name") || "Кампания",
        platform: str(fd, "platform") || "meta",
        goal: opt(fd, "goal"),
        target_leads: int(fd, "target_leads"),
        ad_account_id: opt(fd, "ad_account_id"),
        pixel: opt(fd, "pixel"),
        starts_on: opt(fd, "starts_on"),
        ends_on: opt(fd, "ends_on"),
        budget_minor: parseMoney(fd.get("budget")) ?? 0,
        daily_budget_minor: daily,
        currency: currency(fd),
        owner_id: opt(fd, "owner_id") ?? u.user!.id,
        check_every_days: Math.max(1, int(fd, "check_every_days") ?? 2),
        status: fd.get("start_now") === "1" ? "active" : "draft",
        created_by: u.user!.id,
      })
      .select("id")
      .single(),
  ) as { id: string };
  revalidatePath("/app/campaigns");
  redirect(`/app/campaigns/${row.id}?created=1`);
});

export const updateCampaign = action(async (fd) => {
  const supabase = await createClient();
  const id = str(fd, "id");
  const r = check(
    await supabase
      .from("campaigns")
      .update({
        name: str(fd, "name") || "Кампания",
        goal: opt(fd, "goal"),
        ad_account_id: opt(fd, "ad_account_id"),
        pixel: opt(fd, "pixel"),
        budget_minor: parseMoney(fd.get("budget")) ?? 0,
        starts_on: opt(fd, "starts_on"),
        ends_on: opt(fd, "ends_on"),
        target_leads: int(fd, "target_leads"),
        check_every_days: Math.max(1, int(fd, "check_every_days") ?? 2),
        notes: opt(fd, "notes"),
        ...(fd.has("owner_id") ? { owner_id: opt(fd, "owner_id") } : {}),
      })
      .eq("id", id)
      .select("id"),
  ) as { id: string }[];
  if (r.length !== 1) throw new Error("Кампания не обновлена: нет прав или запись не найдена");
  refresh(id);
  return "Параметры сохранены, изменения записаны в историю";
});

export const setCampaignStatus = action(async (fd) => {
  const supabase = await createClient();
  const id = str(fd, "id");
  const r = check(await supabase.rpc("campaign_set_status", { p_campaign: id, p_status: str(fd, "status"), p_effective_on: opt(fd, "effective_on"), p_reason: opt(fd, "reason") })) as { changed: boolean };
  refresh(id);
  return r.changed ? "Статус отмечен в Цитадели. В рекламном кабинете его нужно изменить вручную." : "Статус уже такой — ничего не меняли";
});

export const addCreative = action(async (fd) => {
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  const id = str(fd, "id");
  const url = opt(fd, "url");
  if (url && !/^https?:\/\//i.test(url)) throw new Error("Ссылка должна начинаться с https://");
  check(
    await supabase.from("campaign_creatives").insert({
      campaign_id: id,
      title: str(fd, "title") || "Видео",
      kind: str(fd, "kind") || "video",
      content_item_id: opt(fd, "content_item_id"),
      url,
      status: str(fd, "status") === "paused" ? "paused" : "active",
      daily_budget_minor: parseMoney(fd.get("daily_budget")) ?? 0,
      currency: currency(fd),
      limit_minor: parseMoney(fd.get("limit")),
      assignee_id: opt(fd, "assignee_id"),
      note: opt(fd, "note"),
      created_by: u.user!.id,
    }),
  );
  refresh(id);
  return "Креатив добавлен";
});

export const updateCreative = action(async (fd) => {
  const supabase = await createClient();
  const url = opt(fd, "url");
  if (url && !/^https?:\/\//i.test(url)) throw new Error("Ссылка должна начинаться с https://");
  const r = check(
    await supabase
      .from("campaign_creatives")
      .update({ title: str(fd, "title") || "Видео", kind: str(fd, "kind") || "video", url, content_item_id: opt(fd, "content_item_id"), limit_minor: parseMoney(fd.get("limit")), assignee_id: opt(fd, "assignee_id"), note: opt(fd, "note") })
      .eq("id", str(fd, "creative_id"))
      .select("id"),
  ) as { id: string }[];
  if (r.length !== 1) throw new Error("Креатив не обновлён: нет прав или запись не найдена");
  refresh(str(fd, "id"));
  return "Сохранено";
});

export const setCreativeStatus = action(async (fd) => {
  const supabase = await createClient();
  const r = check(await supabase.rpc("creative_set_status", { p_creative: str(fd, "creative_id"), p_status: str(fd, "status"), p_effective_on: opt(fd, "effective_on"), p_reason: opt(fd, "reason") })) as { changed: boolean };
  refresh(str(fd, "id"));
  return r.changed ? "Состояние отмечено вручную. Реальную рекламу включите или выключите в кабинете площадки." : "Статус уже такой — ничего не меняли";
});

export const setDailyBudget = action(async (fd) => {
  const supabase = await createClient();
  const amount = parseMoney(fd.get("amount"));
  if (amount === null) throw new Error("Укажите дневной бюджет");
  check(await supabase.rpc("ad_set_daily_budget", { p_campaign: str(fd, "id"), p_creative: opt(fd, "creative_id"), p_amount: amount, p_effective_from: opt(fd, "effective_from"), p_reason: opt(fd, "reason") }));
  refresh(str(fd, "id"));
  return "Новый дневной бюджет действует с указанной даты; прошлые дни не пересчитаны";
});

export const addSpend = action(async (fd) => {
  const supabase = await createClient();
  const id = str(fd, "id");
  const key = str(fd, "key");
  if (!/^[0-9a-f-]{36}$/i.test(key)) throw new Error("Форма устарела — обновите страницу");
  const creative = opt(fd, "creative_id");
  const r = check(
    await supabase.rpc("ad_spend_add", {
      p_campaign: id,
      p_creative: creative,
      p_day: str(fd, "day"),
      p_currency: currency(fd),
      p_spend: parseMoney(fd.get("spend")) ?? 0,
      p_leads: int(fd, "leads") ?? 0,
      p_impressions: int(fd, "impressions"),
      p_clicks: int(fd, "clicks"),
      p_note: opt(fd, "note"),
      p_key: key,
      p_from_unallocated: !!creative && fd.get("from_unallocated") === "1",
    }),
  ) as { id: string; duplicate: boolean };
  refresh(id);
  return { ok: r.duplicate ? "Эта запись уже сохранена — повторно не добавляли" : "Записано. Итоги обновлены.", data: { saved: true } };
});

export const correctSpend = action(async (fd) => {
  const supabase = await createClient();
  const voidIt = fd.get("void") === "1";
  check(
    await supabase.rpc("ad_spend_correct", {
      p_entry: str(fd, "entry_id"),
      p_spend: voidIt ? 0 : (parseMoney(fd.get("spend")) ?? 0),
      p_leads: voidIt ? 0 : (int(fd, "leads") ?? 0),
      p_impressions: voidIt ? null : int(fd, "impressions"),
      p_clicks: voidIt ? null : int(fd, "clicks"),
      p_note: opt(fd, "note"),
      p_reason: str(fd, "reason"),
      p_void: voidIt,
    }),
  );
  refresh(str(fd, "id"));
  return voidIt ? "Запись аннулирована (видна в истории)" : "Исправлено. Прежнее значение сохранено в истории.";
});
