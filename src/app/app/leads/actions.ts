"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { action, check, opt, str } from "@/lib/actions";
import { parseMoney } from "@/lib/format";

export const takeLead = action(async (fd) => {
  const supabase = await createClient();
  check(await supabase.rpc("lead_take", { p_lead: str(fd, "id") }));
  revalidatePath("/app/leads");
  return "Заявка взята в работу";
});

export const setStage = action(async (fd) => {
  const supabase = await createClient();
  check(await supabase.rpc("lead_set_stage", { p_lead: str(fd, "id"), p_stage: str(fd, "stage"), p_note: opt(fd, "note") }));
  revalidatePath(`/app/leads/${str(fd, "id")}`);
  return "Стадия обновлена";
});

export const addLeadEvent = action(async (fd) => {
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  const body = str(fd, "body");
  if (!body) throw new Error("Введите текст");
  check(await supabase.from("lead_events").insert({ lead_id: str(fd, "id"), actor_id: u.user!.id, kind: str(fd, "kind") || "comment", data: { text: body } }));
  revalidatePath(`/app/leads/${str(fd, "id")}`);
  return "Добавлено";
});

export const updateLead = action(async (fd) => {
  const supabase = await createClient();
  check(
    await supabase
      .from("leads")
      .update({
        business: opt(fd, "business"),
        email: opt(fd, "email"),
        next_action: opt(fd, "next_action"),
        next_action_at: opt(fd, "next_action_at") ? new Date(`${str(fd, "next_action_at")}:00+06:00`).toISOString() : null,
        expected_minor: parseMoney(fd.get("expected")),
        tariff_id: opt(fd, "tariff_id"),
        assignee_id: opt(fd, "assignee_id"),
      })
      .eq("id", str(fd, "id")),
  );
  revalidatePath(`/app/leads/${str(fd, "id")}`);
  return "Сохранено";
});

export const convertLead = action(async (fd) => {
  const supabase = await createClient();
  const clientId = check(await supabase.rpc("lead_convert", { p_lead: str(fd, "id"), p_company: str(fd, "company") }));
  redirect(`/app/projects/new?client=${clientId}&lead=${str(fd, "id")}`);
});

export const createManualLead = action(async (fd) => {
  const supabase = await createClient();
  const r = check(
    await supabase.rpc("submit_lead", {
      p: { name: str(fd, "name"), phone: str(fd, "phone"), business: str(fd, "business"), service: str(fd, "service"), comment: str(fd, "comment"), consent: true, source: str(fd, "source") || "manual" },
    }),
  ) as { id: string };
  redirect(`/app/leads/${r.id}`);
});
