import { requireActive } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { accounts, activePeople } from "@/lib/data";
import { SettingsPage } from "@/components/settings-list";
import { ExpenseForm } from "../expense-form";

export const metadata = { title: "Новый расход" };

// Отдельный экран: сотруднику с правом внести расход не нужно открывать всю бухгалтерию
export default async function NewExpense() {
  await requireActive("expenses.create");
  const supabase = await createClient();
  const [accs, people, { data: cats }, { data: projects }, { data: deps }] = await Promise.all([
    accounts(),
    activePeople(),
    supabase.from("expense_categories").select("id,name,parent_id,requires_project").is("archived_at", null).order("sort"),
    supabase.from("projects").select("id,name").not("status", "in", "(closed,cancelled)").order("name"),
    supabase.from("departments").select("id,name"),
  ]);
  return (
    <SettingsPage title="Новый расход" subtitle="После внесения расход ждёт подтверждения бухгалтера">
      <ExpenseForm accs={accs} people={people} cats={(cats ?? []) as { id: string; name: string; parent_id: string | null; requires_project: boolean }[]} projects={(projects ?? []) as { id: string; name: string }[]} deps={(deps ?? []) as { id: string; name: string }[]} />
    </SettingsPage>
  );
}
