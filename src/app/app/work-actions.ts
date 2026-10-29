"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { action, check, opt, str } from "@/lib/actions";

export type WorkItem = {
  kind: "task" | "content";
  id: string;
  title: string;
  project: string | null;
  due: string | null;
  status: string;
  /** куда попадёт работа после сдачи */
  target: "review" | "done";
  needsUrl: boolean;
};

// Статусы, из которых исполнитель может сдать работу (совпадают с task_transition / content_transition в БД)
const TASK_OPEN = ["todo", "in_progress", "revision", "blocked"];
const CONTENT_SUBMITTABLE = ["in_progress", "processing", "editing", "design", "revision"];

/** Мои назначенные работы, которые можно сдать. Выборка ограничена RLS и фильтром по исполнителю. */
export async function loadMyWork(): Promise<WorkItem[]> {
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return [];
  const [{ data: tasks }, { data: content }] = await Promise.all([
    supabase.from("tasks").select("id,title,status,due_at,reviewer_id,projects(name)").eq("assignee_id", u.user.id).in("status", TASK_OPEN).order("due_at", { nullsFirst: false }).limit(40),
    supabase.from("content_items").select("id,title,status,prep_due,projects(name)").eq("assignee_id", u.user.id).in("status", CONTENT_SUBMITTABLE).order("prep_due", { nullsFirst: false }).limit(40),
  ]);
  const me = u.user.id;
  const t = ((tasks ?? []) as unknown as { id: string; title: string; status: string; due_at: string | null; reviewer_id: string | null; projects: { name: string } | null }[]).map(
    (x): WorkItem => ({ kind: "task", id: x.id, title: x.title, project: x.projects?.name ?? null, due: x.due_at, status: x.status, target: x.reviewer_id && x.reviewer_id !== me ? "review" : "done", needsUrl: false }),
  );
  const c = ((content ?? []) as unknown as { id: string; title: string; status: string; prep_due: string | null; projects: { name: string } | null }[]).map(
    (x): WorkItem => ({ kind: "content", id: x.id, title: x.title, project: x.projects?.name ?? null, due: x.prep_due, status: x.status, target: "review", needsUrl: true }),
  );
  return [...c, ...t].sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"));
}

/** Сдача через действующие переходы статусов: никаких отдельных «я сделал» записей. */
export const submitWork = action(async (fd) => {
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  const kind = str(fd, "kind");
  const id = str(fd, "id");
  const result = str(fd, "result");
  const note = opt(fd, "note");
  if (!id) throw new Error("Выберите работу");
  if (kind === "content") {
    if (!/^https?:\/\/\S+$/.test(result)) throw new Error("Укажите ссылку на файл результата (https://…)");
    check(await supabase.rpc("content_transition", { p_id: id, p_to: "review", p_note: note, p_result_url: result }));
    revalidatePath(`/app/content/${id}`);
    revalidatePath("/app/content");
  } else if (kind === "task") {
    if (!result) throw new Error("Опишите результат или вставьте ссылку");
    const t = check(await supabase.from("tasks").select("reviewer_id").eq("id", id).maybeSingle()) as { reviewer_id: string | null } | null;
    if (!t) throw new Error("Задача не найдена");
    const to = t.reviewer_id && t.reviewer_id !== u.user!.id ? "review" : "done";
    check(await supabase.rpc("task_transition", { p_id: id, p_to: to, p_note: note, p_result: result }));
    revalidatePath(`/app/tasks/${id}`);
    revalidatePath("/app/tasks");
    revalidatePath("/app");
    revalidatePath("/app/today");
    return to === "review" ? "Отправлено на проверку — проверяющий получил уведомление" : "Задача закрыта";
  } else {
    throw new Error("Неизвестный тип работы");
  }
  revalidatePath("/app");
  revalidatePath("/app/today");
  return "Материал отправлен на проверку";
});
