import { Field } from "@/components/ui";
import { ActionForm, Submit } from "@/components/action-form";
import type { Person } from "@/lib/data";
import { addCalendarEvent } from "./actions";

export function EventForm({ people, me, canPickPerson }: { people: Person[]; me: string; canPickPerson: boolean }) {
  return (
    <ActionForm action={addCalendarEvent} reset className="space-y-3">
      <Field label="Тип">
        <select name="kind" className="input">
          <option value="busy">Занят</option>
          <option value="shift">Смена</option>
          <option value="time_off">Отпуск / выходной</option>
          <option value="report">Отчёт</option>
        </select>
      </Field>
      <Field label="Комментарий"><input name="title" className="input" placeholder="Например: съёмка у клиента" /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="С *"><input name="starts_at" type="datetime-local" required className="input" /></Field>
        <Field label="По *"><input name="ends_at" type="datetime-local" required className="input" /></Field>
      </div>
      {canPickPerson && (
        <Field label="Сотрудник">
          <select name="user_id" defaultValue={me} className="input">
            {people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
        </Field>
      )}
      <div className="sticky-actions"><Submit className="w-full">Добавить в календарь</Submit></div>
    </ActionForm>
  );
}
