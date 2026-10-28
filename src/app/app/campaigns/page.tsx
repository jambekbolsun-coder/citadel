import Link from "next/link";
import { requireActive } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, Empty, Field, PageHeader } from "@/components/ui";
import { ActionForm, Submit } from "@/components/action-form";
import { PeopleSelect } from "@/components/people-select";
import { activePeople, nameOf } from "@/lib/data";
import { date, money } from "@/lib/format";
import { createCampaign } from "./actions";

export const metadata = { title: "Реклама" };

export default async function Campaigns() {
  const s = await requireActive(["campaigns.manage", "campaigns.view_all"]);
  const supabase = await createClient();
  const [{ data }, people, { data: projects }] = await Promise.all([
    supabase.from("campaigns").select("id,name,platform,status,budget_minor,currency,owner_id,starts_on,ends_on,target_leads,projects(name),campaign_metrics(spend_minor,leads)").order("created_at", { ascending: false }),
    activePeople(),
    supabase.from("projects").select("id,name").eq("status", "in_progress").order("name"),
  ]);
  const rows = (data ?? []) as unknown as { id: string; name: string; platform: string; status: string; budget_minor: number; currency: string; owner_id: string | null; starts_on: string | null; ends_on: string | null; target_leads: number | null; projects: { name: string } | null; campaign_metrics: { spend_minor: number; leads: number }[] }[];
  return (
    <>
      <PageHeader title="Таргетированная реклама" subtitle="Бюджет клиента — отдельный контур, не выручка агентства. Автоимпорт из рекламных кабинетов пока не подключён — данные вводятся вручную." />
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        {rows.length === 0 ? <Empty title="Кампаний нет" /> : (
          <Card className="p-0 md:p-0"><div className="scroll-x"><table className="tbl">
            <thead><tr><th>Кампания</th><th>Статус</th><th>Бюджет</th><th>Расход</th><th>Обращения</th><th>CPL</th><th>Таргетолог</th></tr></thead>
            <tbody>{rows.map((c) => {
              const spend = c.campaign_metrics.reduce((a, m) => a + Number(m.spend_minor), 0);
              const leads = c.campaign_metrics.reduce((a, m) => a + m.leads, 0);
              return (
                <tr key={c.id}>
                  <td><Link href={`/app/campaigns/${c.id}`} className="font-semibold hover:underline">{c.name}</Link><div className="text-xs text-muted">{c.projects?.name} · {c.platform} · {date(c.starts_on)}–{date(c.ends_on)}</div></td>
                  <td><Badge status={c.status === "active" ? "in_progress" : c.status}>{{ draft: "Черновик", active: "Активна", paused: "Пауза", finished: "Завершена" }[c.status]}</Badge></td>
                  <td>{money(c.budget_minor, c.currency)}</td><td>{money(spend, c.currency)}</td>
                  <td>{leads}{c.target_leads ? ` / ориентир ${c.target_leads}` : ""}</td>
                  <td>{leads >= 5 ? money(Math.round(spend / leads), c.currency) : <span className="text-xs text-muted">мало данных</span>}</td>
                  <td className="text-sm">{nameOf(people, c.owner_id)}</td>
                </tr>
              );
            })}</tbody>
          </table></div></Card>
        )}
        {s.can("campaigns.manage") && (
          <Card title="Новая кампания">
            <ActionForm action={createCampaign} className="space-y-3">
              <Field label="Проект *"><select name="project_id" required className="input"><option value="">—</option>{(projects ?? []).map((p: { id: string; name: string }) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
              <Field label="Название"><input name="name" className="input" /></Field>
              <Field label="Платформа"><select name="platform" className="input"><option value="meta">Meta (Instagram/Facebook)</option><option value="google">Google</option><option value="tiktok">TikTok</option><option value="other">Другое</option></select></Field>
              <Field label="Цель и целевой лид"><input name="goal" className="input" /></Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Бюджет"><input name="budget" inputMode="decimal" className="input" /></Field>
                <Field label="Валюта"><select name="currency" className="input"><option>USD</option><option>KGS</option></select></Field>
                <Field label="Начало"><input name="starts_on" type="date" className="input" /></Field>
                <Field label="Окончание"><input name="ends_on" type="date" className="input" /></Field>
                <Field label="Ориентир обращений"><input name="target_leads" type="number" className="input" /></Field>
                <Field label="Проверка, дн."><input name="check_every_days" type="number" defaultValue={2} className="input" /></Field>
              </div>
              <Field label="ID рекламного кабинета"><input name="ad_account_id" className="input" /></Field>
              <Field label="Пиксель / аналитика"><input name="pixel" className="input" /></Field>
              <Field label="Таргетолог"><PeopleSelect name="owner_id" people={people} defaultValue={s.userId} /></Field>
              <Submit className="w-full">Создать</Submit>
            </ActionForm>
            <p className="mt-2 text-xs text-muted">Ориентир по обращениям не является гарантией результата.</p>
          </Card>
        )}
      </div>
    </>
  );
}
