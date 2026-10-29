import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, MessageCircle, Phone, Plus } from "lucide-react";
import { requireActive } from "@/lib/auth";
import { Badge, Card, LoadError, PageHeader, Stat, btn } from "@/components/ui";
import { activePeople, nameOf } from "@/lib/data";
import { date, moneyMulti } from "@/lib/format";
import { activeDailyBudget } from "@/lib/ads-math";
import { CAMPAIGN_STATUS, PLATFORM, loadAdProjects, periodOf, socialLinks, statusTone, telLink, waLink } from "../../data";

export default async function AdProject({ params, searchParams }: PageProps<"/app/campaigns/project/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const s = await requireActive(["campaigns.manage", "campaigns.view_all"]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const period = periodOf(sp);
  const [res, people] = await Promise.all([loadAdProjects({ period, status: "all" }), activePeople()]);
  if (res.error) return <><PageHeader back="/app/campaigns" title="Рекламный проект" /><LoadError retry={`/app/campaigns/project/${id}`} back="/app/campaigns" /></>;
  const card = res.cards.find((c) => c.projectId === id);
  if (!card) return <><PageHeader back="/app/campaigns" title="Рекламный проект" /><LoadError kind="denied" text="Проект не найден среди ваших рекламных проектов." back="/app/campaigns" backLabel="К моим проектам" /></>;
  const c = card.client;
  const tel = telLink(c?.phone);
  const wa = waLink(c?.phone);
  const links = socialLinks(c?.socials, card.campaigns[0]?.projects?.socials);
  return (
    <>
      <PageHeader back="/app/campaigns" title={c?.company_name ?? card.projectName} subtitle={[c?.niche, card.projectName !== c?.company_name ? card.projectName : null].filter(Boolean).join(" · ") || undefined}
        actions={s.can("campaigns.manage") ? <Link href={`/app/campaigns/new?project=${id}`} className={btn("secondary")}><Plus size={18} />Кампания</Link> : null} />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="План в день" value={<span className="text-xl">{moneyMulti(card.dailyPlan, "не задан")}</span>} hint="лимит, не расход" />
        <Stat label={`Потрачено · ${period.label}`} value={<span className="text-xl">{moneyMulti(card.spend, "0")}</span>} />
        <Stat label="Обращения" value={card.leads} />
        <Stat label="Активных видео" value={card.activeCreatives} />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <section>
          <h2 className="group-title">Кампании</h2>
          <ul className="grouped">
            {card.campaigns.map((k) => (
              <li key={k.id}>
                <Link href={`/app/campaigns/${k.id}`} className="row">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{k.name}</span>
                    <span className="block truncate text-[13px] text-muted">{PLATFORM[k.platform] ?? k.platform} · {moneyMulti(activeDailyBudget(k.campaign_creatives, k), "план не задан")}/день · {k.started_on ? `с ${date(k.started_on)}` : "не запускалась"} · {nameOf(people, k.owner_id)}</span>
                  </span>
                  <Badge tone={statusTone(k.status)}>{CAMPAIGN_STATUS[k.status]}</Badge>
                  <ChevronRight size={18} className="shrink-0 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <Card title="Клиент">
          {!c ? <p className="text-sm text-muted">Карточка клиента недоступна вашей роли.</p> : (
            <>
              <p className="text-sm">{c.contact_name ?? "Контакт не указан"}{c.phone ? ` · ${c.phone}` : ""}</p>
              {c.notes && <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{c.notes}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                {tel && <a href={tel} className={btn("secondary")}><Phone size={18} />Позвонить</a>}
                {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className={btn("secondary")}><MessageCircle size={18} />WhatsApp</a>}
              </div>
              {links.length > 0 && <ul className="mt-3 space-y-1 text-sm">{links.map((l) => <li key={l.url}><a href={l.url} target="_blank" rel="noopener noreferrer" className="break-all font-semibold text-primary">{l.label}</a></li>)}</ul>}
            </>
          )}
          {(s.can("credentials.reveal") || s.can("credentials.manage")) && card.campaigns[0] && <Link href={`/app/campaigns/${card.campaigns[0].id}?tab=access`} className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-primary">Доступы к соцсетям →</Link>}
        </Card>
      </div>
    </>
  );
}
