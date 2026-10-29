import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, MessageCircle, Phone } from "lucide-react";
import { requireActive } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, Empty, Field, LoadError, Notice, PageHeader, Stat, Tabs, btn, cn } from "@/components/ui";
import { ActionForm, Submit } from "@/components/action-form";
import { PeopleSelect } from "@/components/people-select";
import { ProjectAccess } from "@/components/project-access";
import { activePeople, nameOf, type Person } from "@/lib/data";
import { date, dateTime, minorToInput, money, moneyMulti, todayLocal } from "@/lib/format";
import { activeDailyBudget, activeDays, cpl, nextCheck, planForPeriod, spendTotals, type BudgetEvent, type SpendEntry, type StatusEvent } from "@/lib/ads-math";
import { CONTENT_KIND } from "@/lib/labels";
import { CAMPAIGN_STATUS, CREATIVE_KIND, CREATIVE_STATUS, PLATFORM, periodOf, socialLinks, statusTone, telLink, waLink, type ClientInfo, type Period } from "../data";
import { PeriodChips } from "../period-chips";
import { SpendForm } from "../spend-form";
import * as A from "../actions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SOURCE: Record<string, string> = { manual: "вручную", legacy: "перенесено из старых показателей", allocation: "распределение", correction: "исправление" };
const FIELD: Record<string, string> = {
  name: "Название", platform: "Площадка", goal: "Цель", ad_account_id: "ID кабинета", budget_minor: "Утверждённый лимит", currency: "Валюта", owner_id: "Таргетолог",
  starts_on: "Начало (план)", ends_on: "Окончание (план)", target_leads: "Ориентир обращений", check_every_days: "Регламент проверки", notes: "Заметки",
  title: "Название видео", kind: "Тип", content_item_id: "Материал", url: "Ссылка", limit_minor: "Лимит видео", assignee_id: "Исполнитель", note: "Заметка",
};

type Campaign = {
  id: string; name: string; platform: string; goal: string | null; target_leads: number | null; ad_account_id: string | null; pixel: string | null; starts_on: string | null; ends_on: string | null;
  budget_minor: number; daily_budget_minor: number | null; currency: string; owner_id: string | null; status: string; check_every_days: number; notes: string | null; created_at: string;
  started_on: string | null; stopped_on: string | null; history_from: string | null; status_changed_at: string | null; status_changed_by: string | null; project_id: string;
  projects: { id: string; name: string; socials: Record<string, string> | null; manager_id: string | null; admin_id: string | null; clients: ClientInfo | null } | null;
};
type Creative = {
  id: string; seq: number; title: string; kind: string; content_item_id: string | null; url: string | null; status: string; daily_budget_minor: number; currency: string; limit_minor: number | null;
  assignee_id: string | null; note: string | null; pause_reason: string | null; started_on: string | null; status_changed_at: string | null; status_changed_by: string | null; content_items: { id: string; title: string; kind: string } | null;
};
type Entry = SpendEntry & { id: string; note: string | null; source: string; created_by: string | null; created_at: string; superseded_by: string | null; supersede_reason: string | null; replaces_id: string | null };

