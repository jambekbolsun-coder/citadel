"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { action, check, opt, str } from "@/lib/actions";
import { localInputToIso, localToIso, plural } from "@/lib/format";
import { describe, expand, ruleFromForm } from "@/lib/recurrence";

export const createTask = action(async (fd) => {
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  const title = str(fd, "title");
  if (!title) throw new Error("Укажите название");
  const assignee = opt(fd, "assignee_id") ?? u.user!.id;
  const due = localInputToIso(fd.get("due_at"));
  if (assignee !== u.user!.id && !due) throw new Error("Срок обязателен при назначении другому сотруднику");
  if (assignee !== u.user!.id && !str(fd, "description")) throw new Error("Опишите задачу (ТЗ) перед назначением");
  const base = {
    title,
    description: opt(fd, "description"),
    project_id: opt(fd, "project_id"),
    type: str(fd, "type") || "general",
    priority: str(fd, "priority") || "normal",
    assignee_id: assignee,
    reviewer_id: opt(fd, "reviewer_id"),
    created_by: u.user!.id,
  };
  const rule = ruleFromForm(fd);
  if (!rule) {
    check(await supabase.from("tasks").insert({ ...base, due_at: due }));
    revalidatePath("/app/tasks");
    return "Задача создана";
  }
  const raw = String(fd.get("due_at") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw)) throw new Error("Для повторяющейся задачи укажите срок первого повтора");
  const day = raw.slice(0, 10);
  const hm = raw.slice(11, 16);
  const dates = expand(day, rule);
  if (dates.length < 2) throw new Error("По этому правилу получается меньше двух повторов — проверьте даты");
  const summary = describe(day, rule);
  const ser = check(await supabase.from("recurrence_series").insert({ entity: "task", rule, summary, created_by: u.user!.id }).select("id").single()) as { id: string };
  check(await supabase.from("tasks").insert(dates.map((d) => ({ ...base, due_at: localToIso(d, hm), series_id: ser.id }))));
  revalidatePath("/app/tasks");
  revalidatePath("/app/calendar");
  return `Создана серия «${summary}»: ${dates.length} ${plural(dates.length, ["задача", "задачи", "задач"])}`;
});

export const cancelSeries = action(async (fd) => {
  const supabase = await createClient();
  const n = check(await supabase.rpc("series_cancel", { p_series: str(fd, "series_id"), p_from: str(fd, "from"), p_reason: str(fd, "reason") })) as number;
  revalidatePath("/app/tasks");
  revalidatePath("/app/shoots");
  revalidatePath("/app/calendar");
  if (str(fd, "id")) revalidatePath(`/app/${str(fd, "entity") === "shoot" ? "shoots" : "tasks"}/${str(fd, "id")}`);
  return n ? `Отменено повторов: ${n}` : "Будущих повторов нет";
});

export const transitionTask = action(async (fd) => {
  const supabase = await createClient();
  check(await supabase.rpc("task_transition", { p_id: str(fd, "id"), p_to: str(fd, "to"), p_note: opt(fd, "note"), p_result: opt(fd, "result") }));
  revalidatePath(`/app/tasks/${str(fd, "id")}`);
  revalidatePath("/app/tasks");
  revalidatePath("/app/today");
  return "Статус обновлён";
});

export const rescheduleTask = action(async (fd) => {
  const supabase = await createClient();
  check(await supabase.rpc("task_reschedule", { p_id: str(fd, "id"), p_due: localInputToIso(fd.get("due_at")), p_reason: str(fd, "reason"), p_assignee: opt(fd, "assignee_id") }));
  revalidatePath(`/app/tasks/${str(fd, "id")}`);
  return "Срок/исполнитель изменён, история сохранена";
});
