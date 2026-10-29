"use server";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { action, check, int, opt, str } from "@/lib/actions";
import { parseMoney } from "@/lib/format";

async function siteOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  return host ? `${h.get("x-forwarded-proto") ?? "https"}://${host}` : process.env.NEXT_PUBLIC_SITE_URL ?? "";
}

function salaryFrom(fd: FormData) {
  const type = opt(fd, "pay_type");
  if (!type) return null;
  const days = str(fd, "pay_days").split(/[,\s]+/).map(Number).filter((n) => n >= 1 && n <= 31);
  const rules: { kind: string; rate_minor: number }[] = [];
  for (const k of ["video", "post", "carousel", "ad_creative"]) {
    const r = parseMoney(fd.get(`rate_${k}`));
    if (r) rules.push({ kind: k, rate_minor: r });
  }
  return { type, base_minor: parseMoney(fd.get("base")) ?? 0, piece_rules: rules, pay_days: days.length ? days.slice(0, 2) : [5], currency: "KGS" };
}

export const createInvite = action(async (fd) => {
  const supabase = await createClient();
  const p = {
    full_name: str(fd, "full_name"),
    email: str(fd, "email"),
    phone: str(fd, "phone"),
    department_id: str(fd, "department_id"),
    job_title: str(fd, "job_title"),
    role_codes: fd.getAll("roles").map(String),
    manager_id: str(fd, "manager_id"),
    responsibilities: str(fd, "responsibilities"),
    start_date: str(fd, "start_date"),
    salary: salaryFrom(fd),
  };
  const r = check(await supabase.rpc("create_invite", { p, p_ttl_hours: int(fd, "ttl") ?? 72 })) as { id: string; token: string };
  revalidatePath("/app/team");
  return { ok: "Приглашение создано. Ссылка показывается один раз — сохраните или отправьте её сейчас.", data: { link: `${await siteOrigin()}/invite/${r.token}` } };
});

export const reissueInvite = action(async (fd) => {
  const supabase = await createClient();
  const r = check(await supabase.rpc("reissue_invite", { p_id: str(fd, "id"), p_ttl_hours: 72 })) as { token: string };
  revalidatePath("/app/team");
  return { ok: "Выпущена новая ссылка; прежняя больше не работает.", data: { link: `${await siteOrigin()}/invite/${r.token}` } };
});

export const revokeInvite = action(async (fd) => {
  const supabase = await createClient();
  check(await supabase.rpc("revoke_invite", { p_id: str(fd, "id") }));
  revalidatePath("/app/team");
  return "Приглашение отозвано";
});

// Права, допустимые переходы, «ровно одна строка», уведомление и задача на отзыв доступов — в RPC employee_set_status
export const setEmployeeStatus = action(async (fd) => {
  const supabase = await createClient();
  const id = str(fd, "id");
  const status = str(fd, "status");
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Некорректный идентификатор сотрудника");
  const r = check(await supabase.rpc("employee_set_status", { p_id: id, p_status: status, p_reason: opt(fd, "reason") })) as { id: string; status: string; changed: boolean };
  if (r?.id !== id || r.status !== status) throw new Error("Сервер не подтвердил изменение статуса — обновите страницу и проверьте ещё раз");
  revalidatePath(`/app/team/${id}`);
  revalidatePath("/app/team");
  if (!r.changed) return status === "active" ? "Доступ уже открыт — повторно ничего не меняли" : "Сотрудник уже заблокирован";
  return status === "active" ? "Доступ открыт. Сотрудник получил уведомление." : "Доступ закрыт, устройства сброшены. Создана задача на отзыв внешних доступов.";
});

export const updateEmployee = action(async (fd) => {
  const supabase = await createClient();
  check(
    await supabase
      .from("profiles")
      .update({ job_title: opt(fd, "job_title"), department_id: opt(fd, "department_id"), manager_id: opt(fd, "manager_id"), responsibilities: opt(fd, "responsibilities"), start_date: opt(fd, "start_date") })
      .eq("id", str(fd, "id")),
  );
  revalidatePath(`/app/team/${str(fd, "id")}`);
  return "Сохранено";
});

export const setRoles = action(async (fd) => {
  const supabase = await createClient();
  const id = str(fd, "id");
  const want = new Set(fd.getAll("roles").map(String));
  const { data: cur } = await supabase.from("user_roles").select("role_code").eq("user_id", id);
  const have = new Set((cur ?? []).map((r: { role_code: string }) => r.role_code));
  const { data: me } = await supabase.auth.getUser();
  for (const r of want) if (!have.has(r)) check(await supabase.from("user_roles").insert({ user_id: id, role_code: r, granted_by: me.user!.id }));
  for (const r of have) if (!want.has(r)) check(await supabase.from("user_roles").delete().eq("user_id", id).eq("role_code", r));
  revalidatePath(`/app/team/${id}`);
  return "Роли обновлены (записано в журнал)";
});

export const setPerms = action(async (fd) => {
  const supabase = await createClient();
  const id = str(fd, "id");
  const want = new Set(fd.getAll("perms").map(String));
  const { data: cur } = await supabase.from("user_permissions").select("permission_code").eq("user_id", id);
  const have = new Set((cur ?? []).map((r: { permission_code: string }) => r.permission_code));
  const { data: me } = await supabase.auth.getUser();
  for (const r of want) if (!have.has(r)) check(await supabase.from("user_permissions").insert({ user_id: id, permission_code: r, granted_by: me.user!.id }));
  for (const r of have) if (!want.has(r)) check(await supabase.from("user_permissions").delete().eq("user_id", id).eq("permission_code", r));
  revalidatePath(`/app/team/${id}`);
  return "Индивидуальные права обновлены";
});

export const addSalaryTerms = action(async (fd) => {
  const supabase = await createClient();
  const { data: me } = await supabase.auth.getUser();
  const s = salaryFrom(fd);
  if (!s) throw new Error("Выберите тип оплаты");
  const from = str(fd, "effective_from");
  if (!from) throw new Error("Укажите дату вступления в силу");
  check(
    await supabase.from("salary_terms").insert({
      user_id: str(fd, "id"),
      pay_type: s.type,
      base_minor: s.base_minor,
      piece_rules: s.piece_rules,
      pay_days: s.pay_days,
      effective_from: from,
      contract_end: opt(fd, "contract_end"),
      bonus_rules: opt(fd, "bonus_rules"),
      note: opt(fd, "note"),
      created_by: me.user!.id,
    }),
  );
  revalidatePath(`/app/team/${str(fd, "id")}`);
  return "Новые условия с даты вступления в силу; прошлые начисления не меняются";
});

export const createDepartment = action(async (fd) => {
  const supabase = await createClient();
  check(await supabase.from("departments").insert({ name: str(fd, "name") }));
  revalidatePath("/app/team");
  return "Отдел создан";
});

export const toggleRolePerm = action(async (fd) => {
  const supabase = await createClient();
  const role = str(fd, "role"), perm = str(fd, "perm");
  if (fd.get("on") === "1") check(await supabase.from("role_permissions").insert({ role_code: role, permission_code: perm }));
  else check(await supabase.from("role_permissions").delete().eq("role_code", role).eq("permission_code", perm));
  revalidatePath("/app/settings/roles");
  return "Матрица обновлена";
});
