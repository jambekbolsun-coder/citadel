import { requireActive } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { activePeople } from "@/lib/data";
import { SettingsPage } from "@/components/settings-list";
import { TaskForm } from "../task-form";

export const metadata = { title: "Новая задача" };

export default async function NewTask({ searchParams }: PageProps<"/app/tasks/new">) {
  const sp = await searchParams;
  const s = await requireActive();
  const supabase = await createClient();
  const [people, { data: projects }] = await Promise.all([activePeople(), supabase.from("projects").select("id,name").not("status", "in", "(closed,cancelled)").order("name")]);
  return (
    <SettingsPage title="Новая задача">
      <TaskForm people={people} projects={(projects ?? []) as { id: string; name: string }[]} me={s.userId} project={typeof sp.project === "string" ? sp.project : undefined} />
    </SettingsPage>
  );
}
