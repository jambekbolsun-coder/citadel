import { notFound } from "next/navigation";
import { requireActive } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Avatar, Badge, Card, Field, LoadError, Notice, PageHeader } from "@/components/ui";
import { ActionForm, Submit } from "@/components/action-form";
import { PeopleSelect } from "@/components/people-select";
import { activePeople, nameOf } from "@/lib/data";
import { PAY_TYPE } from "@/lib/labels";
import { date, money } from "@/lib/format";
import { SalaryFields } from "../salary-fields";
import { addSalaryTerms, setEmployeeStatus, setPerms, setRoles, updateEmployee } from "../actions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function Employee({ params }: PageProps<"/app/team/[id]">) {
  const { id } = await params;
  const s = await requireActive(["employees.view", "employees.invite"]);
  const supabase = await createClient();
  if (!UUID.test(id)) notFound();
  // У profiles и departments две связи (отдел сотрудника и руководитель отдела) — указываем внешний ключ явно,
  // иначе PostgREST отвечает PGRST201, а страница показывала ложный 404.
  const { data: p, error } = await supabase.from("profiles").select("*, departments!profiles_department_id_fkey(name)").eq("id", id).maybeSingle();
  if (error) {
    console.error("team/[id]: profile load failed", error.code);
    return <><PageHeader back="/app/team" title="Сотрудник" /><LoadError retry={`/app/team/${id}`} back="/app/team" backLabel="К сотрудникам" /></>;
  }
  if (!p) {
    // Без employees.view RLS скрывает неактивных — это отказ в правах, а не отсутствие записи
    if (!s.can("employees.view")) return <><PageHeader back="/app/team" title="Сотрудник" /><LoadError kind="denied" text="Карточки сотрудников, ожидающих утверждения, видят те, у кого есть право просмотра сотрудников." back="/app/team" backLabel="К сотрудникам" /></>;
    notFound();
  }
  const [{ data: ur }, { data: up }, { data: roles }, { data: perms }, { data: deps }, people, { data: terms }, { data: projects }] = await Promise.all([
    supabase.from("user_roles").select("role_code").eq("user_id", id),
    supabase.from("user_permissions").select("permission_code").eq("user_id", id),
    supabase.from("roles").select("code,name").order("sort"),
    supabase.from("permissions").select("code,name,module,sensitive").order("module"),
    supabase.from("departments").select("id,name").order("name"),
    activePeople(),
    s.can("payroll.view") ? supabase.from("salary_terms").select("*").eq("user_id", id).order("effective_from", { ascending: false }) : Promise.resolve({ data: [] }),
    supabase.from("project_members").select("role,projects(id,name,status)").eq("user_id", id),
  ]);
  const myRoles = new Set((ur ?? []).map((r: { role_code: string }) => r.role_code));
  const myPerms = new Set((up ?? []).map((r: { permission_code: string }) => r.permission_code));
  const isOwnerTarget = myRoles.has("owner");
  const STATUS: Record<string, string> = { active: "Активен", pending_approval: "Ждёт утверждения", blocked: "Заблокирован" };
  return (
    <>
      <PageHeader back="/app/team" title={<span className="flex items-center gap-3"><Avatar name={p.full_name} url={p.avatar_url} size={40} />{p.full_name || p.email}</span>}
        subtitle={[p.job_title, p.departments?.name, p.email, p.phone].filter(Boolean).join(" · ")} actions={<Badge status={p.status === "pending_approval" ? "pending" : p.status}>{STATUS[p.status]}</Badge>} />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          {s.can("employees.manage") && !isOwnerTarget && (
            <Card title="Доступ">
              {p.status === "pending_approval" && <div className="mb-3"><Notice tone="warn">Сотрудник принял приглашение. Проверьте роли и права ниже, затем откройте доступ.</Notice></div>}
              <div className="flex flex-wrap gap-2">
                {p.status !== "active" && <ActionForm action={setEmployeeStatus}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value="active" /><Submit>Утвердить и открыть доступ</Submit></ActionForm>}
                {p.status !== "blocked" && <ActionForm action={setEmployeeStatus} confirm="Заблокировать сотрудника? Он потеряет доступ к данным компании."><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value="blocked" /><Submit variant="danger">Заблокировать</Submit></ActionForm>}
              </div>
            </Card>
          )}
          <Card title="Профиль">
            <p className="mb-3 whitespace-pre-wrap text-sm">{p.about ?? "Раздел «О себе» не заполнен."}</p>
            {s.can("employees.manage") ? (
              <ActionForm action={updateEmployee} className="grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="id" value={id} />
                <Field label="Должность"><input name="job_title" defaultValue={p.job_title ?? ""} className="input" /></Field>
                <Field label="Отдел"><select name="department_id" defaultValue={p.department_id ?? ""} className="input"><option value="">—</option>{(deps ?? []).map((d: { id: string; name: string }) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
                <Field label="Руководитель"><PeopleSelect name="manager_id" people={people.filter((x) => x.id !== id)} defaultValue={p.manager_id} /></Field>
                <Field label="Дата начала"><input name="start_date" type="date" defaultValue={p.start_date ?? ""} className="input" /></Field>
                <Field label="Утверждённые обязанности" className="sm:col-span-2"><textarea name="responsibilities" defaultValue={p.responsibilities ?? ""} className="input" /></Field>
                <div className="sm:col-span-2"><Submit variant="secondary">Сохранить</Submit></div>
              </ActionForm>
            ) : <p className="whitespace-pre-wrap text-sm">{p.responsibilities}</p>}
          </Card>
          <Card title="Проекты">
            <ul className="space-y-1 text-sm">{(projects ?? []).map((m: { role: string; projects: { id: string; name: string } | { id: string; name: string }[] | null }, i: number) => {
              const pr = Array.isArray(m.projects) ? m.projects[0] : m.projects;
              return pr ? <li key={i}>{pr.name} <span className="text-muted">({m.role})</span></li> : null;
            })}</ul>
            {(projects ?? []).length === 0 && <p className="text-sm text-muted">Нет проектов.</p>}
          </Card>
          {s.can("payroll.view") && (
            <Card title="Условия зарплаты (история)">
              {(terms ?? []).length === 0 ? <p className="text-sm text-muted">Условия не заданы.</p> : (
                <ul className="space-y-2 text-sm">{(terms ?? []).map((t: { id: string; pay_type: string; base_minor: number; piece_rules: { kind: string; rate_minor: number }[]; pay_days: number[]; effective_from: string; contract_end: string | null; created_by: string }) => (
                  <li key={t.id} className="rounded-xl bg-surface-2 p-3"><b>с {date(t.effective_from)}</b> · {PAY_TYPE[t.pay_type]} · оклад {money(t.base_minor)} · выплаты {t.pay_days.join(" и ")}-го{t.piece_rules.length ? ` · сдельно: ${t.piece_rules.map((r) => `${r.kind} ${money(r.rate_minor)}`).join(", ")}` : ""}{t.contract_end ? ` · до ${date(t.contract_end)}` : ""}<div className="text-xs text-muted">внёс {nameOf(people, t.created_by)}</div></li>
                ))}</ul>
              )}
              {s.can("payroll.manage") && (
                <ActionForm action={addSalaryTerms} className="mt-4 space-y-3 border-t border-line pt-4">
                  <input type="hidden" name="id" value={id} />
                  <SalaryFields />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Вступает в силу *"><input name="effective_from" type="date" required className="input" /></Field>
                    <Field label="Окончание договора"><input name="contract_end" type="date" className="input" /></Field>
                    <Field label="Бонусы / удержания (правила)" className="sm:col-span-2"><input name="bonus_rules" className="input" /></Field>
                  </div>
                  <Submit variant="secondary">Добавить новые условия</Submit>
                </ActionForm>
              )}
            </Card>
          )}
        </div>
        <div className="space-y-4">
          {s.can("roles.manage") && !isOwnerTarget ? (
            <>
              <Card title="Роли">
                <ActionForm action={setRoles} className="space-y-2">
                  <input type="hidden" name="id" value={id} />
                  <div className="grid gap-1 text-sm sm:grid-cols-2">
                    {(roles ?? []).filter((r: { code: string }) => r.code !== "owner").map((r: { code: string; name: string }) => <label key={r.code} className="flex items-center gap-2"><input type="checkbox" name="roles" value={r.code} defaultChecked={myRoles.has(r.code)} /> {r.name}</label>)}
                  </div>
                  <Submit variant="secondary">Сохранить роли</Submit>
                </ActionForm>
              </Card>
              <Card title="Индивидуальные права (сверх ролей)">
                <ActionForm action={setPerms} className="space-y-2">
                  <input type="hidden" name="id" value={id} />
                  <div className="max-h-[420px] space-y-1 overflow-y-auto text-sm">
                    {(perms ?? []).map((pm: { code: string; name: string; module: string; sensitive: boolean }) => (
                      <label key={pm.code} className="flex items-center gap-2"><input type="checkbox" name="perms" value={pm.code} defaultChecked={myPerms.has(pm.code)} /> <span className="text-muted">{pm.module}:</span> {pm.name} {pm.sensitive && <Badge tone="warn">чувств.</Badge>}</label>
                    ))}
                  </div>
                  <Submit variant="secondary">Сохранить права</Submit>
                </ActionForm>
              </Card>
            </>
          ) : (
            <Card title="Роли"><div className="flex flex-wrap gap-1">{[...myRoles].map((r) => <Badge key={r}>{(roles ?? []).find((x: { code: string }) => x.code === r)?.name ?? r}</Badge>)}</div>{isOwnerTarget && <p className="mt-2 text-xs text-muted">Роль владельца защищена и меняется отдельной процедурой.</p>}</Card>
          )}
        </div>
      </div>
    </>
  );
}
