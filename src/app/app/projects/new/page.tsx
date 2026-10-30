import { requireActive } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { activePeople } from "@/lib/data";
import type { Tariff } from "@/lib/project-wizard";
import { ProjectWizard } from "./wizard";

export const metadata = { title: "Новый проект" };

const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
// роли, из которых предлагаем исполнителей (если людей с ролью нет — показываем всех активных)
const ROLE_POOLS: Record<string, string[]> = {
  admin: ["project_admin", "project_manager", "manager", "owner"],
  creative_director: ["creative_director"],
  targetologist: ["targetologist"],
  mobilographer: ["mobilographer"],
  designer: ["designer"],
  editor: ["editor"],
  ambassador: ["ambassador"],
};

export default async function NewProject({ searchParams }: PageProps<"/app/projects/new">) {
  const sp = await searchParams;
  const s = await requireActive("projects.create");
  const supabase = await createClient();
  const [{ data: tv }, people, { data: roles }, existing, lead] = await Promise.all([
    supabase.from("tariff_versions").select("id,price_minor,currency,period_type,period_months,composition,stories_method,notes,tariffs!inner(id,code,name,archived_at,sort)").eq("is_current", true),
    activePeople(),
    supabase.from("user_roles").select("user_id,role_code"),
    isUuid(sp.client) ? supabase.from("clients").select("id,company_name,contact_name,phone,niche").eq("id", sp.client).maybeSingle().then((r) => r.data) : Promise.resolve(null),
    isUuid(sp.lead) ? supabase.from("leads").select("id,name,phone,business,tariff_id").eq("id", sp.lead).maybeSingle().then((r) => r.data) : Promise.resolve(null),
  ]);
  const tariffs: Tariff[] = ((tv ?? []) as unknown as { id: string; price_minor: number; currency: string; period_type: string; period_months: number; composition: Record<string, number>; stories_method: string | null; notes: string | null; tariffs: { id: string; code: string; name: string; archived_at: string | null; sort: number } }[])
    .filter((t) => !t.tariffs.archived_at)
    .sort((a, b) => a.tariffs.sort - b.tariffs.sort)
    .map((t) => ({ id: t.tariffs.id, code: t.tariffs.code, name: t.tariffs.name, version_id: t.id, price_minor: t.price_minor, currency: t.currency, period_type: t.period_type, period_months: t.period_months, composition: t.composition, stories_method: t.stories_method, notes: t.notes }));
  const roleOf = new Map<string, Set<string>>();
  for (const r of (roles ?? []) as { user_id: string; role_code: string }[]) {
    if (!roleOf.has(r.user_id)) roleOf.set(r.user_id, new Set());
    roleOf.get(r.user_id)!.add(r.role_code);
  }
  const byRole = Object.fromEntries(Object.entries(ROLE_POOLS).map(([k, codes]) => [k, people.filter((p) => codes.some((c) => roleOf.get(p.id)?.has(c)))]));
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bishkek" }).format(new Date());

  return (
    <>
      <PageHeader back="/app/projects" title="Новый проект" subtitle="Клиент → проект и тариф → команда и оплата. Клиент сам появится в базе клиентов." />
      <ProjectWizard
        tariffs={tariffs}
        people={people.map((p) => ({ id: p.id, full_name: p.full_name, job_title: p.job_title }))}
        byRole={byRole}
        me={s.userId}
        today={today}
        canPrices={s.can("prices.view") || s.can("finance.view")}
        canPayments={s.can("payments.create")}
        canManageClients={s.can("clients.manage")}
        preset={{ existing: existing ?? null, lead: lead ?? null }}
      />
    </>
  );
}
