"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { action, check, int, opt, str } from "@/lib/actions";
import { parseMoney } from "@/lib/format";

export const createCampaign = action(async (fd) => {
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  const row = check(
    await supabase
      .from("campaigns")
      .insert({
        project_id: str(fd, "project_id"),
        name: str(fd, "name") || "Кампания",
        platform: str(fd, "platform"),
        goal: opt(fd, "goal"),
        target_leads: int(fd, "target_leads"),
        ad_account_id: opt(fd, "ad_account_id"),
        pixel: opt(fd, "pixel"),
        starts_on: opt(fd, "starts_on"),
        ends_on: opt(fd, "ends_on"),
        budget_minor: parseMoney(fd.get("budget")) ?? 0,
        currency: str(fd, "currency") || "USD",
        owner_id: opt(fd, "owner_id") ?? u.user!.id,
        check_every_days: int(fd, "check_every_days") ?? 2,
        status: "active",
        created_by: u.user!.id,
      })
      .select("id")
      .single(),
  ) as { id: string };
  redirect(`/app/campaigns/${row.id}`);
});

export const addMetric = action(async (fd) => {
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  check(
    await supabase.from("campaign_metrics").upsert(
      { campaign_id: str(fd, "id"), day: str(fd, "day"), spend_minor: parseMoney(fd.get("spend")) ?? 0, leads: int(fd, "leads") ?? 0, impressions: int(fd, "impressions"), clicks: int(fd, "clicks"), note: opt(fd, "note"), source: "manual", created_by: u.user!.id },
      { onConflict: "campaign_id,day" },
    ),
  );
  revalidatePath(`/app/campaigns/${str(fd, "id")}`);
  return "Показатели записаны (ручной ввод)";
});

export const updateCampaign = action(async (fd) => {
  const supabase = await createClient();
  check(await supabase.from("campaigns").update({ status: str(fd, "status"), notes: opt(fd, "notes"), budget_minor: parseMoney(fd.get("budget")) ?? 0 }).eq("id", str(fd, "id")));
  revalidatePath(`/app/campaigns/${str(fd, "id")}`);
  return "Сохранено";
});
