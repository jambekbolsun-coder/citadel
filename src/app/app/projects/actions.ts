"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { action, check, int, opt, str } from "@/lib/actions";
import { parseMoney } from "@/lib/format";

const KINDS = ["video", "story", "post", "carousel", "ad_creative", "shoot"];
const rp = (id: string) => revalidatePath(`/app/projects/${id}`);

export const createProject = action(async (fd) => {
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user!.id;
  const clientId = str(fd, "client_id");
  if (!clientId) throw new Error("Выберите клиента");
  const adminId = str(fd, "admin_id");
  if (!adminId) throw new Error("Администратор проекта обязателен");
  const name = str(fd, "name");
  if (!name) throw new Error("Укажите название проекта");

  // Снимок тарифной версии: договор не меняется при правке прайса
  const tvId = opt(fd, "tariff_version_id");
  let snapshot: Record<string, unknown> | null = null;
  if (tvId) {
    const { data: tv } = await supabase.from("tariff_versions").select("*, tariffs(name)").eq("id", tvId).single();
    snapshot = tv;
  }
  const composition: Record<string, number> = {};
  for (const k of KINDS) {
    const v = int(fd, `c_${k}`);
    if (v && v > 0) composition[k] = v;
  }
  if (!Object.keys(composition).length && snapshot?.composition) Object.assign(composition, snapshot.composition);
  const price = parseMoney(fd.get("price")) ?? (snapshot?.price_minor as number | undefined) ?? null;
  if (price === null) throw new Error("Укажите стоимость");

  const project = check(
    await supabase
      .from("projects")
      .insert({
        name,
        client_id: clientId,
        lead_id: opt(fd, "lead_id"),
        kind: str(fd, "kind"),
        status: "draft",
        tariff_version_id: tvId,
        contract_start: opt(fd, "contract_start"),
        contract_end: opt(fd, "contract_end"),
        work_start: opt(fd, "work_start"),
        renewal_date: opt(fd, "renewal_date"),
        platforms: fd.getAll("platforms").map(String),
        revisions_allowed: int(fd, "revisions_allowed"),
        approval_flow: opt(fd, "approval_flow"),
        wishes: opt(fd, "wishes"),
        references_text: opt(fd, "references_text"),
        socials: { instagram: str(fd, "instagram"), tiktok: str(fd, "tiktok"), facebook: str(fd, "facebook") },
        stories_method: opt(fd, "stories_method") ?? (snapshot?.stories_method as string | null) ?? null,
        requires_publication: fd.get("requires_publication") === "on",
        admin_id: adminId,
        manager_id: opt(fd, "manager_id"),
        planning_director_id: opt(fd, "planning_director_id"),
        creative_director_id: opt(fd, "creative_director_id"),
        created_by: uid,
      })
      .select("id")
      .single(),
  ) as { id: string };

  check(
    await supabase.from("project_contracts").insert({
      project_id: project.id,
      price_minor: price,
      currency: str(fd, "currency") || "KGS",
      tariff_snapshot: snapshot,
      composition,
      extra_services: opt(fd, "extra_services"),
      payment_terms: opt(fd, "payment_terms"),
    }),
  );
  const members = fd.getAll("team").map(String).filter(Boolean);
  if (members.length) {
    await supabase.from("project_members").insert(members.map((m) => ({ project_id: project.id, user_id: m, role: "member" })));
  }
  // Счета по графику платежей
  const inv1 = parseMoney(fd.get("inv1_amount"));
  if (inv1) {
    check(await supabase.from("invoices").insert({ project_id: project.id, title: str(fd, "inv1_title") || "Оплата по договору", amount_minor: inv1, due_on: str(fd, "inv1_due") || new Date().toISOString().slice(0, 10), created_by: uid }));
  }
  const inv2 = parseMoney(fd.get("inv2_amount"));
  if (inv2) {
    check(await supabase.from("invoices").insert({ project_id: project.id, title: str(fd, "inv2_title") || "Второй платёж", amount_minor: inv2, due_on: str(fd, "inv2_due") || new Date().toISOString().slice(0, 10), created_by: uid }));
  }
  redirect(`/app/projects/${project.id}`);
});

export const setProjectStatus = action(async (fd) => {
  const supabase = await createClient();
  check(await supabase.rpc("project_set_status", { p_project: str(fd, "id"), p_to: str(fd, "to"), p_reason: opt(fd, "reason") }));
  rp(str(fd, "id"));
  return "Статус изменён";
});

export const saveHandoff = action(async (fd) => {
  const supabase = await createClient();
  const handoff = Object.fromEntries(["client", "package", "dates", "wishes", "admin_accepted"].map((k) => [k, fd.get(k) === "on"]));
  check(await supabase.from("projects").update({ handoff }).eq("id", str(fd, "id")));
  rp(str(fd, "id"));
  return "Чек-лист сохранён";
});

