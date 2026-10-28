"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { action, check, str } from "@/lib/actions";

export const markRead = action(async (fd) => {
  const supabase = await createClient();
  check(await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", str(fd, "id")).is("read_at", null));
  revalidatePath("/app", "layout");
  return "Прочитано";
});

export const markAllRead = action(async () => {
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  check(await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", u.user!.id).is("read_at", null));
  revalidatePath("/app", "layout");
  return "Все отмечены прочитанными";
});

export const archive = action(async (fd) => {
  const supabase = await createClient();
  check(await supabase.from("notifications").update({ archived_at: new Date().toISOString(), read_at: new Date().toISOString() }).eq("id", str(fd, "id")));
  revalidatePath("/app", "layout");
  return "В архиве";
});
