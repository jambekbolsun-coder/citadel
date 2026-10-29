/* eslint-disable @typescript-eslint/no-explicit-any -- строки Supabase без сгенерированных типов */
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActive } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, Empty, Field, Notice, PageHeader, Progress, Stat, Tabs } from "@/components/ui";
import { ActionForm, Submit } from "@/components/action-form";
import { PeopleSelect } from "@/components/people-select";
import { ProjectAccess } from "@/components/project-access";
import { activePeople, accounts as loadAccounts, nameOf } from "@/lib/data";
import { CONTENT_KIND, CONTENT_STATUS, PAYMENT_STATUS, PAY_STATE, PROJECT_KIND, PROJECT_STATUS, PROJECT_TRANSITIONS } from "@/lib/labels";
import { date, dateTime, minorToInput, money, overdueText, todayLocal } from "@/lib/format";
import * as A from "../actions";

const TABS = [
  ["overview", "Обзор и допуск"], ["plan", "План-факт"], ["content", "Контент"], ["stories", "Сторис"], ["shoots", "Съёмки"],
  ["finance", "Финансы"], ["checks", "Проверки"], ["access", "Доступы"], ["history", "История"],
] as const;

type Period = { id: string; seq: number; label: string; starts_on: string; ends_on: string; status: string; plan_status: string };
type Progress_ = { period_id: string; kind: string; planned: number; in_work: number; in_post: number; prepared: number; published: number; verified: number; left_to_prepare: number; left_to_publish: number; overflow: number; overdue: number };

