"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { action, check, int, opt, str } from "@/lib/actions";
import { parseLines, type Slide, type SlideImage } from "@/lib/site-model";
import DEFAULTS from "@/lib/site-defaults.json";

// Редактор ограничен безопасными шаблонами блоков: только текстовые поля и ссылки на изображения, без HTML.
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

const revalidateSite = () => {
  revalidatePath("/");
  revalidatePath("/app/cms", "layout");
};

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

// ───────── секции-слайды (страницы коммерческого предложения) ─────────
const SUPABASE = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
const SITE_BUCKET = `${SUPABASE}/storage/v1/object/public/site/`;
const IMAGE_TYPES: Record<string, string> = { "image/webp": "webp", "image/png": "png", "image/jpeg": "jpg", "image/avif": "avif" };

/** Разрешены только свои файлы (/site/…, /brand/…) и загруженные в хранилище сайта — без внешних адресов. */
function safeSrc(src: string) {
  if (/^\/(site|brand)\/[\w./-]+$/.test(src) && !src.includes("..")) return src;
  if (SUPABASE && src.startsWith(SITE_BUCKET) && !src.includes("..")) return src;
  throw new Error(`Изображение «${src.slice(0, 60)}»: укажите файл из /site/… или загрузите его через форму`);
}

const t = (fd: FormData, k: string, max = 400) => str(fd, k).slice(0, max);
const lines = (fd: FormData, k: string, max = 24) => str(fd, k).split("\n").map((x) => x.trim()).filter(Boolean).slice(0, max).map((x) => x.slice(0, 160));
const flag = (fd: FormData, k: string) => fd.get(k) === "on";
const pick = <T extends string>(v: string, allowed: readonly T[], def: T): T => ((allowed as readonly string[]).includes(v) ? (v as T) : def);