export default async function CampaignPage({ params, searchParams }: PageProps<"/app/campaigns/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const s = await requireActive(["campaigns.manage", "campaigns.view_all"]);
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const { data: c, error } = await supabase.from("campaigns")
    .select("*, projects(id,name,socials,manager_id,admin_id,clients(id,company_name,contact_name,phone,email,niche,address,socials,notes,manager_id))")
    .eq("id", id).maybeSingle();
  if (error) return <><PageHeader back="/app/campaigns" title="Кампания" /><LoadError retry={`/app/campaigns/${id}`} back="/app/campaigns" backLabel="К проектам" /></>;
  if (!c) {
    if (!s.can("campaigns.view_all")) return <><PageHeader back="/app/campaigns" title="Кампания" /><LoadError kind="denied" text="Кампания не назначена вам. Таргетолог видит только кампании своих проектов." back="/app/campaigns" backLabel="К моим проектам" /></>;
    notFound();
  }
  const camp = c as unknown as Campaign;
  const tab = typeof sp.tab === "string" ? sp.tab : "overview";
  const period = periodOf(sp);
  const [cr, en, sh, bh, cl, people, canEditRes] = await Promise.all([
    supabase.from("campaign_creatives").select("*, content_items(id,title,kind)").eq("campaign_id", id).order("seq"),
    supabase.from("campaign_spend_entries").select("id,creative_id,day,currency,spend_minor,leads,impressions,clicks,note,source,created_by,created_at,superseded_at,superseded_by,supersede_reason,replaces_id").eq("campaign_id", id).order("day", { ascending: false }).order("created_at", { ascending: false }).limit(3000),
    supabase.from("ad_status_history").select("creative_id,from_status,to_status,effective_on,reason,actor_id,created_at").eq("campaign_id", id).order("created_at"),
    supabase.from("ad_budget_history").select("creative_id,daily_budget_minor,currency,effective_from,reason,actor_id,created_at").eq("campaign_id", id).order("created_at"),
    supabase.from("ad_change_log").select("creative_id,field,old_value,new_value,actor_id,created_at").eq("campaign_id", id).order("created_at", { ascending: false }).limit(200),
    activePeople(),
    supabase.rpc("campaign_can_edit", { p_campaign: id }),
  ]);
  if (cr.error || en.error || sh.error || bh.error) return <><PageHeader back="/app/campaigns" title={camp.name} /><LoadError retry={`/app/campaigns/${id}?tab=${tab}`} back="/app/campaigns" /></>;
  const creatives = (cr.data ?? []) as unknown as Creative[];
  const entries = (en.data ?? []) as unknown as Entry[];
  const status = (sh.data ?? []) as (StatusEvent & { from_status: string | null; reason: string | null; actor_id: string | null; created_at: string })[];
  const budget = (bh.data ?? []) as (BudgetEvent & { reason: string | null; actor_id: string | null; created_at: string })[];
  const changes = (cl.data ?? []) as { creative_id: string | null; field: string; old_value: string | null; new_value: string | null; actor_id: string | null; created_at: string }[];
  const canEdit = canEditRes.data === true;
  const today = todayLocal();
  const client = camp.projects?.clients ?? null;
  const base = `/app/campaigns/${id}`;
  const showAccess = s.can("credentials.reveal") || s.can("credentials.manage");
  const tabs = [
    { key: "overview", label: "Обзор" },
    { key: "videos", label: `Видео · ${creatives.length}` },
    { key: "spend", label: "Расходы" },
    { key: "client", label: "Клиент" },
    ...(showAccess ? [{ key: "access", label: "Доступы" }] : []),
    { key: "history", label: "История" },
  ].map((t) => ({ ...t, href: `${base}?tab=${t.key}${t.key === "spend" || t.key === "overview" ? `&period=${period.key}${period.key === "custom" ? `&from=${period.from}&to=${period.to}` : ""}` : ""}` }));

  const periodTotals = spendTotals(entries, period.from, period.to);
  const allTotals = spendTotals(entries);
  const daily = activeDailyBudget(creatives, camp);

  return (
    <>
      <PageHeader back="/app/campaigns" title={camp.name}
        subtitle={<>{camp.projects ? <Link className="hover:underline" href={`/app/projects/${camp.projects.id}`}>{client?.company_name ?? camp.projects.name}</Link> : "—"} · {PLATFORM[camp.platform] ?? camp.platform} · таргетолог {nameOf(people, camp.owner_id)}</>}
        actions={<Badge tone={statusTone(camp.status)}>{CAMPAIGN_STATUS[camp.status]}</Badge>} />
      {sp.created ? <div className="mb-4"><Notice tone="good">Кампания создана. Добавьте рекламные видео с дневными бюджетами во вкладке «Видео».</Notice></div> : null}
      <Tabs active={tab} items={tabs} />
      {tab === "overview" && <Overview camp={camp} creatives={creatives} entries={entries} status={status} budget={budget} people={people} canEdit={canEdit} period={period} today={today} daily={daily} periodTotals={periodTotals} allTotals={allTotals} />}
      {tab === "videos" && <Videos camp={camp} creatives={creatives} entries={entries} people={people} canEdit={canEdit} period={period} />}
      {tab === "spend" && <Spend camp={camp} creatives={creatives} entries={entries} people={people} canEdit={canEdit} period={period} base={base} />}
      {tab === "client" && <ClientTab camp={camp} client={client} people={people} />}
      {tab === "access" && showAccess && camp.projects && <ProjectAccess projectId={camp.projects.id} canManage={s.can("credentials.manage")} />}
      {tab === "history" && <History status={status} budget={budget} changes={changes} entries={entries} creatives={creatives} people={people} />}
    </>
  );
}

function ManualMark({ at, by, people }: { at: string | null; by: string | null; people: Person[] }) {
  return <p className="mt-1 text-xs text-muted">Состояние отмечено вручную{at ? ` · ${dateTime(at)}` : ""}{by ? ` · ${nameOf(people, by)}` : ""}. На рекламной площадке не меняется автоматически.</p>;
}