export default async function ProjectPage({ params, searchParams }: PageProps<"/app/projects/[id]">) {
  const { id } = await params;
  const sp = await searchParams;
  const tab = (typeof sp.tab === "string" ? sp.tab : "overview") as (typeof TABS)[number][0];
  const s = await requireActive();
  const supabase = await createClient();
  const { data: p } = await supabase.from("projects").select("*, clients(id,company_name,contact_name,phone)").eq("id", id).maybeSingle();
  if (!p) notFound();
  const [people, { data: periodsData }, { data: contract }, { data: members }] = await Promise.all([
    activePeople(),
    supabase.from("project_periods").select("*").eq("project_id", id).order("seq", { ascending: false }),
    supabase.from("project_contracts").select("*").eq("project_id", id).maybeSingle(),
    supabase.from("project_members").select("user_id,role").eq("project_id", id),
  ]);
  const periods = (periodsData ?? []) as Period[];
  const periodId = typeof sp.period === "string" ? sp.period : periods.find((x) => x.status === "open")?.id ?? periods[0]?.id;
  const period = periods.find((x) => x.id === periodId);
  const canManage = s.can("projects.manage") || p.admin_id === s.userId || p.manager_id === s.userId;
  const tabs = TABS.filter(([k]) => (k === "finance" ? s.can("finance.view") || s.can("payments.create") || s.can("prices.view") : k === "access" ? s.can("credentials.reveal") || s.can("credentials.manage") : true));
  const href = (t: string) => `/app/projects/${id}?tab=${t}${periodId ? `&period=${periodId}` : ""}`;

  return (
    <>
      <PageHeader
        back="/app/projects"
        title={p.name}
        subtitle={<>#{p.number} · <Link className="hover:underline" href={`/app/clients/${p.clients?.id}`}>{p.clients?.company_name}</Link> · {PROJECT_KIND[p.kind]} · админ: {nameOf(people, p.admin_id)}</>}
        actions={<Badge status={p.status}>{PROJECT_STATUS[p.status]}</Badge>}
      />
      <Tabs items={tabs.map(([k, l]) => ({ key: k, label: l, href: href(k) }))} active={tab} />
      {periods.length > 0 && ["plan", "content", "stories"].includes(tab) && (
        <form className="mb-4 flex items-center gap-2 text-sm">
          <input type="hidden" name="tab" value={tab} />
          <span className="text-muted">Период:</span>
          <select name="period" defaultValue={periodId} className="input max-w-xs">
            {periods.map((x) => <option key={x.id} value={x.id}>№{x.seq} · {x.label} · {x.status === "open" ? "открыт" : x.status === "closed" ? "закрыт" : "закрыт с долгом"}</option>)}
          </select>
          <button className="rounded-xl bg-surface-2 px-3 py-2 font-semibold ring-1 ring-line">Показать</button>
        </form>
      )}

      {tab === "overview" && <Overview p={p} contract={contract} people={people} members={(members ?? []) as { user_id: string; role: string }[]} canManage={canManage} canOverride={s.can("projects.launch_override")} />}
      {tab === "plan" && <PlanTab projectId={id} period={period} periods={periods} canManage={canManage || s.can("content.plan")} contract={contract} />}
      {tab === "content" && <ContentTab projectId={id} period={period} people={people} canManage={canManage || s.can("content.manage")} />}
      {tab === "stories" && <StoriesTab projectId={id} period={period} people={people} />}
      {tab === "shoots" && <ShootsTab projectId={id} />}
      {tab === "finance" && <FinanceTab projectId={id} periods={periods} canConfirm={s.can("payments.confirm")} canCreate={s.can("payments.create")} canInvoice={s.can("finance.manage")} me={s.userId} isOwner={s.isOwner} />}
      {tab === "checks" && <ChecksTab projectId={id} people={people} />}
      {tab === "access" && <AccessTab projectId={id} canManage={s.can("credentials.manage")} />}
      {tab === "history" && <HistoryTab projectId={id} people={people} />}
    </>
  );
}

/* ───────────── Обзор, допуск, команда, договор ───────────── */
async function Overview({ p, contract, people, members, canManage, canOverride }: { p: Record<string, any>; contract: Record<string, any> | null; people: Awaited<ReturnType<typeof activePeople>>; members: { user_id: string; role: string }[]; canManage: boolean; canOverride: boolean }) {
  const supabase = await createClient();
  const { data: paid } = await supabase.rpc("project_paid_status", { p_project: p.id });
  const ps = (paid ?? {}) as { price?: number; paid?: number; pending?: number; invoiced?: number };
  const h = (p.handoff ?? {}) as Record<string, boolean>;
  const price = ps.price ?? contract?.price_minor ?? 0;
  const fullyPaid = price > 0 && (ps.paid ?? 0) >= price;
  const next = PROJECT_TRANSITIONS[p.status] ?? [];
  const comp = (contract?.composition ?? {}) as Record<string, number>;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Допуск к производству">
        {p.launched_at ? (
          <Notice tone="good">Запущен {dateTime(p.launched_at)} · {nameOf(people, p.launched_by)}{p.launch_override_reason ? ` · исключение: ${p.launch_override_reason}` : ""}</Notice>
        ) : (
          <>
            <ActionForm action={A.saveHandoff} className="space-y-2">
              <input type="hidden" name="id" value={p.id} />
              {[["client", "Клиент и контакты подтверждены"], ["package", "Пакет и объём согласованы"], ["dates", "Даты договора и работ согласованы"], ["wishes", "Пожелания и референсы получены"], ["admin_accepted", "Администратор принял проект"]].map(([k, l]) => (
                <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" name={k} defaultChecked={!!h[k]} disabled={!canManage} /> {l}</label>
              ))}
              <div className="flex items-center gap-2 text-sm">
                <span className={fullyPaid ? "text-good" : "text-warn"}>{fullyPaid ? "✓" : "○"}</span>
                Оплата: {money(ps.paid ?? 0)} из {money(price)} {(ps.pending ?? 0) > 0 && <span className="text-muted">(на подтверждении {money(ps.pending)})</span>}
              </div>
              {canManage && <Submit variant="secondary">Сохранить чек-лист</Submit>}
            </ActionForm>
            {canManage && (
              <ActionForm action={A.launchProject} className="mt-4 space-y-2 border-t border-line pt-4">
                <input type="hidden" name="id" value={p.id} />
                {canOverride && <input name="reason" className="input" placeholder="Причина исключения (только если оплата/чек-лист не завершены)" />}
                <Submit>Допустить к производству</Submit>
                <p className="text-xs text-muted">Частичная оплата не даёт допуск автоматически. Исключение — только владелец/уполномоченный, с причиной и записью в аудите.</p>
              </ActionForm>
            )}
          </>
        )}
      </Card>

      <Card title="Статус проекта">
        <div className="mb-3 text-sm">Текущий: <Badge status={p.status}>{PROJECT_STATUS[p.status]}</Badge></div>
        {canManage && next.length > 0 ? (
          <ActionForm action={A.setProjectStatus} className="space-y-2">
            <input type="hidden" name="id" value={p.id} />
            <select name="to" className="input">{next.map((n) => <option key={n} value={n}>{PROJECT_STATUS[n]}</option>)}</select>
            <input name="reason" className="input" placeholder="Причина (обязательна для паузы, отмены, закрытия, возврата)" />
            <Submit variant="secondary">Перевести</Submit>
          </ActionForm>
        ) : <p className="text-sm text-muted">Нет доступных переходов.</p>}
        <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <dt className="text-muted">Договор</dt><dd>{date(p.contract_start)} — {date(p.contract_end)}</dd>
          <dt className="text-muted">Начало работ</dt><dd>{date(p.work_start)}</dd>
          <dt className="text-muted">Площадки</dt><dd>{(p.platforms ?? []).join(", ")}</dd>
          <dt className="text-muted">Правок</dt><dd>{p.revisions_allowed ?? "не задано"}</dd>
          <dt className="text-muted">Публикация</dt><dd>{p.requires_publication ? "входит" : "только файлы"}</dd>
          <dt className="text-muted">Метод сторис</dt><dd>{p.stories_method === "four_each_calendar_day" ? "4 в день" : p.stories_method === "fixed_per_period" ? "фикс. за период" : "—"}</dd>
        </dl>
        {p.wishes && <p className="mt-3 rounded-xl bg-surface-2 p-3 text-sm">{p.wishes}</p>}
      </Card>

      <Card title="Команда">
        <ActionForm action={A.updateTeam} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="id" value={p.id} />
          <Field label="Администратор *"><PeopleSelect name="admin_id" people={people} defaultValue={p.admin_id} required /></Field>
          <Field label="Менеджер"><PeopleSelect name="manager_id" people={people} defaultValue={p.manager_id} /></Field>
          <Field label="Директор по планированию"><PeopleSelect name="planning_director_id" people={people} defaultValue={p.planning_director_id} /></Field>
          <Field label="Креативный директор"><PeopleSelect name="creative_director_id" people={people} defaultValue={p.creative_director_id} /></Field>
          <Field label="Добавить участника" className="sm:col-span-2"><PeopleSelect name="add_member" people={people} empty="—" /></Field>
          {canManage && <div className="sm:col-span-2"><Submit variant="secondary">Сохранить команду</Submit></div>}
        </ActionForm>
        <ul className="mt-3 flex flex-wrap gap-2 text-sm">
          {members.map((m) => (
            <li key={m.user_id + m.role} className="flex items-center gap-1 rounded-full bg-surface-2 px-3 py-1">
              {nameOf(people, m.user_id)} <span className="text-xs text-muted">({m.role})</span>
              {canManage && (
                <ActionForm action={A.removeMember}>
                  <input type="hidden" name="id" value={p.id} /><input type="hidden" name="user_id" value={m.user_id} /><input type="hidden" name="role" value={m.role} />
                  <button className="ml-1 text-xs text-bad" aria-label="Убрать">×</button>
                </ActionForm>
              )}
            </li>
          ))}
        </ul>
      </Card>

      {contract && (
        <Card title="Договорный объём (на период)">
          <div className="mb-2 text-sm">Стоимость: <b>{money(contract.price_minor, contract.currency)}</b>{contract.tariff_snapshot?.tariffs?.name ? ` · тариф «${contract.tariff_snapshot.tariffs.name}» v${contract.tariff_snapshot.version}` : " · индивидуально"}</div>
          <div className="flex flex-wrap gap-2">{Object.entries(comp).map(([k, v]) => <Badge key={k}>{CONTENT_KIND[k]}: {v}</Badge>)}</div>
          {contract.extra_services && <p className="mt-2 text-sm">Допуслуги: {contract.extra_services}</p>}
          {canManage && (
            <details className="mt-3 rounded-xl bg-surface-2 p-3">
              <summary className="cursor-pointer text-sm font-semibold">Поправка к договору</summary>
              <ActionForm action={A.amendContract} className="mt-3 grid gap-2 sm:grid-cols-3">
                <input type="hidden" name="id" value={p.id} />
                {["video", "story", "post", "carousel", "ad_creative", "shoot"].map((k) => (
                  <Field key={k} label={CONTENT_KIND[k]}><input name={`c_${k}`} type="number" min={0} defaultValue={comp[k] ?? ""} className="input" /></Field>
                ))}
                <Field label="Стоимость"><input name="price" inputMode="decimal" defaultValue={minorToInput(contract.price_minor)} className="input" /></Field>
                <Field label="Применить к периоду" className="sm:col-span-2"><PeriodSelect projectId={p.id} /></Field>
                <Field label="Основание *" className="sm:col-span-3"><input name="reason" required className="input" /></Field>
                <div className="sm:col-span-3"><Submit variant="secondary">Сохранить поправку</Submit></div>
              </ActionForm>
            </details>
          )}
        </Card>
      )}
    </div>
  );
}

