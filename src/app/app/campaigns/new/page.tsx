import { requireActive } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, Empty, Field, LoadError, Notice, PageHeader } from "@/components/ui";
import { ActionForm, Submit } from "@/components/action-form";
import { PeopleSelect } from "@/components/people-select";
import { activePeople, peopleByRole } from "@/lib/data";
import { todayLocal } from "@/lib/format";
import { createCampaign } from "../actions";
import { PLATFORM } from "../data";

export const metadata = { title: "Новая кампания" };

export default async function NewCampaign({ searchParams }: PageProps<"/app/campaigns/new">) {
  const sp = await searchParams;
  const s = await requireActive("campaigns.manage");
  const supabase = await createClient();
  const assign = s.can("campaigns.view_all") || s.can("projects.manage");
  // RLS: таргетолог видит только проекты, куда его назначили
  const [{ data: projects, error }, targetologists, people] = await Promise.all([
    supabase.from("projects").select("id,name,clients(company_name,niche)").not("status", "in", "(closed,cancelled)").order("name"),
    assign ? peopleByRole("targetologist") : Promise.resolve([]),
    assign ? activePeople() : Promise.resolve([]),
  ]);
  const list = (projects ?? []) as unknown as { id: string; name: string; clients: { company_name: string; niche: string | null } | null }[];
  const preset = typeof sp.project === "string" ? sp.project : "";
  const pickable = targetologists.length ? targetologists : people;
  return (
    <>
      <PageHeader back="/app/campaigns" title="Новая кампания" subtitle="Учёт ведётся вручную. Создание кампании здесь не создаёт и не запускает рекламу на площадке." />
      {error ? <LoadError retry="/app/campaigns/new" back="/app/campaigns" /> : list.length === 0 ? (
        <Empty title="Нет доступных проектов" text={assign ? "Сначала создайте проект клиента." : "Руководитель должен назначить вас в проект клиента — после этого здесь появится выбор."} />
      ) : (
        <Card className="mx-auto max-w-2xl">
          <ActionForm action={createCampaign} className="space-y-5">
            <fieldset className="space-y-3">
              <legend className="mb-1 text-sm font-semibold text-muted">Клиент и площадка</legend>
              <Field label="Проект клиента *">
                <select name="project_id" required defaultValue={preset} className="input">
                  <option value="">— выберите —</option>
                  {list.map((p) => <option key={p.id} value={p.id}>{p.clients?.company_name && p.clients.company_name !== p.name ? `${p.clients.company_name} · ${p.name}` : p.name}{p.clients?.niche ? ` (${p.clients.niche})` : ""}</option>)}
                </select>
              </Field>
              <Field label="Название кампании"><input name="name" className="input" placeholder="Например: Матрасы — осень" /></Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Площадка (метка)"><select name="platform" className="input">{Object.entries(PLATFORM).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
                <Field label="ID рекламного кабинета"><input name="ad_account_id" className="input" autoComplete="off" /></Field>
              </div>
              <Field label="Цель и целевое действие"><input name="goal" className="input" placeholder="Заявки в WhatsApp" /></Field>
            </fieldset>
            <fieldset className="space-y-3">
              <legend className="mb-1 text-sm font-semibold text-muted">Бюджет — план, не расход</legend>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Валюта"><select name="currency" className="input"><option value="USD">USD ($)</option><option value="KGS">KGS (сом)</option></select></Field>
                <Field label="Бюджет в день" hint="если видео ещё не добавлены"><input name="daily_budget" inputMode="decimal" className="input" /></Field>
                <Field label="Утверждённый лимит всего"><input name="budget" inputMode="decimal" className="input" /></Field>
                <Field label="Ориентир обращений"><input name="target_leads" type="number" min={0} inputMode="numeric" className="input" /></Field>
              </div>
            </fieldset>
            <fieldset className="space-y-3">
              <legend className="mb-1 text-sm font-semibold text-muted">Сроки и ответственный</legend>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Начало (план)"><input name="starts_on" type="date" defaultValue={todayLocal()} className="input" /></Field>
                <Field label="Окончание (план)"><input name="ends_on" type="date" className="input" /></Field>
                <Field label="Проверка, каждые N дней"><input name="check_every_days" type="number" min={1} defaultValue={2} inputMode="numeric" className="input" /></Field>
              </div>
              {assign ? <Field label="Таргетолог" hint="Получит проект в «Моих проектах» и доступ к карточке клиента"><PeopleSelect name="owner_id" people={pickable} defaultValue={s.userId} /></Field> : <input type="hidden" name="owner_id" value={s.userId} />}
              <label className="flex items-center gap-3 text-sm"><input type="checkbox" name="start_now" value="1" defaultChecked className="h-5 w-5" /> Реклама уже запущена в кабинете — отметить «Работает» с сегодняшнего дня</label>
            </fieldset>
            <div className="sticky-actions"><Submit className="w-full">Создать кампанию</Submit></div>
          </ActionForm>
          <div className="mt-4"><Notice>Ориентир по обращениям не является гарантией результата. Интеграций с рекламными API нет.</Notice></div>
        </Card>
      )}
    </>
  );
}
