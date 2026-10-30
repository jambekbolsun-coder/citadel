import { notFound } from "next/navigation";
import { requireActive } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { LoadError, PageHeader } from "@/components/ui";
import type { PublicTariff, Slide } from "@/lib/site-model";
import DEFAULTS from "@/lib/site-defaults.json";
import { SlideEditor } from "./slide-editor";

export const metadata = { title: "Секция сайта" };

export default async function EditSlide({ params }: PageProps<"/app/cms/[key]">) {
  const { key } = await params;
  await requireActive("cms.manage");
  if (!/^[a-z0-9_]{2,40}$/.test(key)) notFound();
  const supabase = await createClient();
  const [{ data, error }, { data: tariffs }] = await Promise.all([
    supabase.from("site_blocks").select("key,type,visible,draft,published,updated_at").eq("key", key).maybeSingle(),
    supabase.rpc("public_tariffs"),
  ]);
  if (error) return <LoadError title="Не удалось загрузить секцию" text={error.message} back="/app/cms" />;
  if (!data || data.type !== "slide") notFound();
  const hasDefault = (DEFAULTS as { key: string }[]).some((d) => d.key === key);
  const s = data.draft as Slide;
  return (
    <>
      <PageHeader back="/app/cms" title={s.rubric || s.title || key} subtitle="Изменения сохраняются в черновик. Посетители увидят их после публикации на странице «Сайт»." />
      <SlideEditor key={data.updated_at} blockKey={key} visible={data.visible} slide={s} tariffs={(tariffs ?? []) as PublicTariff[]} hasDefault={hasDefault} savedAt={data.updated_at} changed={JSON.stringify(data.draft) !== JSON.stringify(data.published)} />
    </>
  );
}