async function PeriodSelect({ projectId }: { projectId: string }) {
  const supabase = await createClient();
  const { data } = await supabase.from("project_periods").select("id,seq,label").eq("project_id", projectId).eq("status", "open");
  return (
    <select name="period_id" className="input">
      <option value="">Только будущие периоды</option>
      {(data ?? []).map((x: { id: string; seq: number; label: string }) => <option key={x.id} value={x.id}>№{x.seq} · {x.label}</option>)}
    </select>
  );
}

/* ───────────── План-факт ───────────── */
async function PlanTab({ projectId, period, periods, canManage, contract }: { projectId: string; period?: Period; periods: Period[]; canManage: boolean; contract: Record<string, any> | null }) {
  const supabase = await createClient();
  if (!period) {
    return (
      <Empty title="Периодов ещё нет" text="Первый расчётный период создаётся при допуске проекта к производству."
        action={canManage ? (
          <ActionForm action={A.createPeriodAction} className="flex gap-2"><input type="hidden" name="id" value={projectId} /><input type="date" name="start" required defaultValue={todayLocal()} className="input" /><Submit>Создать период</Submit></ActionForm>
        ) : null} />
    );
  }
  const { data } = await supabase.from("v_period_progress").select("*").eq("period_id", period.id);
  const rows = (data ?? []) as Progress_[];
  const days = Math.round((new Date(period.ends_on).getTime() - new Date(period.starts_on).getTime()) / 86400_000) + 1;
  const stories = rows.find((r) => r.kind === "story");
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <Stat label="Период" value={`№${period.seq}`} hint={`${period.label} · ${days} дн.`} />
        <Stat label="План" value={period.plan_status === "approved" ? "Утверждён" : period.plan_status === "draft" ? "Черновик" : "Не сформирован"} tone={period.plan_status === "approved" ? "good" : "warn"} />
        <Stat label="Осталось подготовить" value={rows.reduce((a, r) => a + Number(r.left_to_prepare), 0)} />
        <Stat label="Просрочено" value={rows.reduce((a, r) => a + Number(r.overdue), 0)} tone={rows.some((r) => r.overdue > 0) ? "bad" : "good"} />
      </div>
      {canManage && period.status === "open" && (
        <Card title="Формирование плана">
          <div className="flex flex-wrap gap-2">
            {period.plan_status !== "approved" && (
              <ActionForm action={A.generatePlan}><input type="hidden" name="id" value={projectId} /><input type="hidden" name="period_id" value={period.id} /><Submit variant="secondary">Сформировать план на период</Submit></ActionForm>
            )}
            {period.plan_status === "draft" && (
              <ActionForm action={A.approvePlan}><input type="hidden" name="id" value={projectId} /><input type="hidden" name="period_id" value={period.id} /><Submit>Утвердить план</Submit></ActionForm>
            )}
            <ActionForm action={A.closePeriod} confirm="Закрыть период? Долг по работам сохранится.">
              <input type="hidden" name="id" value={projectId} /><input type="hidden" name="period_id" value={period.id} />
              <label className="mr-2 inline-flex items-center gap-1 text-sm"><input type="checkbox" name="next" defaultChecked /> создать следующий</label>
              <Submit variant="ghost">Закрыть период</Submit>
            </ActionForm>
          </div>
          <p className="mt-2 text-xs text-muted">План — черновик: система распределяет материалы по рабочим дням и сторис по дням периода. Повторный запуск не создаёт дублей. Ёмкость команды в часах показывается только при заданных нормативах.</p>
          {stories && contract?.composition?.story && (
            <p className="mt-2 text-xs text-muted">Сторис: план {stories.planned} ({period.label}). {days * 4 !== Number(contract.composition.story) ? `При методе «4 в день» было бы ${days * 4} — отличие ${days * 4 - Number(contract.composition.story)}.` : ""}</p>
          )}
        </Card>
      )}
      <Card title="План-факт по видам" className="p-0 md:p-0">
        {rows.length === 0 ? <div className="p-5 text-sm text-muted">В договоре нет объёмов для этого периода.</div> : (
          <div className="scroll-x">
            <table className="tbl">
              <thead><tr><th>Вид</th><th>План</th><th>В работе</th><th>Монтаж/оформление</th><th>Подготовлено</th><th>Опубликовано</th><th>Проверено</th><th>Осталось подгот.</th><th>Осталось опубл.</th><th>Сверх плана</th><th className="w-40">Прогресс</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.kind}>
                    <td className="font-semibold">{CONTENT_KIND[r.kind]}</td>
                    <td>{r.planned}</td><td>{r.in_work}</td><td>{r.in_post}</td><td>{r.prepared}</td><td>{r.published}</td><td>{r.verified}</td>
                    <td className={r.left_to_prepare > 0 ? "text-warn" : "text-good"}>{r.left_to_prepare}</td><td>{r.left_to_publish}</td><td>{r.overflow}</td>
                    <td><Progress value={Number(r.prepared)} max={r.planned} tone={r.overdue > 0 ? "bad" : "good"} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {periods.length > 1 && <p className="text-xs text-muted">Предыдущие периоды хранятся вместе с долгами по работам; закрытие месяца не закрывает договор.</p>}
    </div>
  );
}

