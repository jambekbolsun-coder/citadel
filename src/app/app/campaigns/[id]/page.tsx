import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActive } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, Field, PageHeader, Stat } from "@/components/ui";
import { ActionForm, Submit } from "@/components/action-form";
import { activePeople, nameOf } from "@/lib/data";
import { date, minorToInput, money, todayLocal } from "@/lib/format";
import { addMetric, updateCampaign } from "../actions";

export default async function CampaignPage({ params }: PageProps<"/app/campaigns/[id]">) {
  const { id } = await params;
  await requireActive();
  const supabase = await createClient();
  const { data: c } = await supabase.from("campaigns").select("*, projects(id,name)").eq("id", id).maybeSingle();
  if (!c) notFound();
  const [{ data: metrics }, people] = await Promise.all([supabase.from("campaign_metrics").select("*").eq("campaign_id", id).order("day", { ascending: false }), activePeople()]);
  const ms = (metrics ?? []) as { id: string; day: string; spend_minor: number; leads: number; impressions: number | null; clicks: number | null; note: string | null; created_by: string }[];
  const spend = ms.reduce((a, m) => a + Number(m.spend_minor), 0);
  const leads = ms.reduce((a, m) => a + m.leads, 0);
  const lastCheck = ms[0]?.day;
  const checkDue = lastCheck ? new Date(new Date(lastCheck).getTime() + c.check_every_days * 86400_000) < new Date() : true;
  return (
    <>
      <PageHeader back="/app/campaigns" title={c.name} subtitle={<><Link className="hover:underline" href={`/app/projects/${c.projects.id}`}>{c.projects.name}</Link> · {c.platform} · кабинет {c.ad_account_id ?? "—"} · таргетолог {nameOf(people, c.owner_id)}</>} />
      <div className="mb-4 grid gap-3 md:grid-cols-4">
        <Stat label="Бюджет" value={money(c.budget_minor, c.currency)} />
        <Stat label="Расход" value={money(spend, c.currency)} tone={spend > c.budget_minor ? "bad" : undefined} />
        <Stat label="Обращения" value={leads} hint={c.target_leads ? `ориентир ${c.target_leads}` : undefined} />
        <Stat label="CPL" value={leads >= 5 ? money(Math.round(spend / leads), c.currency) : "—"} hint={leads < 5 ? "недостаточно данных" : undefined} />
      </div>
      {checkDue && c.status === "active" && <p className="mb-4 rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">Пора проверить кампанию: регламент — каждые {c.check_every_days} дн.</p>}
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <Card title="Показатели (ручной ввод)">
          <ActionForm action={addMetric} reset className="mb-4 grid gap-2 sm:grid-cols-6">
            <input type="hidden" name="id" value={id} />
            <input name="day" type="date" defaultValue={todayLocal()} className="input" />
            <input name="spend" placeholder="Расход" inputMode="decimal" className="input" />
            <input name="leads" type="number" placeholder="Обращения" className="input" />
            <input name="impressions" type="number" placeholder="Показы" className="input" />
            <input name="clicks" type="number" placeholder="Клики" className="input" />
            <Submit variant="secondary">Записать</Submit>
            <input name="note" placeholder="Оптимизация / комментарий" className="input sm:col-span-6" />
          </ActionForm>
          <div className="scroll-x"><table className="tbl">
            <thead><tr><th>День</th><th>Расход</th><th>Обращения</th><th>Показы</th><th>Клики</th><th>Комментарий</th></tr></thead>
            <tbody>{ms.map((m) => <tr key={m.id}><td>{date(m.day)}</td><td>{money(m.spend_minor, c.currency)}</td><td>{m.leads}</td><td>{m.impressions ?? "—"}</td><td>{m.clicks ?? "—"}</td><td className="text-sm">{m.note ?? ""}</td></tr>)}</tbody>
          </table></div>
        </Card>
        <Card title="Параметры">
          <p className="mb-3 text-sm">Цель: {c.goal ?? "—"}<br />Сроки: {date(c.starts_on)} — {date(c.ends_on)}<br />Пиксель: {c.pixel ?? "—"}</p>
          <ActionForm action={updateCampaign} className="space-y-2">
            <input type="hidden" name="id" value={id} />
            <Field label="Статус"><select name="status" defaultValue={c.status} className="input"><option value="draft">Черновик</option><option value="active">Активна</option><option value="paused">Пауза</option><option value="finished">Завершена</option></select></Field>
            <Field label="Утверждённый бюджет"><input name="budget" defaultValue={minorToInput(c.budget_minor)} className="input" /></Field>
            <Field label="История оптимизаций / отчёт клиенту"><textarea name="notes" defaultValue={c.notes ?? ""} className="input min-h-[120px]" /></Field>
            <Submit variant="secondary">Сохранить</Submit>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
