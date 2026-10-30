import { requireActive } from "@/lib/auth";
import { loadSite } from "@/lib/site";
import { SiteView } from "@/components/site/site-view";

export const metadata = { title: "Предпросмотр сайта" };

export default async function Preview() {
  await requireActive("cms.manage");
  const { blocks, settings, tariffs } = await loadSite("draft");
  return (
    <div className="-mx-4 -my-5 md:-mx-6 md:-my-6">
      <SiteView blocks={blocks} settings={settings as Record<string, string | null>} tariffs={tariffs} preview />
    </div>
  );
}