/* ───────────── Контент ───────────── */
async function ContentTab({ projectId, period, people, canManage }: { projectId: string; period?: Period; people: Awaited<ReturnType<typeof activePeople>>; canManage: boolean }) {
  if (!period) return <Empty title="Нет периода" text="Сначала допустите проект и создайте период." />;
  const supabase = await createClient();
  const { data } = await supabase.from("content_items").select("id,title,kind,status,assignee_id,reviewer_id,prep_due,publish_due,brief,placements(id)").eq("period_id", period.id).order("publish_due", { nullsFirst: false });
  const rows = (data ?? []) as unknown as { id: string; title: string; kind: string; status: string; assignee_id: string | null; reviewer_id: string | null; prep_due: string | null; publish_due: string | null; brief: string | null; placements: { id: string }[] }[];
  return (
    <div className="space-y-4">
      {canManage && period.status === "open" && (
        <Card title="Добавить материал">
          <ActionForm action={A.addContent} reset className="grid gap-2 sm:grid-cols-4">
            <input type="hidden" name="id" value={projectId} /><input type="hidden" name="period_id" value={period.id} />
            <select name="kind" className="input">{["video", "post", "carousel", "ad_creative", "other"].map((k) => <option key={k} value={k}>{CONTENT_KIND[k]}</option>)}</select>
            <input name="title" placeholder="Тема / название" className="input" />
            <input name="publish_due" type="date" className="input" />
            <Submit variant="secondary">Добавить</Submit>
          </ActionForm>
          <p className="mt-2 text-xs text-muted">Материал сверх договорного объёма учитывается как перевыполнение, а не уменьшает обязательство.</p>
        </Card>
      )}
      {rows.length === 0 ? <Empty title="Материалов нет" text="Сформируйте план на вкладке «План-факт»." /> : (
        <Card className="p-0 md:p-0">
          <div className="scroll-x">
            <table className="tbl">
              <thead><tr><th>Материал</th><th>Статус</th><th>Исполнитель</th><th>Проверяющий</th><th>Подготовка</th><th>Публикация</th><th>Размещений</th></tr></thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id}>
                    <td><Link href={`/app/content/${c.id}`} className="font-semibold hover:underline">{CONTENT_KIND[c.kind]}: {c.title}</Link>{!c.brief && <div className="text-xs text-warn">нет ТЗ</div>}</td>
                    <td><Badge status={c.status}>{CONTENT_STATUS[c.status]}</Badge></td>
                    <td className="text-sm">{c.assignee_id ? nameOf(people, c.assignee_id) : <span className="text-warn">не назначен</span>}</td>
                    <td className="text-sm">{nameOf(people, c.reviewer_id)}</td>
                    <td className="whitespace-nowrap text-xs">{dateTime(c.prep_due)}{!["done", "published", "cancelled"].includes(c.status) && overdueText(c.prep_due) && <div className="text-bad">{overdueText(c.prep_due)}</div>}</td>
                    <td className="whitespace-nowrap text-xs">{dateTime(c.publish_due)}</td>
                    <td className="text-sm">{c.placements.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

/* ───────────── Сторис ───────────── */
async function StoriesTab({ projectId, period, people }: { projectId: string; period?: Period; people: Awaited<ReturnType<typeof activePeople>> }) {
  if (!period) return <Empty title="Нет периода" />;
  const supabase = await createClient();
  const { data } = await supabase.from("story_daily_plans").select("*").eq("period_id", period.id).order("day");
  const rows = (data ?? []) as { id: string; day: string; planned: number; actual: number; assignee_id: string | null; confirmed_at: string | null; confirmed_by: string | null; shortfall_reason: string | null }[];
  if (!rows.length) return <Empty title="Сторис не запланированы" text="Если сторис есть в договоре — сформируйте план периода." />;
  const totalP = rows.reduce((a, r) => a + r.planned, 0);
  const totalA = rows.reduce((a, r) => a + r.actual, 0);
  const today = todayLocal();
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <Stat label="План кадров" value={totalP} />
        <Stat label="Факт" value={totalA} />
        <Stat label="Осталось" value={Math.max(0, totalP - totalA)} tone={totalA >= totalP ? "good" : "warn"} />
      </div>
      <Card className="p-0 md:p-0">
        <div className="scroll-x">
          <table className="tbl">
            <thead><tr><th>День</th><th>План</th><th>Факт</th><th>Статус</th><th>Сторисмейкер</th><th>Причина недостачи</th><th /></tr></thead>
            <tbody>
              {rows.map((r) => {
                const st = r.actual >= r.planned ? "Выполнено" : r.actual > 0 ? `Частично, осталось ${r.planned - r.actual}` : r.day < today ? "Не выполнено" : "Запланировано";
                return (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap">{date(r.day)}{r.day === today && <Badge tone="info">сегодня</Badge>}</td>
                    <td colSpan={6}>
                      <ActionForm action={A.saveStoryDay} className="grid items-center gap-2 sm:grid-cols-[60px_70px_150px_170px_1fr_auto]">
                        <input type="hidden" name="id" value={projectId} /><input type="hidden" name="story_id" value={r.id} /><input type="hidden" name="planned" value={r.planned} />
                        <span>{r.planned}</span>
                        <input name="actual" type="number" min={0} defaultValue={r.actual} className="input" aria-label="Факт" />
                        <span className="text-xs"><Badge tone={r.actual >= r.planned ? "good" : r.actual > 0 ? "warn" : r.day < today ? "bad" : "neutral"}>{st}</Badge>{r.confirmed_at && <div className="mt-1 text-muted">✓ {nameOf(people, r.confirmed_by)}</div>}</span>
                        <PeopleSelect name="assignee_id" people={people} defaultValue={r.assignee_id} />
                        <input name="reason" defaultValue={r.shortfall_reason ?? ""} placeholder="Причина" className="input" />
                        <span className="flex items-center gap-2 text-xs"><label className="flex items-center gap-1"><input type="checkbox" name="confirm" defaultChecked={!!r.confirmed_at} /> подтв.</label><Submit variant="secondary" className="min-h-[34px] px-3 text-xs">OK</Submit></span>
                      </ActionForm>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* ───────────── Съёмки проекта ───────────── */
async function ShootsTab({ projectId }: { projectId: string }) {
  const supabase = await createClient();
  const { data } = await supabase.from("shoots").select("id,title,starts_at,ends_at,location,status,shoot_participants(user_id,role,response)").eq("project_id", projectId).order("starts_at", { ascending: false });
  const rows = (data ?? []) as unknown as { id: string; title: string; starts_at: string; ends_at: string; location: string | null; status: string; shoot_participants: { role: string; response: string }[] }[];
  return (
    <div className="space-y-3">
      <Link href={`/app/shoots/new?project=${projectId}`} className="inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-ink">+ Запланировать съёмку</Link>
      {rows.length === 0 ? <Empty title="Съёмок нет" /> : rows.map((sh) => (
        <Link key={sh.id} href={`/app/shoots/${sh.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-surface p-4 text-sm hover:border-primary">
          <span className="font-semibold">{sh.title}</span>
          <span className="text-muted">{dateTime(sh.starts_at)} · {sh.location ?? "место не указано"}</span>
          <span>{sh.shoot_participants.length === 0 ? <Badge tone="bad">Команда не назначена</Badge> : <Badge tone={sh.shoot_participants.every((x) => x.response === "accepted") ? "good" : "warn"}>{sh.shoot_participants.filter((x) => x.response === "accepted").length}/{sh.shoot_participants.length} подтвердили</Badge>} <Badge status={sh.status}>{sh.status === "planned" ? "Запланирована" : sh.status === "done" ? "Проведена" : "Отменена"}</Badge></span>
        </Link>
      ))}
    </div>
  );
}

/* ───────────── Финансы проекта ───────────── */
async function FinanceTab({ projectId, periods, canConfirm, canCreate, canInvoice, me, isOwner }: { projectId: string; periods: Period[]; canConfirm: boolean; canCreate: boolean; canInvoice: boolean; me: string; isOwner: boolean }) {
  const supabase = await createClient();
  const [{ data: inv }, { data: pays }, accs, people, { data: paid }] = await Promise.all([
    supabase.from("v_invoice_status").select("*").eq("project_id", projectId).order("due_on"),
    supabase.from("payments").select("*").eq("project_id", projectId).order("created_at", { ascending: false }),
    loadAccounts(),
    activePeople(),
    supabase.rpc("project_paid_status", { p_project: projectId }),
  ]);
  const ps = (paid ?? {}) as { price?: number; paid?: number; invoiced?: number; pending?: number };
  const invoices = (inv ?? []) as { id: string; number: number; title: string; amount_minor: number; paid_minor: number; due_on: string; pay_state: string; status: string }[];
  const payments = (pays ?? []) as { id: string; invoice_id: string | null; kind: string; amount_minor: number; paid_on: string; method: string | null; status: string; created_by: string; confirmed_by: string | null; note: string | null; reject_reason: string | null }[];
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <Stat label="Цена договора (период)" value={money(ps.price ?? 0)} />
        <Stat label="Выставлено" value={money(ps.invoiced ?? 0)} />
        <Stat label="Оплачено (подтверждено)" value={money(ps.paid ?? 0)} tone="good" />
        <Stat label="Остаток по счетам" value={money(Math.max(0, (ps.invoiced ?? 0) - (ps.paid ?? 0)))} tone={(ps.invoiced ?? 0) > (ps.paid ?? 0) ? "warn" : "good"} />
      </div>
      <Card title="Счета (график оплат)">
        {invoices.length === 0 ? <p className="text-sm text-muted">Счетов нет.</p> : (
          <div className="scroll-x"><table className="tbl">
            <thead><tr><th>№</th><th>Назначение</th><th>Сумма</th><th>Оплачено</th><th>Остаток</th><th>Срок</th><th>Статус</th>{canInvoice && <th />}</tr></thead>
            <tbody>{invoices.map((i) => (
              <tr key={i.id}>
                <td>{i.number}</td><td>{i.title}</td><td>{money(i.amount_minor)}</td><td>{money(i.paid_minor)}</td><td>{money(Math.max(0, i.amount_minor - i.paid_minor))}</td><td>{date(i.due_on)}</td>
                <td><Badge status={i.pay_state}>{PAY_STATE[i.pay_state]}</Badge></td>
                {canInvoice && <td>{i.status !== "void" && i.paid_minor === 0 && (
                  <ActionForm action={A.voidInvoice} className="flex gap-1"><input type="hidden" name="id" value={projectId} /><input type="hidden" name="invoice_id" value={i.id} /><input name="reason" placeholder="причина" className="input min-h-[32px] w-28 py-1 text-xs" /><Submit variant="ghost" className="min-h-[32px] px-2 text-xs">Аннулировать</Submit></ActionForm>
                )}</td>}
              </tr>
            ))}</tbody>
          </table></div>
        )}
        {canInvoice && (
          <ActionForm action={A.createInvoice} reset className="mt-4 grid gap-2 border-t border-line pt-4 sm:grid-cols-5">
            <input type="hidden" name="id" value={projectId} />
            <input name="title" placeholder="Назначение" className="input" />
            <input name="amount" placeholder="Сумма" inputMode="decimal" required className="input" />
            <input name="due_on" type="date" required className="input" />
            <select name="period_id" className="input"><option value="">Без периода</option>{periods.map((x) => <option key={x.id} value={x.id}>№{x.seq}</option>)}</select>
            <Submit variant="secondary">Выставить счёт</Submit>
          </ActionForm>
        )}
      </Card>
      <Card title="Поступления и возвраты">
        {canCreate && (
          <ActionForm action={A.addPayment} reset className="mb-4 grid gap-2 sm:grid-cols-4">
            <input type="hidden" name="id" value={projectId} />
            <select name="invoice_id" className="input"><option value="">Без счёта</option>{invoices.filter((i) => i.status !== "void").map((i) => <option key={i.id} value={i.id}>Счёт №{i.number} · {i.title}</option>)}</select>
            <select name="kind" className="input"><option value="payment">Поступление</option><option value="refund">Возврат клиенту</option></select>
            <input name="amount" placeholder="Сумма" inputMode="decimal" required className="input" />
            <input name="paid_on" type="date" defaultValue={todayLocal()} className="input" />
            <select name="account_id" className="input"><option value="">Счёт/касса</option>{accs.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
            <input name="method" placeholder="Способ (наличные, перевод…)" className="input" />
            <input name="note" placeholder="Комментарий / документ" className="input" />
            <Submit variant="secondary">Внести</Submit>
          </ActionForm>
        )}
        {payments.length === 0 ? <p className="text-sm text-muted">Поступлений нет.</p> : (
          <div className="scroll-x"><table className="tbl">
            <thead><tr><th>Дата</th><th>Тип</th><th>Сумма</th><th>Внёс</th><th>Статус</th><th>Подтвердил</th><th /></tr></thead>
            <tbody>{payments.map((pm) => (
              <tr key={pm.id}>
                <td className="whitespace-nowrap">{date(pm.paid_on)}</td><td>{pm.kind === "refund" ? "Возврат" : "Поступление"}</td><td>{money(pm.amount_minor)}</td>
                <td className="text-sm">{nameOf(people, pm.created_by)}</td>
                <td><Badge status={pm.status}>{PAYMENT_STATUS[pm.status]}</Badge>{pm.reject_reason && <div className="text-xs text-bad">{pm.reject_reason}</div>}</td>
                <td className="text-sm">{nameOf(people, pm.confirmed_by)}</td>
                <td>{canConfirm && pm.status === "pending" && (pm.created_by !== me || isOwner ? (
                  <div className="flex flex-col gap-1">
                    <ActionForm action={A.confirmPayment} className="flex gap-1"><input type="hidden" name="id" value={projectId} /><input type="hidden" name="payment_id" value={pm.id} />
                      <select name="account_id" className="input min-h-[32px] py-1 text-xs">{accs.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
                      <Submit className="min-h-[32px] px-2 text-xs">Подтвердить</Submit></ActionForm>
                    <ActionForm action={A.rejectPayment} className="flex gap-1"><input type="hidden" name="id" value={projectId} /><input type="hidden" name="payment_id" value={pm.id} /><input name="reason" placeholder="причина" className="input min-h-[32px] py-1 text-xs" /><Submit variant="ghost" className="min-h-[32px] px-2 text-xs">Отклонить</Submit></ActionForm>
                  </div>
                ) : <span className="text-xs text-muted">нужен другой подтверждающий</span>)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </Card>
    </div>
  );
}

/* ───────────── Ежедневные проверки ───────────── */
async function ChecksTab({ projectId, people }: { projectId: string; people: Awaited<ReturnType<typeof activePeople>> }) {
  const supabase = await createClient();
  const { data } = await supabase.from("project_admin_checks").select("*").eq("project_id", projectId).order("day", { ascending: false }).limit(30);
  const rows = (data ?? []) as { id: string; day: string; admin_id: string; due_at: string; completed_at: string | null; summary: string | null; delays: string | null; escalated: boolean }[];
  return rows.length === 0 ? <Empty title="Проверок пока нет" text="Ежедневная проверка создаётся автоматически для проектов в работе." action={<Link className="text-primary" href="/app/checks">Мои проверки →</Link>} /> : (
    <Card className="p-0 md:p-0"><div className="scroll-x"><table className="tbl">
      <thead><tr><th>День</th><th>Администратор</th><th>Статус</th><th>Итог</th><th>Задержки</th></tr></thead>
      <tbody>{rows.map((c) => (
        <tr key={c.id}>
          <td className="whitespace-nowrap"><Link className="text-primary" href={`/app/checks/${c.id}`}>{date(c.day)}</Link></td>
          <td className="text-sm">{nameOf(people, c.admin_id)}</td>
          <td>{c.completed_at ? <Badge tone={new Date(c.completed_at) > new Date(c.due_at) ? "warn" : "good"}>{new Date(c.completed_at) > new Date(c.due_at) ? "Сдана с опозданием" : "Проведена"}</Badge> : new Date(c.due_at) < new Date() ? <Badge tone="bad">Просрочена</Badge> : <Badge>Ожидает</Badge>}{c.escalated && <Badge tone="bad">эскалация</Badge>}</td>
          <td className="text-sm">{c.summary ?? "—"}</td><td className="text-sm">{c.delays ?? "—"}</td>
        </tr>
      ))}</tbody>
    </table></div></Card>
  );
}

/* ───────────── Доступы соцсетей (Vault) ───────────── */
async function AccessTab({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  return <ProjectAccess projectId={projectId} canManage={canManage} />;
}

/* ───────────── История ───────────── */
async function HistoryTab({ projectId, people }: { projectId: string; people: Awaited<ReturnType<typeof activePeople>> }) {
  const supabase = await createClient();
  const [{ data: st }, { data: am }] = await Promise.all([
    supabase.from("project_status_history").select("*").eq("project_id", projectId).order("created_at", { ascending: false }),
    supabase.from("project_amendments").select("*").eq("project_id", projectId).order("created_at", { ascending: false }),
  ]);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Статусы">
        <ol className="space-y-2 text-sm">{(st ?? []).map((h: { id: number; from_status: string | null; to_status: string; reason: string | null; actor_id: string | null; created_at: string }) => (
          <li key={h.id} className="border-l-2 border-line pl-3"><b>{h.from_status ? PROJECT_STATUS[h.from_status] : "—"} → {PROJECT_STATUS[h.to_status]}</b>{h.reason && <div>{h.reason}</div>}<div className="text-xs text-muted">{dateTime(h.created_at)} · {nameOf(people, h.actor_id)}</div></li>
        ))}</ol>
        {(st ?? []).length === 0 && <p className="text-sm text-muted">Изменений ещё не было.</p>}
      </Card>
      <Card title="Поправки к договору">
        <ol className="space-y-2 text-sm">{(am ?? []).map((a: { id: string; reason: string; after: { composition: Record<string, number> }; created_by: string; created_at: string }) => (
          <li key={a.id} className="border-l-2 border-line pl-3"><b>{a.reason}</b><div className="text-muted">{Object.entries(a.after?.composition ?? {}).map(([k, v]) => `${CONTENT_KIND[k]}: ${v}`).join(" · ")}</div><div className="text-xs text-muted">{dateTime(a.created_at)} · {nameOf(people, a.created_by)}</div></li>
        ))}</ol>
        {(am ?? []).length === 0 && <p className="text-sm text-muted">Поправок нет.</p>}
      </Card>
    </div>
  );
}
