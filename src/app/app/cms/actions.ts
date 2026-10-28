"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { action, check, int, opt, str } from "@/lib/actions";

// Редактор ограничен безопасными шаблонами блоков: только текстовые поля, без HTML.
function parseItems(raw: string, kind: string) {
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [a, b, c] = l.split("|").map((x) => x.trim());
      if (kind === "faq") return { q: a, a: b ?? "" };
      if (kind === "cases") return { title: a, text: b ?? "", metric: c ?? "" };
      return { title: a, text: b ?? "" };
    });
}

export const saveBlock = action(async (fd) => {
  const supabase = await createClient();
  const type = str(fd, "type");
  const content: Record<string, unknown> = {};
  for (const k of ["eyebrow", "title", "subtitle", "cta", "secondary", "text"]) {
    const v = opt(fd, k);
    if (v !== null) content[k] = v.slice(0, 600);
  }
  if (fd.has("items")) content.items = parseItems(str(fd, "items"), type).slice(0, 24);
  check(await supabase.from("site_blocks").update({ draft: content, visible: fd.get("visible") === "on", sort: int(fd, "sort") ?? 100, updated_at: new Date().toISOString() }).eq("key", str(fd, "key")));
  revalidatePath("/app/cms");
  return "Черновик блока сохранён. Опубликуйте, чтобы изменения появились на сайте.";
});

export const saveSettings = action(async (fd) => {
  const supabase = await createClient();
  check(
    await supabase
      .from("site_settings")
      .update({ seo_title: str(fd, "seo_title"), seo_description: str(fd, "seo_description"), phone: opt(fd, "phone"), email: opt(fd, "email"), address: opt(fd, "address"), instagram: opt(fd, "instagram"), telegram: opt(fd, "telegram"), whatsapp: opt(fd, "whatsapp"), updated_at: new Date().toISOString() })
      .eq("id", 1),
  );
  revalidatePath("/");
  revalidatePath("/app/cms");
  return "Контакты и SEO сохранены (применяются сразу)";
});

export const publish = action(async (fd) => {
  const supabase = await createClient();
  check(await supabase.rpc("publish_site", { p_note: opt(fd, "note") }));
  revalidatePath("/");
  revalidatePath("/app/cms");
  return "Сайт опубликован, версия сохранена";
});

export const restoreVersion = action(async (fd) => {
  const supabase = await createClient();
  check(await supabase.rpc("restore_site_version", { p_id: Number(str(fd, "version_id")) }));
  revalidatePath("/app/cms");
  return "Версия восстановлена в черновик. Проверьте предпросмотр и опубликуйте.";
});
