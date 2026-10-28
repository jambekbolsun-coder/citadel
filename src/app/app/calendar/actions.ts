"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { action, check, opt, str } from "@/lib/actions";
import { localInputToIso } from "@/lib/format";

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
