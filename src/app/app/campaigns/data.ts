import "server-only";
import { createClient } from "@/lib/supabase/server";
import { activeDailyBudget, addDays, addTo, nextCheck, spendTotals, type Money, type SpendEntry } from "@/lib/ads-math";
import { todayLocal } from "@/lib/format";

export const CAMPAIGN_STATUS: Record<string, string> = { draft: "Черновик", active: "Работает", paused: "Пауза", finished: "Завершена" };
export const CREATIVE_STATUS: Record<string, string> = { active: "Включён", paused: "Пауза", off: "Выключен" };
export const CREATIVE_KIND: Record<string, string> = { video: "Видео", static: "Статичный", carousel: "Карусель", story: "Сторис", other: "Другое" };
export const PLATFORM: Record<string, string> = { meta: "Meta (Instagram/Facebook)", google: "Google", tiktok: "TikTok", other: "Другое" };
export const statusTone = (s: string) => (s === "active" ? "good" : s === "paused" ? "warn" : s === "off" || s === "finished" ? "neutral" : "info") as "good" | "warn" | "neutral" | "info";

export type Period = { key: string; from: string; to: string; label: string };

/** Период фильтра: сегодня / 7 дней / месяц / произвольные даты (включительно, по Бишкеку). */
export function periodOf(sp: Record<string, string | string[] | undefined>): Period {
  const today = todayLocal();
  const key = typeof sp.period === "string" ? sp.period : "month";
  const valid = (d: unknown) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);
  if (key === "today") return { key, from: today, to: today, label: "сегодня" };
  if (key === "7d") return { key, from: addDays(today, -6), to: today, label: "7 дней" };
  if (key === "custom" && valid(sp.from) && valid(sp.to) && (sp.from as string) <= (sp.to as string)) return { key, from: sp.from as string, to: sp.to as string, label: "выбранный период" };
  return { key: "month", from: `${today.slice(0, 7)}-01`, to: today, label: "этот месяц" };
}

export type ClientInfo = { id: string; company_name: string; contact_name: string | null; phone: string | null; email: string | null; niche: string | null; address: string | null; socials: Record<string, string> | null; notes: string | null; manager_id: string | null };
export type CampaignRow = {
  id: string; name: string; platform: string; status: string; currency: string; budget_minor: number; daily_budget_minor: number | null;
  owner_id: string | null; starts_on: string | null; ends_on: string | null; started_on: string | null; check_every_days: number; created_at: string; project_id: string; goal: string | null;
  projects: { id: string; name: string; status: string; socials: Record<string, string> | null; clients: ClientInfo | null } | null;
  campaign_creatives: { id: string; status: string; daily_budget_minor: number; currency: string }[];
};

export type ProjectCard = {
  projectId: string; projectName: string; client: ClientInfo | null; campaigns: CampaignRow[];
  status: "active" | "paused" | "draft" | "finished"; startedOn: string | null; dailyPlan: Money; spend: Money; leads: number;
  activeCreatives: number; nextCheck: string | null; overdueCheck: boolean; lastDay: string | null;
};

const LIST_COLS = "id,name,platform,status,currency,budget_minor,daily_budget_minor,owner_id,starts_on,ends_on,started_on,check_every_days,created_at,project_id,goal," +
  "projects(id,name,status,socials,clients(id,company_name,contact_name,phone,email,niche,address,socials,notes,manager_id))," +
  "campaign_creatives(id,status,daily_budget_minor,currency)";