export const launchProject = action(async (fd) => {
  const supabase = await createClient();
  check(await supabase.rpc("launch_project", { p_project: str(fd, "id"), p_override_reason: opt(fd, "reason") }));
  rp(str(fd, "id"));
  return "Проект допущен к производству. Сформируйте план периода.";
});

export const updateTeam = action(async (fd) => {
  const supabase = await createClient();
  const id = str(fd, "id");
  check(
    await supabase
      .from("projects")
      .update({
        admin_id: str(fd, "admin_id") || null,
        manager_id: opt(fd, "manager_id"),
        planning_director_id: opt(fd, "planning_director_id"),
        creative_director_id: opt(fd, "creative_director_id"),
      })
      .eq("id", id),
  );
  const add = opt(fd, "add_member");
  if (add) check(await supabase.from("project_members").upsert({ project_id: id, user_id: add, role: "member" }));
  rp(id);
  return "Команда обновлена";
});

export const removeMember = action(async (fd) => {
  const supabase = await createClient();
  check(await supabase.from("project_members").delete().eq("project_id", str(fd, "id")).eq("user_id", str(fd, "user_id")).eq("role", str(fd, "role")));
  rp(str(fd, "id"));
  return "Удалён из команды";
});

export const createPeriodAction = action(async (fd) => {
  const supabase = await createClient();
  check(await supabase.rpc("create_period", { p_project: str(fd, "id"), p_start: str(fd, "start"), p_months: 1 }));
  rp(str(fd, "id"));
  return "Период создан";
});

export const generatePlan = action(async (fd) => {
  const supabase = await createClient();
  const r = check(await supabase.rpc("generate_period_plan", { p_period: str(fd, "period_id") })) as { created: number; working_days: number };
  rp(str(fd, "id"));
  return `Черновик плана: создано ${r.created} единиц на ${r.working_days} рабочих дн. Проверьте и утвердите.`;
});

export const approvePlan = action(async (fd) => {
  const supabase = await createClient();
  check(await supabase.rpc("approve_period_plan", { p_period: str(fd, "period_id") }));
  rp(str(fd, "id"));
  return "План утверждён, исполнители уведомлены";
});

export const closePeriod = action(async (fd) => {
  const supabase = await createClient();
  const r = check(await supabase.rpc("close_period", { p_period: str(fd, "period_id"), p_create_next: fd.get("next") === "on" })) as { work_debt: number };
  rp(str(fd, "id"));
  return r.work_debt > 0 ? `Период завершён, есть задолженность по работам: ${r.work_debt}` : "Период закрыт без долга";
});

export const amendContract = action(async (fd) => {
  const supabase = await createClient();
  const id = str(fd, "id");
  const reason = str(fd, "reason");
  if (!reason) throw new Error("Укажите основание поправки");
  const { data: u } = await supabase.auth.getUser();
  const { data: before } = await supabase.from("project_contracts").select("*").eq("project_id", id).single();
  const composition: Record<string, number> = {};
  for (const k of KINDS) {
    const v = int(fd, `c_${k}`);
    if (v && v > 0) composition[k] = v;
  }
  const price = parseMoney(fd.get("price")) ?? before?.price_minor;
  check(await supabase.from("project_contracts").update({ composition, price_minor: price, updated_at: new Date().toISOString() }).eq("project_id", id));
  check(await supabase.from("project_amendments").insert({ project_id: id, reason, before, after: { composition, price_minor: price }, created_by: u.user!.id }));
  // объём текущего открытого периода
  const period = opt(fd, "period_id");
  if (period) {
    for (const k of KINDS) {
      const v = composition[k] ?? 0;
      const { data: exists } = await supabase.from("plan_items").select("id").eq("period_id", period).eq("kind", k).maybeSingle();
      if (exists) check(await supabase.from("plan_items").update({ planned_qty: v, note: `Поправка: ${reason}` }).eq("id", exists.id));
    }
  }
  rp(id);
  return "Поправка к договору сохранена";
});

export const addContent = action(async (fd) => {
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  const id = str(fd, "id");
  const kind = str(fd, "kind");
  const period = str(fd, "period_id");
  const { data: pi } = await supabase.from("plan_items").select("id").eq("period_id", period).eq("kind", kind).maybeSingle();
  check(
    await supabase.from("content_items").insert({
      project_id: id,
      period_id: period,
      plan_item_id: pi?.id ?? null,
      occurrence_key: `manual-${crypto.randomUUID().slice(0, 8)}`,
      kind,
      title: str(fd, "title") || "Материал",
      publish_due: opt(fd, "publish_due") ? new Date(`${str(fd, "publish_due")}T18:00:00+06:00`).toISOString() : null,
      created_by: u.user!.id,
    }),
  );
  rp(id);
  return "Материал добавлен";
});

