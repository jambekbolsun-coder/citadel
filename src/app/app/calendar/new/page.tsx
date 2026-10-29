import { requireActive } from "@/lib/auth";
import { activePeople } from "@/lib/data";
import { SettingsPage } from "@/components/settings-list";
import { EventForm } from "../event-form";

export const metadata = { title: "Запись в календарь" };

export default async function NewEvent() {
  const s = await requireActive();
  const canPick = s.can("employees.manage");
  const people = canPick ? await activePeople() : [];
  return (
    <SettingsPage title="Запись в календарь" subtitle="Смена, отпуск или занятость видны руководителю при планировании съёмок">
      <EventForm people={people} me={s.userId} canPickPerson={canPick} />
    </SettingsPage>
  );
}
