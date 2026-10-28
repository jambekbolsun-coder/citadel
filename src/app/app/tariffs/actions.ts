"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { action, check, int, opt, str } from "@/lib/actions";
import { parseMoney } from "@/lib/format";

const KINDS = ["video", "story", "post", "carousel", "ad_creative", "shoot"];

function versionPayload(fd: FormData) {
  const composition: Record<string, number> = {};
  for (const k of KINDS) {
    const v = int(fd, `c_${k}`);
    if (v && v > 0) composition[k] = v;
  }
  const price = parseMoney(fd.get("price"));
  if (price === null) throw new Error("Укажите цену");
  return {
    price_minor: price,
    currency: str(fd, "currency") || "KGS",
    period_type: str(fd, "period_type"),
    period_months: int(fd, "period_months") ?? 1,
    composition,
    stories_method: opt(fd, "stories_method"),
    description: opt(fd, "description"),
    notes: opt(fd, "notes"),
  };
}

export const createTariff = action(async (fd) => {
  const supabase = await createClient();
  const name = str(fd, "name");
  if (!name) throw new Error("Укажите название");
  const code = (str(fd, "code") || name).toLowerCase().replace(/[^a-z0-9а-я]+/gi, "_").slice(0, 40) + "_" + Date.now().toString(36);
  const t = check(await supabase.from("tariffs").insert({ name, code, is_public: fd.get("is_public") === "on", price_on_request: fd.get("price_on_request") === "on", sort: int(fd, "sort") ?? 100 }).select("id").single()) as { id: string };
  check(await supabase.rpc("new_tariff_version", { p_tariff: t.id, p: versionPayload(fd) }));
  revalidatePath("/app/tariffs");
  return "Тариф создан";
});

export const newVersion = action(async (fd) => {
  const supabase = await createClient();
  check(await supabase.rpc("new_tariff_version", { p_tariff: str(fd, "tariff_id"), p: versionPayload(fd) }));
  revalidatePath("/app/tariffs");
  return "Создана новая версия. Существующие договоры не изменились.";
});

export const updateTariffMeta = action(async (fd) => {
  const supabase = await createClient();
  check(
    await supabase
      .from("tariffs")
      .update({
        name: str(fd, "name"),
        is_public: fd.get("is_public") === "on",
        price_on_request: fd.get("price_on_request") === "on",
        sort: int(fd, "sort") ?? 100,
        archived_at: fd.get("archived") === "on" ? new Date().toISOString() : null,
      })
      .eq("id", str(fd, "tariff_id")),
  );
  revalidatePath("/app/tariffs");
  return "Сохранено";
});
