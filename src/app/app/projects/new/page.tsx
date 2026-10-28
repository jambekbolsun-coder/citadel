import { requireActive } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { activePeople } from "@/lib/data";
import { ProjectWizard } from "./wizard";

export const metadata = { title: "Новый проект" };

export default async function NewProject({ searchParams }: PageProps<"/app/projects/new">) {
  const sp = await searchParams;
  const s = await requireActive("projects.create");
  const supabase = await createClient();
  const [{ data: clients }, { data: tv }, people] = await Promise.all([
    supabase.from("clients").select("id,company_name").is("archived_at", null).order("company_name"),
    supabase.from("tariff_versions").select("id,price_minor,currency,period_type,period_months,composition,stories_method,notes,tariffs!inner(id,name,archived_at,sort)").eq("is_current", true),
    activePeople(),
  ]);
  const tariffs = ((tv ?? []) as unknown as { id: string; price_minor: number; currency: string; period_type: string; period_months: number; composition: Record<string, number>; stories_method: string | null; notes: string | null; tariffs: { id: string; name: string; archived_at: string | null; sort: number } }[])
    .filter((t) => !t.tariffs.archived_at)
    .sort((a, b) => a.tariffs.sort - b.tariffs.sort)
    .map((t) => ({ id: t.tariffs.id, name: t.tariffs.name, version_id: t.id, price_minor: t.price_minor, currency: t.currency, period_type: t.period_type, period_months: t.period_months, composition: t.composition, stories_method: t.stories_method, notes: t.notes }));
  return (
    <>
      <PageHeader back="/app/projects" title="Новый проект" subtitle="4 шага: клиент → условия → оплаты → организация" />
      <ProjectWizard
        clients={(clients ?? []) as { id: string; company_name: string }[]}
        tariffs={tariffs}
        people={people}
        defaults={{ client: typeof sp.client === "string" ? sp.client : undefined, lead: typeof sp.lead === "string" ? sp.lead : undefined, me: s.userId }}
      />
    </>
  );
}
