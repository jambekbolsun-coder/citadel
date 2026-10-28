import Link from "next/link";
import { Globe, Building2, BarChart3, Users, ArrowRight } from "lucide-react";
import { requireActive } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, Notice, PageHeader, Stat } from "@/components/ui";
import { dateTime, money, overdueText, time, todayLocal, localToIso } from "@/lib/format";
import { CONTENT_KIND, CONTENT_STATUS, PROJECT_STATUS } from "@/lib/labels";

export const metadata = { title: "Главная" };

export default async function Dashboard({ searchParams }: PageProps<"/app">) {
  const sp = await searchParams;
  const s = await requireActive();
  const supabase = await createClient();
  const today = todayLocal();
  const tomorrowStart = localToIso(today, "00:00");
  const dayAfter = new Date(new Date(tomorrowStart).getTime() + 2 * 86400_000).toISOString();
  const nowIso = new Date().toISOString();
  const isLead = s.can("projects.view_all") || s.can("leads.manage") || s.can("finance.view") || s.isOwner;

  const [leads, overdue, shoots, invoices, pendingPays, pendingEmp, myContent, myTasks, activeProjects] = await Promise.all([
    s.can("leads.view") || s.can("leads.receive") || s.can("leads.manage")
      ? supabase.from("leads").select("id,name,phone,service,created_at,assignee_id").eq("stage", "new").order("created_at", { ascending: false }).limit(5)
      : Promise.resolve({ data: [] }),
    supabase.from("content_items").select("id,title,kind,prep_due,status,project_id,projects(name)").not("status", "in", "(done,published,cancelled,paused)").lt("prep_due", nowIso).order("prep_due").limit(6),
    supabase.from("shoots").select("id,title,starts_at,location,projects(name)").eq("status", "planned").gte("starts_at", nowIso).lt("starts_at", dayAfter).order("starts_at").limit(6),
    s.can("finance.view") ? supabase.from("v_invoice_status").select("id,title,amount_minor,paid_minor,due_on,pay_state,project_id").in("pay_state", ["unpaid", "partial", "overdue"]).order("due_on").limit(6) : Promise.resolve({ data: [] }),
    s.can("payments.confirm") ? supabase.from("payments").select("id", { count: "exact", head: true }).eq("status", "pending") : Promise.resolve({ count: 0 }),
    s.can("employees.manage") ? supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "pending_approval") : Promise.resolve({ count: 0 }),
    supabase.from("content_items").select("id,title,kind,status,prep_due,projects(name)").eq("assignee_id", s.userId).not("status", "in", "(done,published,cancelled)").order("prep_due").limit(6),
    supabase.from("tasks").select("id,title,due_at,status").eq("assignee_id", s.userId).not("status", "in", "(done,cancelled)").order("due_at").limit(6),
    supabase.from("projects").select("id", { count: "exact", head: true }).eq("status", "in_progress"),
  ]);

  const tiles = [
    { href: "/app/cms", icon: Globe, title: "Маркетинг и сайт", text: "Сайт, заявки, CRM, тарифы", show: s.can("cms.manage") || s.can("leads.manage") },
    { href: "/app/projects", icon: Building2, title: "Управление компанией", text: "Проекты, календарь, производство", show: true },
    { href: "/app/reports", icon: BarChart3, title: "Отчёт компании", text: "План-факт, финансы, загрузка", show: s.can("reports.view") || s.can("finance.view") },
    { href: "/app/team", icon: Users, title: "Сотрудники", text: "Команда, приглашения, права", show: s.can("employees.view") },
  ].filter((t) => t.show);

  return (
    <>
      <PageHeader title={`Здравствуйте, ${(s.profile?.full_name || "").split(" ")[0] || "коллега"}`} subtitle={new Intl.DateTimeFormat("ru-RU", { timeZone: "Asia/Bishkek", weekday: "long", day: "numeric", month: "long" }).format(new Date())} />
      {sp.denied ? <div className="mb-4"><Notice tone="warn">Раздел недоступен для вашей роли.</Notice></div> : null}

      {isLead && (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {tiles.map((t) => (
            <Link key={t.href} href={t.href} className="group rounded-2xl border border-line bg-surface p-4 transition hover:border-primary md:p-5">
              <t.icon className="text-brand" size={28} />
              <div className="mt-3 font-semibold">{t.title}</div>
              <div className="mt-1 text-xs text-muted">{t.text}</div>
            </Link>
          ))}
        </div>
      )}

      {isLead && (
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Проектов в работе" value={activeProjects.count ?? 0} />
          <Stat label="Новых заявок" value={(leads.data ?? []).length} tone={(leads.data ?? []).length ? "warn" : undefined} />
          <Stat label="Просрочено материалов" value={(overdue.data ?? []).length} tone={(overdue.data ?? []).length ? "bad" : "good"} />
          <Stat label="Платежей на подтверждении" value={pendingPays.count ?? 0} tone={pendingPays.count ? "warn" : undefined} />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {(pendingEmp.count ?? 0) > 0 && (
          <Card title="Сотрудники ждут утверждения">
            <Link href="/app/team?status=pending_approval" className="flex items-center justify-between text-sm">
              <span>{pendingEmp.count} профиль(ей) ожидают доступа</span> <ArrowRight size={16} />
            </Link>
          </Card>
        )}
        {(leads.data ?? []).length > 0 && (
          <Card title="Новые заявки" actions={<Link href="/app/leads" className="text-sm text-primary">Все →</Link>}>
            <ul className="divide-y divide-line">
              {(leads.data as { id: string; name: string; phone: string; service: string | null; created_at: string }[]).map((l) => (
                <li key={l.id} className="py-2">
                  <Link href={`/app/leads/${l.id}`} className="flex items-center justify-between gap-2 text-sm">
                    <span><b>{l.name}</b> · {l.service ?? "услуга не выбрана"}</span>
                    <span className="text-xs text-muted">{dateTime(l.created_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
        <Card title="Мои материалы" actions={<Link href="/app/today" className="text-sm text-primary">Сегодня →</Link>}>
          {(myContent.data ?? []).length === 0 && (myTasks.data ?? []).length === 0 ? (
            <p className="text-sm text-muted">Активных назначений нет.</p>
          ) : (
            <ul className="divide-y divide-line">
              {(myContent.data as unknown as { id: string; title: string; kind: string; status: string; prep_due: string | null; projects: { name: string } | null }[]).map((c) => (
                <li key={c.id} className="py-2">
                  <Link href={`/app/content/${c.id}`} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate">{CONTENT_KIND[c.kind]}: {c.title} <span className="text-muted">· {c.projects?.name}</span></span>
                    {overdueText(c.prep_due) ? <Badge tone="bad">{overdueText(c.prep_due)}</Badge> : <Badge status={c.status}>{CONTENT_STATUS[c.status]}</Badge>}
                  </Link>
                </li>
              ))}
              {(myTasks.data as { id: string; title: string; due_at: string | null; status: string }[]).map((t) => (
                <li key={t.id} className="py-2">
                  <Link href={`/app/tasks/${t.id}`} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">Задача: {t.title}</span>
                    {overdueText(t.due_at) ? <Badge tone="bad">{overdueText(t.due_at)}</Badge> : <span className="text-xs text-muted">{dateTime(t.due_at)}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {(overdue.data ?? []).length > 0 && (
          <Card title="Критические просрочки">
            <ul className="divide-y divide-line">
              {(overdue.data as unknown as { id: string; title: string; kind: string; prep_due: string; projects: { name: string } | null }[]).map((c) => (
                <li key={c.id} className="py-2">
                  <Link href={`/app/content/${c.id}`} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">{c.projects?.name}: {c.title}</span>
                    <Badge tone="bad">{overdueText(c.prep_due)}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
        {(shoots.data ?? []).length > 0 && (
          <Card title="Съёмки сегодня и завтра" actions={<Link href="/app/shoots" className="text-sm text-primary">Все →</Link>}>
            <ul className="divide-y divide-line">
              {(shoots.data as unknown as { id: string; title: string; starts_at: string; location: string | null; projects: { name: string } | null }[]).map((sh) => (
                <li key={sh.id} className="py-2">
                  <Link href={`/app/shoots/${sh.id}`} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">{sh.projects?.name}: {sh.title}</span>
                    <span className="text-xs text-muted">{dateTime(sh.starts_at)} · {sh.location ?? "место не указано"}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
        {(invoices.data ?? []).length > 0 && (
          <Card title="Неоплаченные счета" actions={<Link href="/app/finance" className="text-sm text-primary">Бухгалтерия →</Link>}>
            <ul className="divide-y divide-line">
              {(invoices.data as { id: string; title: string; amount_minor: number; paid_minor: number; due_on: string; pay_state: string; project_id: string }[]).map((i) => (
                <li key={i.id} className="py-2">
                  <Link href={`/app/projects/${i.project_id}?tab=finance`} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">{i.title} · остаток {money(i.amount_minor - i.paid_minor)}</span>
                    <Badge status={i.pay_state}>{i.pay_state === "overdue" ? "Просрочено" : `до ${new Date(i.due_on).toLocaleDateString("ru-RU")}`}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
      <p className="mt-6 text-xs text-muted">Статусы проектов: {Object.values(PROJECT_STATUS).slice(0, 0).join("")}Данные обновляются в реальном времени для уведомлений · {time(new Date())}</p>
    </>
  );
}
