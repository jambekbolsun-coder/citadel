import "server-only";
import { createClient } from "@/lib/supabase/server";
export type { Slide, SlideImage, SlideStat, PublicTariff } from "@/lib/site-model";
import type { PublicTariff } from "@/lib/site-model";

export type Block = { key: string; type: string; sort: number; visible: boolean; content: Record<string, unknown> };

export async function loadSite(mode: "published" | "draft" = "published") {
  const supabase = await createClient();
  const cols: string = mode === "draft" ? "key,type,sort,visible,draft,published" : "key,type,sort,visible,published";
  const [{ data: blocks }, { data: settings }, { data: tariffs }] = await Promise.all([
    // посетители читают только опубликованное (черновик закрыт для anon правами колонок, миграция 0026)
    supabase.from("site_blocks").select(cols).order("sort"),
    supabase.from("site_settings").select("*").eq("id", 1).maybeSingle(),
    supabase.rpc("public_tariffs"),
  ]);
  type Row = { key: string; type: string; sort: number; visible: boolean; draft?: Record<string, unknown>; published: Record<string, unknown> | null };
  const list: Block[] = ((blocks ?? []) as unknown as Row[])
    .map((b) => ({
      key: b.key,
      type: b.type,
      sort: b.sort,
      visible: b.visible,
      content: (mode === "draft" ? b.draft : b.published) ?? {},
    }))
    .filter((b) => b.visible);
  return { blocks: list, settings: settings ?? {}, tariffs: (tariffs ?? []) as PublicTariff[] };
}
