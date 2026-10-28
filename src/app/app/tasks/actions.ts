"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { action, check, opt, str } from "@/lib/actions";
import { localInputToIso } from "@/lib/format";

export const createTask = action(async (fd) => {
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  const title = str(fd, "title");
  if (!title) throw new Error("Укажите название");
  const assignee = opt(fd, "assignee_id") ?? u.user!.id;
  const due = localInputToIso(fd.get("due_at"));
  if (assignee !== u.user!.id && !due) throw new Error("Срок обязателен при назначении другому сотруднику");
  if (assignee !== u.user!.id && !str(fd, "description")) throw new Error("Опишите задачу (ТЗ) перед назначением");
  check(
    await supabase.from("tasks").insert({
      title,
      description: opt(fd, "description"),
      project_id: opt(fd, "project_id"),
      type: str(fd, "type") || "general",
      priority: str(fd, "priority") || "normal",
      assignee_id: assignee,
      reviewer_id: opt(fd, "reviewer_id"),
      due_at: due,
      created_by: u.user!.id,
    }),
  );
  revalidatePath("/app/tasks");
  return "Задача создана";
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