/** Рекламные проекты, видимые сотруднику (RLS: свои/назначенные; весь список — при campaigns.view_all). */
export async function loadAdProjects(opts: { period: Period; owner?: string | null; status?: string | null; q?: string | null; mineOnly?: string | null }) {
  const supabase = await createClient();
  let q = supabase.from("campaigns").select(LIST_COLS).order("created_at", { ascending: false }).limit(500);
  if (opts.owner) q = q.eq("owner_id", opts.owner);
  if (opts.mineOnly) q = q.eq("owner_id", opts.mineOnly);
  const { data, error } = await q;
  if (error) return { error, cards: [] as ProjectCard[], totals: null };
  const rows = (data ?? []) as unknown as CampaignRow[];
  const ids = rows.map((r) => r.id);
  let entries: (SpendEntry & { campaign_id: string })[] = [];
  if (ids.length) {
    const r = await supabase.from("campaign_spend_entries").select("campaign_id,creative_id,day,currency,spend_minor,leads").in("campaign_id", ids).is("superseded_at", null).limit(20000);
    if (r.error) return { error: r.error, cards: [] as ProjectCard[], totals: null };
    entries = (r.data ?? []) as typeof entries;
  }
  const today = todayLocal();
  const byProject = new Map<string, ProjectCard>();
  for (const c of rows) {
    const pid = c.project_id;
    const card = byProject.get(pid) ?? {
      projectId: pid, projectName: c.projects?.name ?? "Проект", client: c.projects?.clients ?? null, campaigns: [], status: "finished" as ProjectCard["status"],
      startedOn: null, dailyPlan: {}, spend: {}, leads: 0, activeCreatives: 0, nextCheck: null, overdueCheck: false, lastDay: null,
    };
    card.campaigns.push(c);
    const mine = entries.filter((e) => e.campaign_id === c.id);
    const period = spendTotals(mine, opts.period.from, opts.period.to);
    const all = spendTotals(mine);
    for (const [cur, v] of Object.entries(period.spend)) addTo(card.spend, cur, v);
    card.leads += period.leadsTotal;
    for (const [cur, v] of Object.entries(activeDailyBudget(c.campaign_creatives, c))) addTo(card.dailyPlan, cur, v);
    card.activeCreatives += c.status === "active" ? c.campaign_creatives.filter((k) => k.status === "active").length : 0;
    if (c.started_on && (!card.startedOn || c.started_on < card.startedOn)) card.startedOn = c.started_on;
    if (all.lastDay && (!card.lastDay || all.lastDay > card.lastDay)) card.lastDay = all.lastDay;
    if (c.status === "active") {
      const nc = nextCheck(all.lastDay, c.started_on ?? c.created_at.slice(0, 10), c.check_every_days);
      if (nc && (!card.nextCheck || nc < card.nextCheck)) card.nextCheck = nc;
      if (nc && nc <= today) card.overdueCheck = true;
    }
    const rank = { active: 3, paused: 2, draft: 1, finished: 0 } as const;
    if (rank[c.status as keyof typeof rank] > rank[card.status]) card.status = c.status as ProjectCard["status"];
    byProject.set(pid, card);
  }
  let cards = [...byProject.values()];
  if (opts.status && opts.status !== "all") cards = cards.filter((c) => (opts.status === "work" ? c.status === "active" || c.status === "paused" : c.campaigns.some((k) => k.status === opts.status)));
  if (opts.q) {
    const needle = opts.q.toLowerCase();
    cards = cards.filter((c) => [c.projectName, c.client?.company_name, c.client?.niche, c.client?.contact_name, ...c.campaigns.map((k) => k.name)].some((x) => x?.toLowerCase().includes(needle)));
  }
  cards.sort((a, b) => Number(b.overdueCheck) - Number(a.overdueCheck) || ["active", "paused", "draft", "finished"].indexOf(a.status) - ["active", "paused", "draft", "finished"].indexOf(b.status) || a.projectName.localeCompare(b.projectName, "ru"));
  const visible = new Set(cards.flatMap((c) => c.campaigns.map((k) => k.id)));
  const totals = {
    projectsInWork: cards.filter((c) => c.status === "active" || c.status === "paused").length,
    active: rows.filter((r) => visible.has(r.id) && r.status === "active").length,
    paused: rows.filter((r) => visible.has(r.id) && r.status === "paused").length,
    spend: cards.reduce((m, c) => {
      for (const [cur, v] of Object.entries(c.spend)) addTo(m, cur, v);
      return m;
    }, {} as Money),
  };
  return { error: null, cards, totals };
}

/** Телефон → ссылка WhatsApp (только цифры). Сообщение не отправляется — открывается чат. */
export function waLink(phone: string | null | undefined) {
  const d = (phone ?? "").replace(/\D/g, "");
  return d.length >= 9 ? `https://wa.me/${d}` : null;
}
export function telLink(phone: string | null | undefined) {
  const d = (phone ?? "").replace(/[^\d+]/g, "");
  return d.length >= 6 ? `tel:${d}` : null;
}
export function socialLinks(...sources: (Record<string, string> | null | undefined)[]) {
  const out: { label: string; url: string }[] = [];
  const seen = new Set<string>();
  for (const s of sources) {
    for (const [k, v] of Object.entries(s ?? {})) {
      if (typeof v !== "string" || !/^https?:\/\//i.test(v) || seen.has(v)) continue;
      seen.add(v);
      out.push({ label: k, url: v });
    }
  }
  return out;
}
