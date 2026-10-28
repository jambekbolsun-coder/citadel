"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { action, check, int, opt, str } from "@/lib/actions";
import { dateTime, localInputToIso } from "@/lib/format";

const rs = (id: string) => revalidatePath(`/app/shoots/${id}`);

export const createShoot = action(async (fd) => {
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  const projectId = str(fd, "project_id");
  const starts = localInputToIso(fd.get("starts_at"));
  const ends = localInputToIso(fd.get("ends_at"));
  if (!projectId || !starts || !ends) throw new Error("Проект, начало и окончание обязательны");
  if (new Date(ends) <= new Date(starts)) throw new Error("Окончание должно быть позже начала");
  const { data: per } = await supabase.from("project_periods").select("id").eq("project_id", projectId).lte("starts_on", starts.slice(0, 10)).gte("ends_on", starts.slice(0, 10)).maybeSingle();
  const row = check(
    await supabase
      .from("shoots")
      .insert({
        project_id: projectId,
        period_id: per?.id ?? null,
        title: str(fd, "title") || "Съёмка",
        starts_at: starts,
        ends_at: ends,
        location: opt(fd, "location"),
        planned_items: int(fd, "planned_items"),
        topics: opt(fd, "topics"),
        notes: opt(fd, "notes"),
        equipment: opt(fd, "equipment"),
        ambassador_needed: fd.get("ambassador_needed") === "on",
        created_by: u.user!.id,
      })
      .select("id")
      .single(),
  ) as { id: string };
  redirect(`/app/shoots/${row.id}`);
});

export const addParticipant = action(async (fd) => {
  const supabase = await createClient();
  const r = check(await supabase.rpc("shoot_set_participant", { p_shoot: str(fd, "id"), p_user: str(fd, "user_id"), p_role: str(fd, "role"), p_force: fd.get("force") === "on" })) as { ok: boolean; conflicts: { title: string; starts_at: string }[] };
  if (!r.ok) {
    throw new Error(`Конфликт: участник уже занят — ${r.conflicts.map((c) => `${c.title} (${dateTime(c.starts_at)})`).join(", ")}. Отметьте «назначить несмотря на конфликт», если это согласовано.`);
  }
  rs(str(fd, "id"));
  return r.conflicts.length ? "Назначен с конфликтом (зафиксировано в истории)" : "Участник назначен и уведомлён";
});

export const removeParticipant = action(async (fd) => {
  const supabase = await createClient();
  check(await supabase.from("shoot_participants").delete().eq("shoot_id", str(fd, "id")).eq("user_id", str(fd, "user_id")));
  rs(str(fd, "id"));
  return "Участник снят";
});

export const respondShoot = action(async (fd) => {
  const supabase = await createClient();
  check(await supabase.rpc("shoot_respond", { p_shoot: str(fd, "id"), p_response: str(fd, "response"), p_reason: opt(fd, "reason") }));
  rs(str(fd, "id"));
  return "Ответ сохранён";
});

export const rescheduleShoot = action(async (fd) => {
  const supabase = await createClient();
  check(await supabase.rpc("shoot_reschedule", { p_shoot: str(fd, "id"), p_start: localInputToIso(fd.get("starts_at")), p_end: localInputToIso(fd.get("ends_at")), p_reason: str(fd, "reason") }));
  rs(str(fd, "id"));
  return "Перенесено. Участники должны подтвердить заново.";
});

export const completeShoot = action(async (fd) => {
  const supabase = await createClient();
  const src = str(fd, "sources_url");
  if (!src) throw new Error("Прикрепите ссылку на исходники");
  const { data: u } = await supabase.auth.getUser();
  check(await supabase.from("shoots").update({ status: "done", actual_start: localInputToIso(fd.get("actual_start")), actual_end: localInputToIso(fd.get("actual_end")), sources_url: src }).eq("id", str(fd, "id")));
  await supabase.from("comments").insert({ entity_type: "shoot", entity_id: str(fd, "id"), author_id: u.user!.id, body: `Съёмка проведена. Исходники: ${src}` });
  rs(str(fd, "id"));
  return "Съёмка отмечена проведённой";
});

export const cancelShoot = action(async (fd) => {
  const supabase = await createClient();
  const reason = str(fd, "reason");
  if (!reason) throw new Error("Укажите причину отмены");
  check(await supabase.from("shoots").update({ status: "cancelled", cancel_reason: reason }).eq("id", str(fd, "id")));
  rs(str(fd, "id"));
  return "Съёмка отменена";
});

export const updateShootBrief = action(async (fd) => {
  const supabase = await createClient();
  check(await supabase.from("shoots").update({ topics: opt(fd, "topics"), notes: opt(fd, "notes"), equipment: opt(fd, "equipment"), location: opt(fd, "location"), planned_items: int(fd, "planned_items"), ambassador_needed: fd.get("ambassador_needed") === "on" }).eq("id", str(fd, "id")));
  rs(str(fd, "id"));
  return "Сохранено";
});
