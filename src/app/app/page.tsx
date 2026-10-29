import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { requireActive } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge, Notice, Stat, cn } from "@/components/ui";
import { iconOf } from "@/components/icons";
import { SubmitWorkButton } from "@/components/submit-work-button";
import { allowed } from "@/lib/nav";
import { CONTENT_KIND } from "@/lib/labels";
import { dateTime, localToIso, money, overdueText, time, todayLocal } from "@/lib/format";

export const metadata = { title: "Главная" };

const PRODUCTION_ROLES = ["creative_director", "project_manager", "planning_director", "project_admin", "department_head"];
const OPEN_CONTENT = "(done,published,cancelled,paused)";
const head = { count: "exact" as const, head: true };
const none = Promise.resolve({ count: 0, data: [] as unknown[] });

type MyItem = { key: string; title: string; sub: string; due: string | null; href: string };

export default async function Dashboard({ searchParams }: PageProps<"/app">) {
  const sp = await searchParams;
  const s = await requireActive();
  const supabase = await createClient();
  const today = todayLocal();
  const endToday = localToIso(today, "23:59");
  const now = new Date();
  const nowIso = now.toISOString();
  const in2days = new Date(now.getTime() + 2 * 86400_000).toISOString();

  const leader = s.isOwner || s.roles.includes("manager");
  const production = leader || s.roles.some((r) => PRODUCTION_ROLES.includes(r)) || s.can("content.manage") || s.can("shoots.manage");
  const finance = s.can("finance.view");
  const leadsOn = allowed(s, "/app/leads");

  const [myContent, myTasks, myContentCount, myTaskCount, myReview, projectsActive, leadsNew, leadsPreview, overdue, overduePreview, onReview, unassigned, shoots, pendingPays, pendingExpenses, pendingEmp, invoices, campaigns, myChecks] = await Promise.all([
    supabase.from("content_items").select("id,title,kind,prep_due,projects(name)").eq("assignee_id", s.userId).not("status", "in", "(done,published,cancelled,paused,review)").lte("prep_due", endToday).order("prep_due").limit(5),
    supabase.from("tasks").select("id,title,due_at,projects(name)").eq("assignee_id", s.userId).not("status", "in", "(done,cancelled,review)").lte("due_at", endToday).order("due_at").limit(5),
    supabase.from("content_items").select("id", head).eq("assignee_id", s.userId).not("status", "in", "(done,published,cancelled,paused,review)").lte("prep_due", endToday),
    supabase.from("tasks").select("id", head).eq("assignee_id", s.userId).not("status", "in", "(done,cancelled,review)").lte("due_at", endToday),
    supabase.from("content_items").select("id", head).eq("reviewer_id", s.userId).eq("status", "review"),
    leader || production ? supabase.from("projects").select("id", head).eq("status", "in_progress") : none,
    leadsOn ? supabase.from("leads").select("id", head).eq("stage", "new") : none,
    leadsOn ? supabase.from("leads").select("id,name,service,created_at").eq("stage", "new").order("created_at", { ascending: false }).limit(3) : none,
    production ? supabase.from("content_items").select("id", head).not("status", "in", OPEN_CONTENT).lt("prep_due", nowIso) : none,
    production ? supabase.from("content_items").select("id,title,prep_due,projects(name)").not("status", "in", OPEN_CONTENT).lt("prep_due", nowIso).order("prep_due").limit(3) : none,
    production ? supabase.from("content_items").select("id", head).eq("status", "review") : none,
    production ? supabase.from("content_items").select("id", head).is("assignee_id", null).eq("status", "planned") : none,
    production ? supabase.from("shoots").select("id,title,starts_at,location,projects(name)").eq("status", "planned").gte("starts_at", nowIso).lt("starts_at", in2days).order("starts_at").limit(4) : none,
    s.can("payments.confirm") ? supabase.from("payments").select("id", head).eq("status", "pending") : none,
    s.can("expenses.confirm") ? supabase.from("expenses").select("id", head).eq("status", "pending") : none,
    s.can("employees.manage") ? supabase.from("profiles").select("id", head).eq("status", "pending_approval") : none,
    finance ? supabase.from("v_invoice_status").select("amount_minor,paid_minor,pay_state").in("pay_state", ["unpaid", "partial", "overdue"]).limit(1000) : none,
    s.can("campaigns.manage") || s.can("campaigns.view_all") ? supabase.from("campaigns").select("id", head).eq("status", "active") : none,
    supabase.from("project_admin_checks").select("id", head).eq("admin_id", s.userId).eq("day", today).is("completed_at", null),
  ]);

  const n = (r: { count?: number | null }) => r.count ?? 0;
  type C = { id: string; title: string; kind: string; prep_due: string | null; projects: { name: string } | null };
  type T = { id: string; title: string; due_at: string | null; projects: { name: string } | null };
  const mine: MyItem[] = [
    ...((myContent.data ?? []) as unknown as C[]).map((c) => ({ key: "c" + c.id, title: `${CONTENT_KIND[c.kind]}: ${c.title}`, sub: c.projects?.name ?? "", due: c.prep_due, href: `/app/content/${c.id}` })),
    ...((myTasks.data ?? []) as unknown as T[]).map((t) => ({ key: "t" + t.id, title: t.title, sub: t.projects?.name ?? "Задача", due: t.due_at, href: `/app/tasks/${t.id}` })),
  ].sort((a, b) => (a.due ?? "").localeCompare(b.due ?? ""));
  const myTotal = n(myContentCount) + n(myTaskCount);
  const inv = (invoices.data ?? []) as { amount_minor: number; paid_minor: number; pay_state: string }[];
  const receivable = inv.reduce((a, i) => a + Number(i.amount_minor) - Number(i.paid_minor), 0);
  const overdueInvoices = inv.filter((i) => i.pay_state === "overdue").length;

  const tiles = [
    { href: "/app/reports", icon: "chart", title: "Отчёты", text: "План-факт и загрузка" },
    { href: "/app/finance", icon: "wallet", title: "Бухгалтерия", text: "Платежи и расходы" },
    { href: "/app/projects", icon: "folder", title: "Проекты", text: "Производство и сроки" },
    { href: "/app/team", icon: "idcard", title: "Сотрудники", text: "Команда и доступы" },
  ].filter((t) => allowed(s, t.href) && (leader || finance || production));

  const attention = [
    { show: n(pendingEmp) > 0, n: n(pendingEmp), label: "Сотрудники ждут утверждения", href: "/app/team?status=pending_approval", tone: "warn" as const },
    { show: n(pendingPays) > 0, n: n(pendingPays), label: "Платежи ждут подтверждения", href: "/app/finance?tab=payments", tone: "warn" as const },
    { show: n(pendingExpenses) > 0, n: n(pendingExpenses), label: "Расходы ждут подтверждения", href: "/app/finance?tab=expenses", tone: "warn" as const },
    { show: overdueInvoices > 0, n: overdueInvoices, label: "Счета просрочены клиентами", href: "/app/finance?tab=receivables", tone: "bad" as const },
    { show: n(myReview) > 0, n: n(myReview), label: "Материалы ждут моей проверки", href: "/app/today", tone: "warn" as const },
    { show: production && n(overdue) > 0, n: n(overdue), label: "Просрочено материалов", href: "/app/content?view=overdue", tone: "bad" as const },
    { show: production && n(unassigned) > 0, n: n(unassigned), label: "Материалы без исполнителя и ТЗ", href: "/app/content?view=unassigned", tone: "info" as const },
    { show: n(myChecks) > 0, n: n(myChecks), label: "Ежедневные проверки проектов", href: "/app/checks", tone: "info" as const },
  ].filter((a) => a.show);

  const first = (s.profile?.full_name || "").split(" ")[0];
  return (
    <>
      <div className="mb-5">
        <p className="text-sm capitalize text-muted">{new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Bishkek", weekday: "long", day: "numeric", month: "long" }).format(new Date())}</p>
        <h1 className="font-display text-[22px] font-semibold leading-tight md:text-[28px]">{first ? `${first}, добрый день` : "Добрый день"}</h1>
      </div>
      {sp.denied ? <div className="mb-4"><Notice tone="warn">Раздел недоступен для вашей роли.</Notice></div> : null}

      {tiles.length > 0 && (
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {tiles.map((t) => {
            const Icon = iconOf(t.icon);
            return (
              <Link key={t.href} href={t.href} className="rounded-2xl border border-line bg-surface p-4 transition active:scale-[.98] md:hover:border-brand">
                <Icon className="text-brand" size={24} />
                <div className="mt-2 font-semibold">{t.title}</div>
                <div className="mt-0.5 text-xs text-muted">{t.text}</div>
              </Link>
            );
          })}
        </div>
      )}

      {(leader || production || finance) && (
        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          {(leader || production) && <Stat label="Проектов в работе" value={n(projectsActive)} />}
          {leadsOn && <Stat label="Новых заявок" value={n(leadsNew)} tone={n(leadsNew) ? "warn" : undefined} />}
          {production && <Stat label="На проверке" value={n(onReview)} />}
          {production && <Stat label="Просрочено" value={n(overdue)} tone={n(overdue) ? "bad" : "good"} />}
          {finance && <Stat label="Дебиторка" value={money(receivable)} hint={overdueInvoices ? `просрочено счетов: ${overdueInvoices}` : "без просрочек"} tone={overdueInvoices ? "bad" : undefined} />}
          {campaigns.count ? <Stat label="Активных кампаний" value={n(campaigns)} /> : null}
        </div>
      )}

      {attention.length > 0 && (
        <section className="mb-5">
          <h2 className="group-title">Требует внимания</h2>
          <ul className="grouped">
            {attention.map((a) => (
              <li key={a.label}>
                <Link href={a.href} className="row">
                  <span className={cn("inline-flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-sm font-bold", { bad: "bg-bad-soft text-bad", warn: "bg-warn-soft text-warn", info: "bg-info-soft text-info" }[a.tone])}>{a.n}</span>
                  <span className="min-w-0 flex-1">{a.label}</span>
                  <ChevronRight size={18} className="shrink-0 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mb-5">
        <div className="mb-2 flex items-center justify-between gap-2 px-1">
          <h2 className="text-base font-semibold">Сегодня у меня{myTotal ? ` · ${myTotal}` : ""}</h2>
          <Link href="/app/today" className="text-sm font-semibold text-primary">Все задачи</Link>
        </div>
        {mine.length === 0 ? (
          <div className="rounded-2xl border border-line bg-surface p-4">
            <p className="font-semibold text-good">Свободен от назначенных задач сегодня</p>
            <p className="mt-1 text-sm text-muted">Незавершённых задач и материалов со сроком на сегодня нет. Это не значит, что материалы уже опубликованы — статусы видны в контент-плане.</p>
          </div>
        ) : (
          <>
            <ul className="grouped">
              {mine.map((i) => (
                <li key={i.key}>
                  <Link href={i.href} className="row">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{i.title}</span>
                      {i.sub && <span className="block truncate text-[13px] text-muted">{i.sub}</span>}
                    </span>
                    {overdueText(i.due) ? <Badge tone="bad">{overdueText(i.due)}</Badge> : <span className="shrink-0 text-[13px] tabular-nums text-muted">{i.due ? `до ${time(i.due)}` : ""}</span>}
                  </Link>
                </li>
              ))}
            </ul>
            {myTotal > mine.length && <p className="mt-2 px-1 text-xs text-muted">И ещё {myTotal - mine.length} — в разделе «Задачи».</p>}
            <SubmitWorkButton className="mt-3 w-full" />
          </>
        )}
      </section>

      {production && (overduePreview.data ?? []).length > 0 && (
        <section className="mb-5">
          <h2 className="group-title">Критические просрочки</h2>
          <ul className="grouped">
            {((overduePreview.data ?? []) as unknown as { id: string; title: string; prep_due: string; projects: { name: string } | null }[]).map((c) => (
              <li key={c.id}>
                <Link href={`/app/content/${c.id}`} className="row">
                  <span className="min-w-0 flex-1"><span className="block truncate font-medium">{c.title}</span><span className="block truncate text-[13px] text-muted">{c.projects?.name}</span></span>
                  <Badge tone="bad">{overdueText(c.prep_due)}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {production && (shoots.data ?? []).length > 0 && (
        <section className="mb-5">
          <h2 className="group-title">Съёмки сегодня и завтра</h2>
          <ul className="grouped">
            {((shoots.data ?? []) as unknown as { id: string; title: string; starts_at: string; location: string | null; projects: { name: string } | null }[]).map((sh) => (
              <li key={sh.id}>
                <Link href={`/app/shoots/${sh.id}`} className="row">
                  <span className="w-[72px] shrink-0 text-[13px] font-semibold tabular-nums">{dateTime(sh.starts_at).slice(0, 5)} {time(sh.starts_at)}</span>
                  <span className="min-w-0 flex-1"><span className="block truncate font-medium">{sh.title}</span><span className="block truncate text-[13px] text-muted">{[sh.projects?.name, sh.location].filter(Boolean).join(" · ") || "место не указано"}</span></span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {leadsOn && (leadsPreview.data ?? []).length > 0 && (
        <section className="mb-5">
          <div className="mb-2 flex items-center justify-between px-1"><h2 className="text-base font-semibold">Новые заявки</h2><Link href="/app/leads" className="text-sm font-semibold text-primary">Все</Link></div>
          <ul className="grouped">
            {((leadsPreview.data ?? []) as { id: string; name: string; service: string | null; created_at: string }[]).map((l) => (
              <li key={l.id}>
                <Link href={`/app/leads/${l.id}`} className="row">
                  <span className="min-w-0 flex-1"><span className="block truncate font-medium">{l.name}</span><span className="block truncate text-[13px] text-muted">{l.service ?? "услуга не выбрана"}</span></span>
                  <span className="shrink-0 text-[13px] text-muted">{dateTime(l.created_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
