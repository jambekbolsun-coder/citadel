"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { action, check, opt, str } from "@/lib/actions";
import { todayLocal, localToIso } from "@/lib/format";

export const startCheck = action(async (fd) => {
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  const day = todayLocal();
  check(await supabase.from("project_admin_checks").upsert({ project_id: str(fd, "project_id"), admin_id: u.user!.id, day, due_at: localToIso(day, "20:00") }, { onConflict: "project_id,day", ignoreDuplicates: true }));
  revalidatePath("/app/checks");
  return "Проверка на сегодня создана";
});

export const saveCheck = action(async (fd) => {
  const supabase = await createClient();
  const id = str(fd, "id");
  const { data: cur } = await supabase.from("project_admin_checks").select("contacts").eq("id", id).single();
  const contacts = [...((cur?.contacts as unknown[]) ?? [])];
  if (str(fd, "c_with")) {
    contacts.push({ with: str(fd, "c_with"), channel: str(fd, "c_channel"), at: new Date().toISOString(), reason: str(fd, "c_reason"), result: str(fd, "c_result"), promise: str(fd, "c_promise"), next: str(fd, "c_next") });
  }
  const complete = fd.get("complete") === "on";
  if (complete && !str(fd, "summary")) throw new Error("Заполните итог проверки");
  check(
    await supabase
      .from("project_admin_checks")
      .update({ summary: opt(fd, "summary"), stories_note: opt(fd, "stories_note"), delays: opt(fd, "delays"), contacts, escalated: fd.get("escalated") === "on", completed_at: complete ? new Date().toISOString() : null })
      .eq("id", id),
  );
  revalidatePath(`/app/checks/${id}`);
  return complete ? "Проверка завершена (чужие задачи при этом не закрываются)" : "Сохранено";
});