function Overview({ camp, creatives, entries, status, budget, people, canEdit, period, today, daily, periodTotals, allTotals }: {
  camp: Campaign; creatives: Creative[]; entries: Entry[]; status: StatusEvent[]; budget: BudgetEvent[]; people: Person[]; canEdit: boolean; period: Period; today: string;
  daily: Record<string, number>; periodTotals: ReturnType<typeof spendTotals>; allTotals: ReturnType<typeof spendTotals>;
}) {
  const plan = planForPeriod({ from: period.from, to: period.to, historyFrom: camp.history_from, creativeIds: creatives.map((k) => k.id), status, budget });
  const days = activeDays({ from: period.from < (camp.started_on ?? period.from) ? camp.started_on ?? period.from : period.from, to: period.to, historyFrom: camp.history_from, status });
  const nc = camp.status === "active" ? nextCheck(allTotals.lastDay, camp.started_on ?? camp.created_at.slice(0, 10), camp.check_every_days) : null;
  const overdue = !!nc && nc <= today;
  const unallocated: Record<string, number> = {};
  for (const e of entries) if (!e.superseded_at && !e.creative_id) unallocated[`${e.day}|${e.currency}`] = (unallocated[`${e.day}|${e.currency}`] ?? 0) + Number(e.spend_minor);
  const cplParts = Object.entries(periodTotals.spend).map(([cur, v]) => ({ cur, v: cpl(v, periodTotals.leads[cur] ?? 0) }));
  const limitLeft = camp.budget_minor ? camp.budget_minor - (allTotals.spend[camp.currency] ?? 0) : null;
  return (
    <div className="space-y-4">
      <PeriodChips base={`/app/campaigns/${camp.id}`} params={{ tab: "overview" }} period={period} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="План в день (сейчас)" value={<span className="text-xl">{moneyMulti(daily, "не задан")}</span>} hint="сумма включённых видео — это лимит, не расход" />
        <Stat label={`Потрачено · ${period.label}`} value={<span className="text-xl">{moneyMulti(periodTotals.spend, "0")}</span>} hint={periodTotals.days ? `записей за ${periodTotals.days} дн.` : "записей нет — факт не подменяется планом"} />
        <Stat label="Обращения" value={periodTotals.leadsTotal} hint={camp.target_leads ? `ориентир ${camp.target_leads} (не гарантия)` : undefined} />
        <Stat label="CPL" value={<span className="text-xl">{cplParts.length && cplParts.some((x) => x.v !== null) ? cplParts.filter((x) => x.v !== null).map((x) => money(x.v, x.cur)).join(" · ") : "Нет заявок"}</span>} hint="расход ÷ обращения за период" />
        <Stat label={`План · ${period.label}`} value={<span className="text-xl">{moneyMulti(plan.plan, "0")}</span>} hint={plan.unknownDays ? `без ${plan.unknownDays} дн. до начала учёта статусов` : "по дневным бюджетам и паузам"} />
        <Stat label="Дней работы" value={days.active === null ? "—" : `${days.active} из ${days.calendar}`} hint={days.active === null ? "история пауз до начала учёта неизвестна" : "активные из календарных"} />
        <Stat label="Лимит кампании" value={<span className="text-xl">{camp.budget_minor ? money(camp.budget_minor, camp.currency) : "не задан"}</span>} hint={limitLeft !== null ? (limitLeft < 0 ? `превышен на ${money(-limitLeft, camp.currency)}` : `осталось ${money(limitLeft, camp.currency)}`) : undefined} tone={limitLeft !== null && limitLeft < 0 ? "bad" : undefined} />
        <Stat label="Не распределено по видео" value={<span className="text-xl">{moneyMulti(periodTotals.unallocated, "0")}</span>} hint="общий расход без разбивки" />
      </div>

      <Card title="Что сегодня проверить">
        <ul className="space-y-2 text-sm">
          <li className={overdue ? "font-semibold text-warn" : ""}>{camp.status !== "active" ? `Кампания «${CAMPAIGN_STATUS[camp.status]}» — плановых проверок нет.` : nc ? (overdue ? `Пора проверить: плановая дата ${date(nc)} (регламент — каждые ${camp.check_every_days} дн.)` : `Следующая проверка: ${date(nc)}`) : "—"}</li>
          <li>Последняя запись результата: {allTotals.lastDay ? date(allTotals.lastDay) : "ещё не было"}</li>
          <li>Видео: включено {creatives.filter((k) => k.status === "active").length}, на паузе {creatives.filter((k) => k.status === "paused").length}, выключено {creatives.filter((k) => k.status === "off").length}</li>
          {camp.ends_on && <li>Плановое окончание: {date(camp.ends_on)}</li>}
        </ul>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {canEdit && (
          <Card title="Записать результат">
            <SpendForm campaignId={camp.id} campaignCurrency={camp.currency} today={today} unallocated={unallocated}
              creatives={creatives.filter((k) => k.status !== "off" || entries.some((e) => e.creative_id === k.id)).map((k) => ({ id: k.id, seq: k.seq, title: k.title, currency: k.currency, status: k.status }))} />
          </Card>
        )}
        <Card title="Статус кампании">
          <div className="flex items-center gap-2"><Badge tone={statusTone(camp.status)}>{CAMPAIGN_STATUS[camp.status]}</Badge>{camp.started_on && <span className="text-sm text-muted">запущена {date(camp.started_on)}{camp.stopped_on ? ` · завершена ${date(camp.stopped_on)}` : ""}</span>}</div>
          <ManualMark at={camp.status_changed_at} by={camp.status_changed_by} people={people} />
          {canEdit && (
            <ActionForm action={A.setCampaignStatus} className="mt-3 space-y-2">
              <input type="hidden" name="id" value={camp.id} />
              <div className="grid grid-cols-2 gap-2">
                <Field label="Новый статус"><select name="status" defaultValue={camp.status} className="input">{Object.entries(CAMPAIGN_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
                <Field label="С даты"><input name="effective_on" type="date" max={today} defaultValue={today} className="input" /></Field>
              </div>
              <Field label="Причина (обязательна для паузы и завершения)"><input name="reason" className="input" /></Field>
              <Submit variant="secondary" className="w-full">Отметить статус</Submit>
            </ActionForm>
          )}
        </Card>
      </div>

      <details className="rounded-[20px] border border-line bg-surface p-4">
        <summary className="cursor-pointer font-semibold">Параметры кампании</summary>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-muted">Цель</dt><dd>{camp.goal ?? "—"}</dd></div>
          <div><dt className="text-xs text-muted">ID кабинета</dt><dd className="break-all">{camp.ad_account_id ?? "—"}</dd></div>
          <div><dt className="text-xs text-muted">Период (план)</dt><dd>{date(camp.starts_on)} — {date(camp.ends_on)}</dd></div>
          <div><dt className="text-xs text-muted">Валюта учёта</dt><dd>{camp.currency}</dd></div>
        </dl>
        {canEdit && (
          <ActionForm action={A.updateCampaign} className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
            <input type="hidden" name="id" value={camp.id} />
            <Field label="Название"><input name="name" defaultValue={camp.name} className="input" /></Field>
            <Field label="Цель"><input name="goal" defaultValue={camp.goal ?? ""} className="input" /></Field>
            <Field label="ID рекламного кабинета"><input name="ad_account_id" defaultValue={camp.ad_account_id ?? ""} className="input" /></Field>
            <Field label="Пиксель / аналитика"><input name="pixel" defaultValue={camp.pixel ?? ""} className="input" /></Field>
            <Field label={`Утверждённый лимит, ${camp.currency}`}><input name="budget" inputMode="decimal" defaultValue={minorToInput(camp.budget_minor)} className="input" /></Field>
            <Field label="Ориентир обращений"><input name="target_leads" type="number" min={0} defaultValue={camp.target_leads ?? ""} className="input" /></Field>
            <Field label="Начало (план)"><input name="starts_on" type="date" defaultValue={camp.starts_on ?? ""} className="input" /></Field>
            <Field label="Окончание (план)"><input name="ends_on" type="date" defaultValue={camp.ends_on ?? ""} className="input" /></Field>
            <Field label="Проверка, каждые N дней"><input name="check_every_days" type="number" min={1} defaultValue={camp.check_every_days} className="input" /></Field>
            <Field label="Заметки / история оптимизаций" className="sm:col-span-2"><textarea name="notes" defaultValue={camp.notes ?? ""} className="input min-h-[96px]" /></Field>
            <div className="sm:col-span-2"><Submit variant="secondary">Сохранить параметры</Submit></div>
          </ActionForm>
        )}
        {!creatives.length && canEdit && (
          <ActionForm action={A.setDailyBudget} className="mt-4 grid grid-cols-2 gap-2 border-t border-line pt-4">
            <input type="hidden" name="id" value={camp.id} />
            <Field label={`Дневной бюджет кампании, ${camp.currency}`}><input name="amount" inputMode="decimal" defaultValue={minorToInput(camp.daily_budget_minor)} className="input" /></Field>
            <Field label="Действует с"><input name="effective_from" type="date" max={today} defaultValue={today} className="input" /></Field>
            <Field label="Причина изменения" className="col-span-2"><input name="reason" className="input" /></Field>
            <div className="col-span-2"><Submit variant="secondary">Изменить дневной бюджет</Submit></div>
          </ActionForm>
        )}
      </details>
    </div>
  );
}

function Videos({ camp, creatives, entries, people, canEdit, period }: { camp: Campaign; creatives: Creative[]; entries: Entry[]; people: Person[]; canEdit: boolean; period: Period }) {
  const all = spendTotals(entries);
  const inPeriod = spendTotals(entries, period.from, period.to);
  const today = todayLocal();
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label="Активный план в день" value={<span className="text-xl">{moneyMulti(activeDailyBudget(creatives, camp), "0")}</span>} hint="включённые видео, без пауз" />
        <Stat label="Видео" value={`${creatives.filter((k) => k.status === "active").length} из ${creatives.length}`} hint="включено из всех" />
        <Stat label="Не распределено" value={<span className="text-xl">{moneyMulti(all.unallocated, "0")}</span>} hint="общий расход без видео, за всё время" />
      </div>
      {creatives.length === 0 ? <Empty title="Видео ещё не добавлены" text="Добавьте 1, 2, 10 и более рекламных роликов — у каждого свой дневной бюджет, статус и результаты." /> : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {creatives.map((k) => {
            const t = all.byCreative[k.id];
            const p = inPeriod.byCreative[k.id];
            const own = t?.spend[k.currency] ?? 0;
            const ownCpl = cpl(own, t?.leads ?? 0);
            return (
              <li key={k.id} className="rounded-[20px] border border-line bg-surface p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words font-semibold">#{k.seq} {k.title}</p>
                    <p className="text-[13px] text-muted">{CREATIVE_KIND[k.kind] ?? k.kind}{k.content_items ? ` · ${CONTENT_KIND[k.content_items.kind] ?? ""} «${k.content_items.title}»` : ""}</p>
                  </div>
                  <Badge tone={statusTone(k.status)}>{CREATIVE_STATUS[k.status]}</Badge>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                  <div><dt className="text-xs text-muted">Бюджет в день</dt><dd className="font-semibold">{money(k.daily_budget_minor, k.currency)}</dd></div>
                  <div><dt className="text-xs text-muted">Лимит видео</dt><dd>{k.limit_minor ? money(k.limit_minor, k.currency) : "—"}</dd></div>
                  <div><dt className="text-xs text-muted">Потрачено · {period.label}</dt><dd className="font-semibold">{moneyMulti(p?.spend, "0")}</dd></div>
                  <div><dt className="text-xs text-muted">Всего потрачено</dt><dd>{moneyMulti(t?.spend, "0")}</dd></div>
                  <div><dt className="text-xs text-muted">Обращения</dt><dd>{t?.leads ?? 0}</dd></div>
                  <div><dt className="text-xs text-muted">CPL</dt><dd>{ownCpl === null ? "Нет заявок" : money(ownCpl, k.currency)}</dd></div>
                  <div><dt className="text-xs text-muted">Показы / клики</dt><dd>{t ? `${t.impressions || "—"} / ${t.clicks || "—"}` : "—"}</dd></div>
                  <div><dt className="text-xs text-muted">Исполнитель</dt><dd className="truncate">{nameOf(people, k.assignee_id)}</dd></div>
                </dl>
                {k.pause_reason && <p className="mt-2 text-sm text-warn">Причина: {k.pause_reason}</p>}
                {k.note && <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{k.note}</p>}
                <div className="mt-2 flex flex-wrap gap-3 text-sm">
                  {k.url && <a href={k.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 font-semibold text-primary">Открыть ролик<ExternalLink size={14} /></a>}
                  {k.content_item_id && <Link href={`/app/content/${k.content_item_id}`} className="inline-flex min-h-11 items-center font-semibold text-primary">Материал в контенте</Link>}
                </div>
                <ManualMark at={k.status_changed_at} by={k.status_changed_by} people={people} />
                {canEdit && (
                  <div className="mt-3 space-y-2">
                    <details className="rounded-xl bg-surface-2 px-3 py-2">
                      <summary className="cursor-pointer py-1 text-sm font-semibold">Включить / пауза / выключить</summary>
                      <ActionForm action={A.setCreativeStatus} className="mt-2 space-y-2">
                        <input type="hidden" name="id" value={camp.id} /><input type="hidden" name="creative_id" value={k.id} />
                        <div className="grid grid-cols-2 gap-2">
                          <select name="status" defaultValue={k.status} aria-label="Статус видео" className="input">{Object.entries(CREATIVE_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                          <input name="effective_on" type="date" max={today} defaultValue={today} aria-label="С даты" className="input" />
                        </div>
                        <input name="reason" placeholder="Причина паузы/отключения" className="input" />
                        <Submit variant="secondary" className="w-full">Отметить</Submit>
                      </ActionForm>
                    </details>
                    <details className="rounded-xl bg-surface-2 px-3 py-2">
                      <summary className="cursor-pointer py-1 text-sm font-semibold">Изменить дневной бюджет</summary>
                      <ActionForm action={A.setDailyBudget} className="mt-2 space-y-2">
                        <input type="hidden" name="id" value={camp.id} /><input type="hidden" name="creative_id" value={k.id} />
                        <div className="grid grid-cols-2 gap-2">
                          <input name="amount" inputMode="decimal" defaultValue={minorToInput(k.daily_budget_minor)} aria-label={`Бюджет в день, ${k.currency}`} className="input" />
                          <input name="effective_from" type="date" max={today} defaultValue={today} aria-label="Действует с" className="input" />
                        </div>
                        <input name="reason" placeholder="Причина изменения" className="input" />
                        <Submit variant="secondary" className="w-full">Сохранить с этой даты</Submit>
                      </ActionForm>
                    </details>
                    <details className="rounded-xl bg-surface-2 px-3 py-2">
                      <summary className="cursor-pointer py-1 text-sm font-semibold">Данные видео</summary>
                      <ActionForm action={A.updateCreative} className="mt-2 space-y-2">
                        <input type="hidden" name="id" value={camp.id} /><input type="hidden" name="creative_id" value={k.id} />
                        <input name="title" defaultValue={k.title} aria-label="Название" className="input" />
                        <select name="kind" defaultValue={k.kind} aria-label="Тип" className="input">{Object.entries(CREATIVE_KIND).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                        <input name="url" type="url" defaultValue={k.url ?? ""} placeholder="https://…" aria-label="Ссылка на ролик" className="input" />
                        <input type="hidden" name="content_item_id" value={k.content_item_id ?? ""} />
                        <input name="limit" inputMode="decimal" defaultValue={minorToInput(k.limit_minor)} placeholder={`Лимит видео, ${k.currency}`} aria-label="Лимит видео" className="input" />
                        <PeopleSelect name="assignee_id" people={people} defaultValue={k.assignee_id} empty="Исполнитель не назначен" />
                        <textarea name="note" defaultValue={k.note ?? ""} placeholder="Заметка" aria-label="Заметка" className="input" />
                        <Submit variant="secondary" className="w-full">Сохранить</Submit>
                      </ActionForm>
                    </details>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {canEdit && <AddCreative camp={camp} people={people} />}
    </div>
  );
}

async function AddCreative({ camp, people }: { camp: Campaign; people: Person[] }) {
  const supabase = await createClient();
  const { data } = await supabase.from("content_items").select("id,title,kind,status").eq("project_id", camp.project_id).in("kind", ["video", "ad_creative", "story", "post", "carousel"]).neq("status", "cancelled").order("created_at", { ascending: false }).limit(100);
  const items = (data ?? []) as { id: string; title: string; kind: string; status: string }[];
  return (
    <Card title="Добавить рекламное видео">
      <ActionForm action={A.addCreative} reset className="grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="id" value={camp.id} />
        <Field label="Название *"><input name="title" required className="input" placeholder="Видео 1 — отзыв" /></Field>
        <Field label="Тип"><select name="kind" className="input">{Object.entries(CREATIVE_KIND).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <Field label="Материал из контент-модуля" hint="без дублирования видео"><select name="content_item_id" className="input"><option value="">— не связан —</option>{items.map((i) => <option key={i.id} value={i.id}>{CONTENT_KIND[i.kind] ?? i.kind}: {i.title}</option>)}</select></Field>
        <Field label="Или ссылка на ролик"><input name="url" type="url" placeholder="https://…" className="input" /></Field>
        <Field label="Бюджет в день"><input name="daily_budget" inputMode="decimal" placeholder="5" className="input" /></Field>
        <Field label="Валюта"><select name="currency" defaultValue={camp.currency} className="input"><option value="USD">USD ($)</option><option value="KGS">KGS (сом)</option></select></Field>
        <Field label="Состояние"><select name="status" className="input"><option value="active">Включён</option><option value="paused">Пауза</option></select></Field>
        <Field label="Лимит видео (необязательно)"><input name="limit" inputMode="decimal" className="input" /></Field>
        <Field label="Исполнитель"><PeopleSelect name="assignee_id" people={people} empty="—" /></Field>
        <Field label="Заметка"><input name="note" className="input" /></Field>
        <div className="sm:col-span-2"><Submit className="w-full">Добавить видео</Submit></div>
      </ActionForm>
      <p className="mt-2 text-xs text-muted">Включённое здесь видео — отметка в учёте Цитадели. Запустить или остановить рекламу нужно в кабинете площадки.</p>
    </Card>
  );
}

function Spend({ camp, creatives, entries, people, canEdit, period, base }: { camp: Campaign; creatives: Creative[]; entries: Entry[]; people: Person[]; canEdit: boolean; period: Period; base: string }) {
  const t = spendTotals(entries, period.from, period.to);
  const rows = entries.filter((e) => !e.superseded_at && e.day >= period.from && e.day <= period.to);
  const label = (id: string | null) => (id ? (() => { const k = creatives.find((x) => x.id === id); return k ? `#${k.seq} ${k.title}` : "Видео"; })() : "Вся кампания");
  return (
    <div className="space-y-4">
      <PeriodChips base={base} params={{ tab: "spend" }} period={period} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Потрачено" value={<span className="text-xl">{moneyMulti(t.spend, "0")}</span>} />
        <Stat label="Обращения" value={t.leadsTotal} />
        <Stat label="Показы / клики" value={<span className="text-xl">{t.impressions || "—"} / {t.clicks || "—"}</span>} />
        <Stat label="Не распределено" value={<span className="text-xl">{moneyMulti(t.unallocated, "0")}</span>} hint="без разбивки по видео" />
      </div>
      {Object.keys(t.byCreative).length > 0 && (
        <Card title="По видео">
          <ul className="divide-y divide-line text-sm">
            {creatives.filter((k) => t.byCreative[k.id]).map((k) => <li key={k.id} className="flex items-center justify-between gap-3 py-2"><span className="min-w-0 truncate">#{k.seq} {k.title}</span><b className="shrink-0">{moneyMulti(t.byCreative[k.id].spend)}</b></li>)}
            {Object.keys(t.unallocated).length > 0 && <li className="flex items-center justify-between gap-3 py-2 text-muted"><span>Не распределено по видео</span><b className="shrink-0">{moneyMulti(t.unallocated)}</b></li>}
          </ul>
        </Card>
      )}
      {rows.length === 0 ? <Empty title="Записей за период нет" text="Факт появляется только после записи результата. Плановый бюджет фактом не считается." /> : (
        <ul className="space-y-2">
          {rows.map((e) => (
            <li key={e.id} className="rounded-2xl border border-line bg-surface p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">{date(e.day)} · <span className="font-normal">{label(e.creative_id)}</span></p>
                  <p className="text-[13px] text-muted">обращений {e.leads}{e.impressions ? ` · показов ${e.impressions}` : ""}{e.clicks ? ` · кликов ${e.clicks}` : ""} · {SOURCE[e.source] ?? e.source}</p>
                  {e.note && <p className="mt-1 break-words text-sm">{e.note}</p>}
                  <p className="mt-1 text-xs text-muted">внёс {nameOf(people, e.created_by)} · {dateTime(e.created_at)}</p>
                </div>
                <b className="shrink-0 whitespace-nowrap">{money(e.spend_minor, e.currency)}</b>
              </div>
              {canEdit && (
                <details className="mt-2 rounded-xl bg-surface-2 px-3 py-2">
                  <summary className="cursor-pointer py-1 text-sm font-semibold">Исправить запись</summary>
                  <ActionForm action={A.correctSpend} className="mt-2 space-y-2">
                    <input type="hidden" name="id" value={camp.id} /><input type="hidden" name="entry_id" value={e.id} />
                    <div className="grid grid-cols-2 gap-2">
                      <input name="spend" inputMode="decimal" defaultValue={minorToInput(e.spend_minor)} aria-label={`Расход, ${e.currency}`} className="input" />
                      <input name="leads" type="number" min={0} defaultValue={e.leads} aria-label="Обращения" className="input" />
                      <input name="impressions" type="number" min={0} defaultValue={e.impressions ?? ""} aria-label="Показы" placeholder="Показы" className="input" />
                      <input name="clicks" type="number" min={0} defaultValue={e.clicks ?? ""} aria-label="Клики" placeholder="Клики" className="input" />
                    </div>
                    <input name="reason" required placeholder="Причина исправления *" className="input" />
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="void" value="1" className="h-5 w-5" /> Аннулировать запись (ошибочная)</label>
                    <Submit variant="secondary" className="w-full">Сохранить исправление</Submit>
                  </ActionForm>
                  <p className="mt-1 text-xs text-muted">Старое значение не удаляется — оно остаётся в истории.</p>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ClientTab({ camp, client, people }: { camp: Campaign; client: ClientInfo | null; people: Person[] }) {
  if (!client) return <LoadError kind="denied" text="Карточка клиента недоступна вашей роли." />;
  const tel = telLink(client.phone);
  const wa = waLink(client.phone);
  const links = socialLinks(client.socials, camp.projects?.socials);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title={client.company_name}>
        <dl className="grid gap-3 text-sm">
          <div><dt className="text-xs text-muted">Ниша</dt><dd>{client.niche ?? "—"}</dd></div>
          <div><dt className="text-xs text-muted">Контактное лицо</dt><dd>{client.contact_name ?? "—"}</dd></div>
          <div><dt className="text-xs text-muted">Телефон</dt><dd>{client.phone ?? "—"}</dd></div>
          {client.email && <div><dt className="text-xs text-muted">Email</dt><dd className="break-all">{client.email}</dd></div>}
          {client.address && <div><dt className="text-xs text-muted">Адрес</dt><dd>{client.address}</dd></div>}
          <div><dt className="text-xs text-muted">Менеджер клиента</dt><dd>{nameOf(people, client.manager_id ?? camp.projects?.manager_id)}</dd></div>
          <div><dt className="text-xs text-muted">Администратор проекта</dt><dd>{nameOf(people, camp.projects?.admin_id)}</dd></div>
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          {tel && <a href={tel} className={btn("secondary")}><Phone size={18} />Позвонить</a>}
          {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className={btn("secondary")}><MessageCircle size={18} />WhatsApp</a>}
          {camp.projects && <Link href={`/app/projects/${camp.projects.id}`} className={btn("ghost")}>Проект</Link>}
        </div>
        <p className="mt-2 text-xs text-muted">WhatsApp открывает чат — сообщение не отправляется автоматически.</p>
      </Card>
      <div className="space-y-4">
        <Card title="Соцсети и сайт">
          {links.length === 0 ? <p className="text-sm text-muted">Ссылки не указаны в карточке клиента или проекта.</p> : (
            <ul className="space-y-1">{links.map((l) => <li key={l.url}><a href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 break-all text-sm font-semibold text-primary">{l.label}<ExternalLink size={14} /></a></li>)}</ul>
          )}
        </Card>
        {client.notes && <Card title="Особенности клиента"><p className="whitespace-pre-wrap text-sm">{client.notes}</p></Card>}
      </div>
    </div>
  );
}

function History({ status, budget, changes, entries, creatives, people }: {
  status: (StatusEvent & { from_status: string | null; reason: string | null; actor_id: string | null; created_at: string })[];
  budget: (BudgetEvent & { reason: string | null; actor_id: string | null; created_at: string })[];
  changes: { creative_id: string | null; field: string; old_value: string | null; new_value: string | null; actor_id: string | null; created_at: string }[];
  entries: Entry[]; creatives: Creative[]; people: Person[];
}) {
  const who = (id: string | null) => (id ? creatives.find((k) => k.id === id) : null);
  const subj = (id: string | null) => { const k = who(id); return k ? `Видео #${k.seq} «${k.title}»` : "Кампания"; };
  const label = (s: string, creative: boolean) => (creative ? CREATIVE_STATUS[s] : CAMPAIGN_STATUS[s]) ?? s;
  const shown = (f: string, v: string | null) => (v === null || v === "" ? "—" : f === "owner_id" || f === "assignee_id" ? nameOf(people, v) : f.endsWith("_minor") ? minorToInput(Number(v)) : v);
  const items = [
    ...status.map((h) => ({ at: h.created_at, actor: h.actor_id, text: `${subj(h.creative_id)}: ${h.from_status ? `${label(h.from_status, !!h.creative_id)} → ` : ""}${label(h.to_status, !!h.creative_id)} с ${date(h.effective_on)}`, note: h.reason })),
    ...budget.map((h) => ({ at: h.created_at, actor: h.actor_id, text: `${subj(h.creative_id)}: бюджет в день ${money(h.daily_budget_minor, h.currency)} с ${date(h.effective_from)}`, note: h.reason })),
    ...changes.map((h) => ({ at: h.created_at, actor: h.actor_id, text: `${subj(h.creative_id)}: ${FIELD[h.field] ?? h.field}: ${shown(h.field, h.old_value)} → ${shown(h.field, h.new_value)}`, note: null as string | null })),
    ...entries.filter((e) => e.superseded_at).map((e) => ({ at: e.superseded_at!, actor: e.superseded_by, text: `Расход ${date(e.day)} · ${e.creative_id ? subj(e.creative_id) : "вся кампания"}: ${money(e.spend_minor, e.currency)}, обращений ${e.leads} — заменено`, note: e.supersede_reason })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  if (!items.length) return <Empty title="Изменений пока нет" />;
  return (
    <Card>
      <ol className="divide-y divide-line">
        {items.map((i, n) => (
          <li key={n} className="py-3 text-sm">
            <p className="break-words">{i.text}</p>
            {i.note && <p className="text-[13px] text-muted">Причина: {i.note}</p>}
            <p className={cn("text-xs text-muted")}>{dateTime(i.at)} · {nameOf(people, i.actor)}</p>
          </li>
        ))}
      </ol>
    </Card>
  );
}