export const saveStoryDay = action(async (fd) => {
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  const actual = int(fd, "actual") ?? 0;
  const planned = int(fd, "planned") ?? 0;
  const reason = opt(fd, "reason");
  if (actual < planned && fd.get("confirm") === "on" && !reason) throw new Error("Укажите причину недостающих сторис");
  check(
    await supabase
      .from("story_daily_plans")
      .update({
        actual,
        shortfall_reason: reason,
        assignee_id: opt(fd, "assignee_id"),
        confirmed_by: fd.get("confirm") === "on" ? u.user!.id : null,
        confirmed_at: fd.get("confirm") === "on" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", str(fd, "story_id")),
  );
  rp(str(fd, "id"));
  return actual < planned ? `Частично: осталось ${planned - actual}` : "Сохранено";
});

export const createInvoice = action(async (fd) => {
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  const amount = parseMoney(fd.get("amount"));
  if (!amount) throw new Error("Укажите сумму");
  check(await supabase.from("invoices").insert({ project_id: str(fd, "id"), period_id: opt(fd, "period_id"), title: str(fd, "title") || "Счёт", amount_minor: amount, due_on: str(fd, "due_on"), created_by: u.user!.id }));
  rp(str(fd, "id"));
  return "Счёт выставлен";
});

export const voidInvoice = action(async (fd) => {
  const supabase = await createClient();
  const reason = str(fd, "reason");
  if (!reason) throw new Error("Укажите причину аннулирования");
  check(await supabase.from("invoices").update({ status: "void", void_reason: reason }).eq("id", str(fd, "invoice_id")));
  rp(str(fd, "id"));
  return "Счёт аннулирован";
});

export const addPayment = action(async (fd) => {
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  const amount = parseMoney(fd.get("amount"));
  if (!amount) throw new Error("Укажите сумму");
  // платёж по счёту — в валюте счёта (иначе БД отклонит, 0015)
  const invoiceId = opt(fd, "invoice_id");
  const { data: inv } = invoiceId ? await supabase.from("invoices").select("currency").eq("id", invoiceId).maybeSingle() : { data: null };
  check(
    await supabase.from("payments").insert({
      project_id: str(fd, "id"),
      invoice_id: invoiceId,
      currency: inv?.currency ?? "KGS",
      kind: str(fd, "kind") || "payment",
      amount_minor: amount,
      paid_on: str(fd, "paid_on") || new Date().toISOString().slice(0, 10),
      method: opt(fd, "method"),
      account_id: opt(fd, "account_id"),
      note: opt(fd, "note"),
      created_by: u.user!.id,
    }),
  );
  rp(str(fd, "id"));
  return "Поступление внесено и ожидает независимого подтверждения";
});

export const confirmPayment = action(async (fd) => {
  const supabase = await createClient();
  check(await supabase.rpc("payment_confirm", { p_id: str(fd, "payment_id"), p_account: opt(fd, "account_id") }));
  rp(str(fd, "id"));
  revalidatePath("/app/finance");
  return "Платёж подтверждён";
});

export const rejectPayment = action(async (fd) => {
  const supabase = await createClient();
  check(await supabase.rpc("payment_reject", { p_id: str(fd, "payment_id"), p_reason: str(fd, "reason") }));
  rp(str(fd, "id"));
  revalidatePath("/app/finance");
  return "Платёж отклонён";
});

export const createSecret = action(async (fd) => {
  const supabase = await createClient();
  const value = String(fd.get("value") ?? "");
  if (!value) throw new Error("Введите значение");
  check(await supabase.rpc("secret_create", { p_project: str(fd, "id"), p_label: str(fd, "label"), p_platform: str(fd, "platform"), p_login_hint: str(fd, "login_hint"), p_value: value }));
  rp(str(fd, "id"));
  revalidatePath("/app/campaigns", "layout");
  return "Доступ сохранён в зашифрованном хранилище";
});

export const revealSecret = action(async (fd) => {
  const supabase = await createClient();
  const v = check(await supabase.rpc("secret_reveal", { p_secret: str(fd, "secret_id") })) as string;
  return { ok: "Показано (факт просмотра записан в журнал)", data: { value: v } };
});

export const deleteSecret = action(async (fd) => {
  const supabase = await createClient();
  check(await supabase.rpc("secret_delete", { p_secret: str(fd, "secret_id") }));
  rp(str(fd, "id"));
  revalidatePath("/app/campaigns", "layout");
  return "Доступ удалён";
});

export const addComment = action(async (fd) => {
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  const body = str(fd, "body");
  if (!body) throw new Error("Пустой комментарий");
  check(await supabase.from("comments").insert({ entity_type: str(fd, "entity_type"), entity_id: str(fd, "entity_id"), project_id: opt(fd, "project_id"), author_id: u.user!.id, body }));
  revalidatePath(str(fd, "path") || "/app");
  return "Комментарий добавлен";
});