function cta(fd: FormData, p: string) {
  const label = t(fd, `${p}_label`, 60);
  if (!label) return undefined;
  const actionKind = pick(str(fd, `${p}_action`), ["lead", "tariffs", "link"] as const, "lead");
  const href = t(fd, `${p}_href`, 300);
  if (actionKind === "link" && !/^(https:\/\/|#|\/)/.test(href)) throw new Error("Ссылка кнопки должна начинаться с https://, / или #");
  return { label, action: actionKind, ...(actionKind === "link" ? { href } : {}) };
}

async function uploadImages(fd: FormData) {
  const files = fd.getAll("upload").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return [] as SlideImage[];
  const supabase = await createClient();
  const out: SlideImage[] = [];
  for (const f of files.slice(0, 6)) {
    const ext = IMAGE_TYPES[f.type];
    if (!ext) throw new Error(`«${f.name}»: допустимы WebP, PNG, JPEG или AVIF`);
    if (f.size > 5 * 1024 * 1024) throw new Error(`«${f.name}»: файл больше 5 МБ — уменьшите изображение`);
    const path = `cms/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${ext}`;
    check(await supabase.storage.from("site").upload(path, f, { contentType: f.type, cacheControl: "31536000", upsert: false }));
    out.push({ src: `${SITE_BUCKET}${path}`, alt: str(fd, "upload_alt").slice(0, 200) || f.name.replace(/\.[^.]+$/, "") });
  }
  return out;
}

export const saveSlide = action(async (fd) => {
  const key = str(fd, "key");
  const stats = parseLines(str(fd, "stats")).slice(0, 12).map(([value, label, note, flags]) => {
    const f = (flags ?? "").toLowerCase();
    return { value: (value ?? "").slice(0, 40), ...(label ? { label: label.slice(0, 80) } : {}), ...(note ? { note: note.slice(0, 120) } : {}), ...(f.includes("широк") ? { wide: true } : {}), ...(f.includes("бел") ? { plain: true } : {}) };
  });
  const images: SlideImage[] = parseLines(str(fd, "images")).slice(0, 8).map(([src, alt, caption, sub]) => ({
    src: safeSrc(src ?? ""),
    alt: (alt ?? "").slice(0, 200),
    ...(caption ? { caption: caption.slice(0, 80) } : {}),
    ...(sub ? { sub: sub.slice(0, 80) } : {}),
  }));
  images.push(...(await uploadImages(fd)));
  const icons = parseLines(str(fd, "icons")).slice(0, 8).map(([icon, label]) => ({ icon: (icon ?? "").toLowerCase(), label: (label ?? "").slice(0, 40) }));

  const content: Slide = {
    layout: pick(str(fd, "layout"), ["hero", "default", "contact"] as const, "default"),
    anchor: pick(str(fd, "anchor"), ["", "top", "services", "tariffs", "cases", "about", "contacts"] as const, ""),
    rubric: t(fd, "rubric", 80),
    pill: t(fd, "pill", 120),
    title: t(fd, "title", 200),
    title_accent: t(fd, "title_accent", 120),
    tariff_code: t(fd, "tariff_code", 60),
    price: t(fd, "price", 40),
    price_unit: t(fd, "price_unit", 120),
    price_accent: flag(fd, "price_accent"),
    price_unit_large: flag(fd, "price_unit_large"),
    lead: t(fd, "lead", 400),
    lead_accent: flag(fd, "lead_accent"),
    stats_style: pick(str(fd, "stats_style"), ["team", "big", "grid", "grid3"] as const, "grid"),
    stats,
    bullets: lines(fd, "bullets", 12),
    chips_title: t(fd, "chips_title", 80),
    chips: lines(fd, "chips", 12),
    note: t(fd, "note", 300),
    card: { kicker: t(fd, "card_kicker", 80), title: t(fd, "card_title", 120), title_accent: flag(fd, "card_title_accent"), text: t(fd, "card_text", 400), text_accent: flag(fd, "card_text_accent") },
    badge: t(fd, "badge", 120),
    icons,
    footnote: t(fd, "footnote", 400),
    image_style: pick(str(fd, "image_style"), ["hero", "object", "phone", "panel", "phones"] as const, "panel"),
    images,
    cta: cta(fd, "cta"),
    cta2: cta(fd, "cta2"),
  };
  const supabase = await createClient();
  const rows = check(
    await supabase
      .from("site_blocks")
      .update({ draft: content, visible: fd.get("visible") === "on", updated_at: new Date().toISOString() })
      .eq("key", key)
      .eq("type", "slide")
      .select("key"),
  ) as { key: string }[];
  if (rows.length !== 1) throw new Error("Секция не найдена или нет права cms.manage");
  revalidateSite();
  return images.length && fd.getAll("upload").some((f) => f instanceof File && f.size > 0)
    ? "Изображение загружено, черновик сохранён. Проверьте предпросмотр и опубликуйте."
    : "Черновик сохранён. Проверьте предпросмотр и нажмите «Опубликовать».";
});

/** Вернуть секции текст и изображения из презентации (только черновик). */
export const resetSlide = action(async (fd) => {
  const key = str(fd, "key");
  const def = (DEFAULTS as { key: string; content: Slide }[]).find((d) => d.key === key);
  if (!def) throw new Error("Для этой секции нет исходного текста презентации");
  const supabase = await createClient();
  const rows = check(await supabase.from("site_blocks").update({ draft: def.content, updated_at: new Date().toISOString() }).eq("key", key).select("key")) as { key: string }[];
  if (rows.length !== 1) throw new Error("Нет права cms.manage");
  revalidateSite();
  return "Черновик секции заменён текстом презентации. Опубликуйте, чтобы применить.";
});

/** Порядок и видимость секций: применяются сразу (как и раньше в CMS). */
export const moveBlock = action(async (fd) => {
  const supabase = await createClient();
  const key = str(fd, "key");
  const dir = str(fd, "dir");
  const { data } = await supabase.from("site_blocks").select("key,sort").order("sort");
  const list = (data ?? []) as { key: string; sort: number }[];
  const i = list.findIndex((b) => b.key === key);
  const j = dir === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= list.length) return "Секция уже на краю списка";
  const a = list[i], b = list[j];
  // меняем местами значения sort (при равных — разводим)
  const sa = b.sort === a.sort ? a.sort + (dir === "up" ? -1 : 1) : b.sort;
  check(await supabase.from("site_blocks").update({ sort: sa }).eq("key", a.key));
  check(await supabase.from("site_blocks").update({ sort: a.sort }).eq("key", b.key));
  revalidateSite();
  return "Порядок изменён";
});

export const toggleBlock = action(async (fd) => {
  const supabase = await createClient();
  const rows = check(await supabase.from("site_blocks").update({ visible: fd.get("visible") === "1" }).eq("key", str(fd, "key")).select("key")) as { key: string }[];
  if (rows.length !== 1) throw new Error("Нет права cms.manage");
  revalidateSite();
  return fd.get("visible") === "1" ? "Секция показана на сайте" : "Секция скрыта с сайта";
});

export const saveSettings = action(async (fd) => {
  const supabase = await createClient();
  check(
    await supabase
      .from("site_settings")
      .update({ seo_title: str(fd, "seo_title"), seo_description: str(fd, "seo_description"), phone: opt(fd, "phone"), email: opt(fd, "email"), address: opt(fd, "address"), instagram: opt(fd, "instagram"), telegram: opt(fd, "telegram"), whatsapp: opt(fd, "whatsapp"), updated_at: new Date().toISOString() })
      .eq("id", 1),
  );
  revalidateSite();
  return "Контакты и SEO сохранены (применяются сразу)";
});

export const publish = action(async (fd) => {
  const supabase = await createClient();
  check(await supabase.rpc("publish_site", { p_note: opt(fd, "note") }));
  revalidateSite();
  return "Сайт опубликован, версия сохранена";
});

export const restoreVersion = action(async (fd) => {
  const supabase = await createClient();
  check(await supabase.rpc("restore_site_version", { p_id: Number(str(fd, "version_id")) }));
  revalidatePath("/app/cms", "layout");
  return "Версия восстановлена в черновик. Проверьте предпросмотр и опубликуйте.";
});
