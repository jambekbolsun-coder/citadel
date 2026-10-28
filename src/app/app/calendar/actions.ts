"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { action, check, opt, str } from "@/lib/actions";
import { localInputToIso, localToIso, time } from "@/lib/format";

export const addCalendarEvent = action(async (fd) => {
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  const starts = localInputToIso(fd.get("starts_at"));
  const ends = localInputToIso(fd.get("ends_at"));
  if (!starts || !ends || new Date(ends) <= new Date(starts)) throw new Error("Проверьте время начала и окончания");
  check(await supabase.from("calendar_events").insert({ user_id: opt(fd, "user_id") ?? u.user!.id, kind: str(fd, "kind"), title: str(fd, "title") || "Событие", starts_at: starts, ends_at: ends, created_by: u.user!.id }));
  revalidatePath("/app/calendar");
  return "Добавлено в календарь";
});

export const deleteCalendarEvent = action(async (fd) => {
  const supabase = await createClient();
  check(await supabase.from("calendar_events").delete().eq("id", str(fd, "event_id")));
  revalidatePath("/app/calendar");
  return "Удалено";
});

/** Перенос события на другой день перетаскиванием: время суток сохраняется, правила и история — как при обычном переносе. */
export const moveCalendarItem = action(async (fd) => {
  const supabase = await createClient();
  const kind = str(fd, "kind");
  const id = str(fd, "id");
  const day = str(fd, "day");
  const reason = str(fd, "reason") || "Перенос в календаре";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("Некорректная дата");
  const shiftTo = (iso: string) => localToIso(day, time(iso));
  if (kind === "task") {
    const { data: t } = await supabase.from("tasks").select("due_at").eq("id", id).single();
    if (!t?.due_at) throw new Error("У задачи нет срока");
    check(await supabase.rpc("task_reschedule", { p_id: id, p_due: shiftTo(t.due_at), p_reason: reason, p_assignee: null }));
  } else if (kind === "shoot") {
    const { data: sh } = await supabase.from("shoots").select("starts_at,ends_at").eq("id", id).single();
    if (!sh) throw new Error("Съёмка не найдена");
    const start = shiftTo(sh.starts_at);
    const end = new Date(new Date(start).getTime() + (new Date(sh.ends_at).getTime() - new Date(sh.starts_at).getTime())).toISOString();
    check(await supabase.rpc("shoot_reschedule", { p_shoot: id, p_start: start, p_end: end, p_reason: reason }));
  } else if (kind === "content" || kind === "publish") {
    const { data: c } = await supabase.from("content_items").select("prep_due,publish_due").eq("id", id).single();
    const cur = kind === "content" ? c?.prep_due : c?.publish_due;
    if (!cur) throw new Error("У материала нет этого срока");
    check(await supabase.rpc("content_reschedule", { p_id: id, p_prep_due: kind === "content" ? shiftTo(cur) : null, p_publish_due: kind === "publish" ? shiftTo(cur) : null, p_reason: reason }));
  } else throw new Error("Это событие нельзя перенести перетаскиванием");
  revalidatePath("/app/calendar");
  return `Перенесено на ${day.split("-").reverse().join(".")}`;
});
