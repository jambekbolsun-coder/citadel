import Link from "next/link";
import { requireActive } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Avatar, Badge, Card, Field, PageHeader, Tabs } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { PeopleSelect } from "@/components/people-select";
import { activePeople } from "@/lib/data";
import { dateTime } from "@/lib/format";
import { InviteActionForm, Submit } from "./invite-form";
import { SalaryFields } from "./salary-fields";
import { createDepartment, createInvite, reissueInvite, revokeInvite } from "./actions";

export const metadata = { title: "Сотрудники" };
const STATUS: Record<string, string> = { active: "Активен", pending_approval: "Ждёт утверждения", blocked: "Заблокирован" };

export default async function Team({ searchParams }: PageProps<"/app/team">) {
  const sp = await searchParams;
  const s = await requireActive(["employees.view", "employees.invite"]);
  const supabase = await createClient();
  const tab = typeof sp.tab === "string" ? sp.tab : "people";
  const status = typeof sp.status === "string" ? sp.status : "";
  let q = supabase.from("profiles").select("id,full_name,email,job_title,status,avatar_url,departments(name),user_roles!user_roles_user_id_fkey(role_code)").order("full_name");
  if (status) q = q.eq("status", status);
  const [{ data: profiles }, { data: invites }, { data: roles }, { data: deps }, people] = await Promise.all([
    q,
    s.can("employees.invite") ? supabase.from("employee_invites").select("id,full_name,email,job_title,status,expires_at,created_at,used_at").order("created_at", { ascending: false }).limit(50) : Promise.resolve({ data: [] }),
    supabase.from("roles").select("code,name").neq("code", "owner").order("sort"),
    supabase.from("departments").select("id,name").is("archived_at", null).order("name"),
    activePeople(),
  ]);
  const roleName = Object.fromEntries((roles ?? []).map((r: { code: string; name: string }) => [r.code, r.name]));
  roleName.owner = "Владелец";
  const rows = (profiles ?? []) as unknown as { id: string; full_name: string; email: string | null; job_title: string | null; status: string; avatar_url: string | null; departments: { name: string } | null; user_roles: { role_code: string }[] }[];
  return (
    <>
      <PageHeader title="Сотрудники" subtitle="Добавление только через персональные QR-приглашения" />
      <Tabs active={tab} items={[{ key: "people", label: "Команда", href: "/app/team" }, ...(s.can("employees.invite") ? [{ key: "invite", label: "Добавить сотрудника", href: "/app/team?tab=invite" }, { key: "invites", label: "Приглашения", href: "/app/team?tab=invites" }] : []), { key: "deps", label: "Отделы", href: "/app/team?tab=deps" }]} />

      {tab === "people" && (
        <>
          <div className="mb-3 flex gap-2 text-sm">
            {["", "active", "pending_approval", "blocked"].map((st) => <Link key={st} href={`/app/team?status=${st}`} className={`rounded-xl px-3 py-1.5 ${status === st ? "bg-surface font-semibold ring-1 ring-line" : "text-muted"}`}>{st ? STATUS[st] : "Все"}</Link>)}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((p) => (
              <Link key={p.id} href={`/app/team/${p.id}`} className="flex gap-3 rounded-2xl border border-line bg-surface p-4 hover:border-primary">
                <Avatar name={p.full_name} url={p.avatar_url} size={44} />
                <div className="min-w-0">
                  <div className="truncate font-semibold">{p.full_name || p.email}</div>
                  <div className="truncate text-sm text-muted">{p.job_title ?? "—"}{p.departments ? ` · ${p.departments.name}` : ""}</div>
                  <div className="mt-1 flex flex-wrap gap-1"><Badge status={p.status === "pending_approval" ? "pending" : p.status}>{STATUS[p.status]}</Badge>{p.user_roles.slice(0, 2).map((r) => <Badge key={r.role_code}>{roleName[r.role_code] ?? r.role_code}</Badge>)}</div>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}

      {tab === "invite" && s.can("employees.invite") && (
        <Card title="Новый сотрудник">
          <InviteActionForm action={createInvite} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="ФИО *"><input name="full_name" required className="input" /></Field>
              <Field label="Рабочий email *" hint="Нужен для подтверждения"><input name="email" type="email" required className="input" /></Field>
              <Field label="Телефон"><input name="phone" className="input" /></Field>
              <Field label="Отдел"><select name="department_id" className="input"><option value="">—</option>{(deps ?? []).map((d: { id: string; name: string }) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
              <Field label="Должность"><input name="job_title" className="input" /></Field>
              <Field label="Руководитель"><PeopleSelect name="manager_id" people={people} /></Field>
              <Field label="Дата начала работы"><input name="start_date" type="date" className="input" /></Field>
              <Field label="Срок действия ссылки, ч"><input name="ttl" type="number" min={1} max={720} defaultValue={72} className="input" /></Field>
            </div>
            <div>
              <span className="label">Роли (права настраиваются отдельно)</span>
              <div className="grid gap-1 text-sm sm:grid-cols-3">
                {(roles ?? []).map((r: { code: string; name: string }) => <label key={r.code} className="flex items-center gap-2"><input type="checkbox" name="roles" value={r.code} /> {r.name}</label>)}
              </div>
            </div>
            <Field label="Обязанности"><textarea name="responsibilities" className="input" /></Field>
            {s.can("payroll.manage") ? (
              <fieldset className="rounded-xl border border-line p-3"><legend className="px-1 text-sm font-semibold">Условия зарплаты</legend><SalaryFields /></fieldset>
            ) : <p className="text-xs text-muted">Условия зарплаты задаёт пользователь с правом payroll.manage.</p>}
            <Submit>Создать QR-приглашение</Submit>
          </InviteActionForm>
        </Card>
      )}

      {tab === "invites" && (
        <Card className="p-0 md:p-0"><div className="scroll-x"><table className="tbl">
          <thead><tr><th>Сотрудник</th><th>Статус</th><th>Действует до</th><th>Действия</th></tr></thead>
          <tbody>{(invites ?? []).map((i: { id: string; full_name: string; email: string; job_title: string | null; status: string; expires_at: string; used_at: string | null }) => {
            const expired = i.status === "active" && new Date(i.expires_at) < new Date();
            return (
              <tr key={i.id}>
                <td><b>{i.full_name}</b><div className="text-xs text-muted">{i.email} · {i.job_title ?? ""}</div></td>
                <td><Badge status={i.status === "used" ? "done" : i.status === "revoked" || expired ? "cancelled" : "pending"}>{i.status === "used" ? `Использовано ${dateTime(i.used_at)}` : i.status === "revoked" ? "Отозвано" : expired ? "Истекло" : "Активно"}</Badge></td>
                <td className="text-xs">{dateTime(i.expires_at)}</td>
                <td>
                  {i.status !== "used" && (
                    <div className="flex flex-wrap gap-2">
                      <InviteActionForm action={reissueInvite}><input type="hidden" name="id" value={i.id} /><Submit variant="secondary" className="min-h-[32px] px-3 text-xs">Отправить повторно</Submit></InviteActionForm>
                      {i.status === "active" && <ActionForm action={revokeInvite}><input type="hidden" name="id" value={i.id} /><Submit variant="ghost" className="min-h-[32px] px-3 text-xs">Отозвать</Submit></ActionForm>}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}</tbody>
        </table></div></Card>
      )}

      {tab === "deps" && (
        <Card title="Отделы">
          <ul className="mb-3 flex flex-wrap gap-2">{(deps ?? []).map((d: { id: string; name: string }) => <li key={d.id}><Badge>{d.name}</Badge></li>)}</ul>
          {s.can("employees.manage") && <ActionForm action={createDepartment} reset className="flex gap-2"><input name="name" required placeholder="Название отдела" className="input max-w-xs" /><Submit variant="secondary">Добавить</Submit></ActionForm>}
        </Card>
      )}
    </>
  );
}
