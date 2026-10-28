import type { Metadata } from "next";
import { loadSite } from "@/lib/site";
import { SiteView } from "@/components/site-view";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { settings } = await loadSite();
  const s = settings as Record<string, string>;
  return {
    title: { absolute: s.seo_title ?? "SMM KADR" },
    description: s.seo_description,
    openGraph: { title: s.seo_title, description: s.seo_description, images: ["/og.jpg"], locale: "ru_RU", type: "website" },
  };
}

export default async function Home() {
  const { blocks, settings, tariffs } = await loadSite();
  return <SiteView blocks={blocks} settings={settings as Record<string, string | null>} tariffs={tariffs} />;
}
