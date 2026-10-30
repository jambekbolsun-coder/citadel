import Link from "next/link";
import { ChevronRight, MessageCircle, Phone, Plus } from "lucide-react";
import { requireActive } from "@/lib/auth";
import { Badge, Empty, LoadError, Notice, PageHeader, Stat, btn, cn } from "@/components/ui";
import { activePeople, nameOf } from "@/lib/data";
import { date, moneyMulti, todayLocal } from "@/lib/format";
import { daysBetween } from "@/lib/ads-math";
import { CAMPAIGN_STATUS, loadAdProjects, periodOf, statusTone, telLink, waLink } from "./data";
import { PeriodChips } from "./period-chips";

export const metadata = { title: "Мои рекламные проекты" };

const STATUS_FILTERS = [
  { key: "work", label: "В работе" },
  { key: "active", label: "Работает" },
  { key: "paused", label: "Пауза" },
  { key: "all", label: "Все" },
];

export default async function Campaigns({ searchParams }: PageProps<"/app/campaigns">) {
  const sp = await searchParams;
  const s = await requireActive(["campaigns.manage", "campaigns.view_all"]);
  const all = s.can("campaigns.view_all");
  const period = periodOf(sp);
  const status = typeof sp.status === "string" ? sp.status : "work";
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  const owner = all && typeof sp.owner === "string" && /^[0-9a-f-]{36}$/i.test(sp.owner) ? sp.owner : null;
  const [res, people] = await Promise.all([loadAdProjects({ period, owner, status, q }), activePeople()]);
  const today = todayLocal();
  const qs = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ period: period.key, status, ...(q ? { q } : {}), ...(owner ? { owner } : {}), ...(period.key === "custom" ? { from: period.from, to: period.to } : {}), ...patch });
    return `/app/campaigns?${p}`;
  };

  return (
    <>
      <PageHeader
        title={all ? "Рекламные проекты" : "Мои проекты"}
        subtitle="Ручной учёт рекламы: статусы и расходы вносит сотрудник. Интеграций с рекламными кабинетами нет — SMM KADR ничего не включает и не выключает на площадках."
        actions={s.can("campaigns.manage") ? <Link href="/app/campaigns/new" className={btn("primary")}><Plus size={18} />Кампания</Link> : null}
      />
      {res.error ? (
        <LoadError retry={qs({})} />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Проектов в работе" value={res.totals!.projectsInWork} />
            <Stat label="Кампаний работает" value={res.totals!.active} tone={res.totals!.active ? "good" : undefined} />
            <Stat label="Кампаний на паузе" value={res.totals!.paused} tone={res.totals!.paused ? "warn" : undefined} />
            <Stat label={`Потрачено · ${period.label}`} value={<span className="block break-words text-xl leading-snug">{moneyMulti(res.totals!.spend, "0")}</span>} hint="факт из журнала, валюты раздельно" />
          </div>

          <form className="mb-3 flex flex-wrap gap-2" role="search">
            <input type="hidden" name="period" value={period.key} />
            <input type="hidden" name="status" value={status} />
            {period.key === "custom" && <><input type="hidden" name="from" value={period.from} /><input type="hidden" name="to" value={period.to} /></>}
            <input name="q" defaultValue={q} placeholder="Клиент, ниша, кампания" aria-label="Поиск по рекламным проектам" className="input min-w-0 flex-1 basis-[12rem]" />
            {all && (
              <select name="owner" defaultValue={owner ?? ""} aria-label="Таргетолог" className="input min-w-0 flex-1 basis-[10rem]">
                <option value="">Все таргетологи</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </select>
            )}
            <button className={btn("secondary", "shrink-0")}>Найти</button>
          </form>
          <div className="mb-3 flex flex-wrap gap-2 text-sm">
            {STATUS_FILTERS.map((f) => (
              <Link key={f.key} href={qs({ status: f.key })} aria-current={status === f.key ? "page" : undefined} className={cn("inline-flex min-h-11 items-center rounded-xl px-3", status === f.key ? "bg-surface font-semibold ring-1 ring-line" : "text-muted")}>{f.label}</Link>
            ))}
          </div>
          <PeriodChips base="/app/campaigns" params={{ status, ...(q ? { q } : {}), ...(owner ? { owner } : {}) }} period={period} />

          {res.cards.length === 0 ? (
            <Empty
              title={q || status !== "work" ? "Ничего не найдено" : all ? "Рекламных проектов пока нет" : "Вам пока не назначены рекламные проекты"}
              text={all ? "Создайте кампанию в проекте клиента и назначьте таргетолога — проект появится у него в «Моих проектах»." : "Когда руководитель назначит вас таргетологом проекта или кампании, они появятся здесь."}
            />
          ) : (
            <ul className="grid gap-3 lg:grid-cols-2">
              {res.cards.map((c) => {
                const single = c.campaigns.length === 1;
                const href = single ? `/app/campaigns/${c.campaigns[0].id}` : `/app/campaigns/project/${c.projectId}`;
                const tel = telLink(c.client?.phone);
                const wa = waLink(c.client?.phone);
                const age = c.startedOn ? daysBetween(c.startedOn, today) + 1 : null;
                return (
                  <li key={c.projectId} className={cn("rounded-[20px] border bg-surface p-4", c.overdueCheck ? "border-warn" : "border-line")}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link href={href} className="block break-words font-semibold leading-snug hover:underline">{c.client?.company_name ?? c.projectName}</Link>
                        <p className="mt-0.5 text-[13px] text-muted">{[c.client?.niche, c.client?.company_name && c.client.company_name !== c.projectName ? c.projectName : null].filter(Boolean).join(" · ") || "ниша не указана"}</p>
                      </div>
                      <Badge tone={statusTone(c.status)}>{CAMPAIGN_STATUS[c.status]}</Badge>
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                      <div><dt className="text-xs text-muted">План в день</dt><dd className="font-semibold">{moneyMulti(c.dailyPlan, "не задан")}</dd></div>
                      <div><dt className="text-xs text-muted">Потрачено · {period.label}</dt><dd className="font-semibold">{moneyMulti(c.spend, "0")}</dd></div>
                      <div><dt className="text-xs text-muted">Работает</dt><dd>{age ? `${age} дн. · с ${date(c.startedOn)}` : "ещё не запускалась"}</dd></div>
                      <div><dt className="text-xs text-muted">Активных видео</dt><dd>{c.activeCreatives}</dd></div>
                      <div><dt className="text-xs text-muted">Проверка</dt><dd className={c.overdueCheck ? "font-semibold text-warn" : ""}>{c.nextCheck ? (c.overdueCheck ? `пора (${date(c.nextCheck)})` : date(c.nextCheck)) : "—"}</dd></div>
                      <div><dt className="text-xs text-muted">Кампаний</dt><dd>{c.campaigns.length}{all ? ` · ${[...new Set(c.campaigns.map((k) => nameOf(people, k.owner_id)))].join(", ")}` : ""}</dd></div>
                    </dl>
                    {c.client?.contact_name && <p className="mt-3 truncate text-sm"><span className="text-muted">Контакт:</span> {c.client.contact_name}</p>}
                    <div className="mt-3 flex gap-2">
                      {tel && <a href={tel} className={btn("secondary", "w-11 px-0")} aria-label={`Позвонить ${c.client?.contact_name ?? "клиенту"}`}><Phone size={18} /></a>}
                      {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className={btn("secondary", "w-11 px-0")} aria-label="Открыть чат WhatsApp"><MessageCircle size={18} /></a>}
                      <Link href={href} className={btn("primary", "flex-1")}>Открыть<ChevronRight size={18} /></Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="mt-4"><Notice>«Бюджет в день» — плановый лимит, не расход. «Потрачено» — только суммы, записанные в журнал. Бюджет клиента не является выручкой агентства.</Notice></div>
        </>
      )}
    </>
  );
}
