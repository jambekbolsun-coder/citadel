"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { action, check, opt, str } from "@/lib/actions";
import { localInputToIso } from "@/lib/format";

const rc = (id: string) => revalidatePath(`/app/content/${id}`);

export const assignContent = action(async (fd) => {
  const supabase = await createClient();
  check(
    await supabase.rpc("content_assign", {
      p_id: str(fd, "id"),
      p_assignee: opt(fd, "assignee_id"),
      p_reviewer: opt(fd, "reviewer_id"),
      p_brief: str(fd, "brief"),
      p_prep_due: localInputToIso(fd.get("prep_due")),
      p_publish_due: localInputToIso(fd.get("publish_due")),
    }),
  );
  rc(str(fd, "id"));
  return "Назначено, исполнитель уведомлён";
});

export const transitionContent = action(async (fd) => {
  const supabase = await createClient();
  check(await supabase.rpc("content_transition", { p_id: str(fd, "id"), p_to: str(fd, "to"), p_note: opt(fd, "note"), p_result_url: opt(fd, "result_url") }));
  rc(str(fd, "id"));
  revalidatePath("/app/today");
  return "Статус обновлён";
});

export const saveContentDetails = action(async (fd) => {
  const supabase = await createClient();
  const slidesRaw = str(fd, "slides");
  const slides = slidesRaw ? slidesRaw.split("\n").map((l, i) => ({ n: i + 1, spec: l.trim() })).filter((x) => x.spec) : null;
  check(
    await supabase
      .from("content_items")
      .update({ title: str(fd, "title"), goal: opt(fd, "goal"), format: opt(fd, "format"), script: opt(fd, "script"), links: opt(fd, "links"), slides })
      .eq("id", str(fd, "id")),
  );
  rc(str(fd, "id"));
  return "Сохранено";
});

export const addPlacement = action(async (fd) => {
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  const url = str(fd, "url");
  if (!/^https?:\/\//.test(url)) throw new Error("Нужна ссылка на публикацию (https://…)");
  check(await supabase.from("placements").insert({ content_id: str(fd, "id"), platform: str(fd, "platform"), url, published_at: localInputToIso(fd.get("published_at")) ?? new Date().toISOString(), created_by: u.user!.id }));
  rc(str(fd, "id"));
  return "Размещение добавлено";
});

export const checkPlacement = action(async (fd) => {
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  check(await supabase.from("placements").update({ checked_by: u.user!.id, checked_at: new Date().toISOString() }).eq("id", str(fd, "placement_id")));
  rc(str(fd, "id"));
  return "Публикация проверена";
});
