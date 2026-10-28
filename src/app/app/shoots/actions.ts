"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { action, check, int, opt, str } from "@/lib/actions";
import { dateTime, localDateOf, localInputToIso, localToIso } from "@/lib/format";
import { describe, expand, ruleFromForm } from "@/lib/recurrence";

const rs = (id: string) => revalidatePath(`/app/shoots/${id}`);

export const createShoot = action(async (fd) => {
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  const projectId = str(fd, "project_id");
  const starts = localInputToIso(fd.get("starts_at"));
  const ends = localInputToIso(fd.get("ends_at"));
  if (!projectId || !starts || !ends) throw new Error("Проект, начало и окончание обязательны");
  if (new Date(ends) <= new Date(starts)) throw new Error("Окончание должно быть позже начала");
  const base = {
    project_id: projectId,
    title: str(fd, "title") || "Съёмка",
    location: opt(fd, "location"),
    planned_items: int(fd, "planned_items"),
    topics: opt(fd, "topics"),
    notes: opt(fd, "notes"),
    equipment: opt(fd, "equipment"),
    ambassador_needed: fd.get("ambassador_needed") === "on",
    created_by: u.user!.id,
  };
  const { data: periods } = await supabase.from("project_periods").select("id,starts_on,ends_on").eq("project_id", projectId);
  const periodOf = (iso: string) => {
    const d = localDateOf(iso);
    return ((periods ?? []) as { id: string; starts_on: string; ends_on: string }[]).find((p) => p.starts_on <= d && p.ends_on >= d)?.id ?? null;
  };
  const rule = ruleFromForm(fd);
  if (!rule) {
    const row = check(await supabase.from("shoots").insert({ ...base, period_id: periodOf(starts), starts_at: starts, ends_at: ends }).select("id").single()) as { id: string };
    redirect(`/app/shoots/${row.id}`);
  }
  const raw = String(fd.get("starts_at"));
  const day = raw.slice(0, 10);
  const hm = raw.slice(11, 16);
  const duration = new Date(ends).getTime() - new Date(starts).getTime();
  const dates = expand(day, rule);
  if (dates.length < 2) throw new Error("По этому правилу получается меньше двух повторов — проверьте даты");
  const ser = check(await supabase.from("recurrence_series").insert({ entity: "shoot", rule, summary: describe(day, rule), created_by: u.user!.id }).select("id").single()) as { id: string };
  const rows = check(
    await supabase
      .from("shoots")
      .insert(dates.map((d) => {
        const s0 = localToIso(d, hm);
        return { ...base, series_id: ser.id, period_id: periodOf(s0), starts_at: s0, ends_at: new Date(new Date(s0).getTime() + duration).toISOString() };
      }))
      .select("id,starts_at"),
  ) as { id: string; starts_at: string }[];
  rows.sort((x, y) => x.starts_at.localeCompare(y.starts_at));
  redirect(`/app/shoots/${rows[0].id}?series=created`);
});

type SetResult = { ok: boolean; conflicts: { title: string; starts_at: string }[] };

export const addParticipant = action(async (fd) => {
  const supabase = await createClient();
  const params = { p_user: str(fd, "user_id"), p_role: str(fd, "role"), p_force: fd.get("force") === "on" };
  if (fd.get("apply_series") === "on") {
    const { data: sh } = await supabase.from("shoots").select("series_id,starts_at").eq("id", str(fd, "id")).single();
    if (sh?.series_id) {
      const { data: list } = await supabase.from("shoots").select("id,starts_at").eq("series_id", sh.series_id).eq("status", "planned").gte("starts_at", sh.starts_at).order("starts_at");
      let ok = 0;
      const blocked: string[] = [];
      for (const x of (list ?? []) as { id: string; starts_at: string }[]) {
        const r = check(await supabase.rpc("shoot_set_participant", { p_shoot: x.id, ...params })) as SetResult;
        if (r.ok) ok++;
        else blocked.push(dateTime(x.starts_at));
      }
      rs(str(fd, "id"));
      if (blocked.length) return `Назначен на ${ok} съёмок серии. Не назначен из-за конфликта: ${blocked.join(", ")} — отметьте «несмотря на конфликт», если согласовано.`;
      return `Назначен на все будущие съёмки серии: ${ok}`;
    }
  }
  const r = check(await supabase.rpc("shoot_set_participant", { p_shoot: str(fd, "id"), ...params })) as SetResult;
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
