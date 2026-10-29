import { Field } from "@/components/ui";
import { ActionForm, Submit } from "@/components/action-form";
import { PeopleSelect } from "@/components/people-select";
import { RecurrenceFields } from "@/components/recurrence-fields";
import type { Person } from "@/lib/data";
import { PRIORITY } from "@/lib/labels";
import { createTask } from "./actions";

export function TaskForm({ people, projects, me, project }: { people: Person[]; projects: { id: string; name: string }[]; me: string; project?: string }) {
  return (
    <ActionForm action={createTask} reset className="space-y-3">
      <Field label="Название *"><input name="title" required className="input" enterKeyHint="next" /></Field>
      <Field label="ТЗ / описание" hint="Обязательно, если назначаете другому"><textarea name="description" className="input" /></Field>
      <Field label="Проект">
        <select name="project_id" defaultValue={project ?? ""} className="input">
          <option value="">— без проекта —</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Field>
      <Field label="Исполнитель"><PeopleSelect name="assignee_id" people={people} defaultValue={me} /></Field>
      <Field label="Проверяющий"><PeopleSelect name="reviewer_id" people={people} /></Field>
      <Field label="Срок"><input name="due_at" type="datetime-local" className="input" /></Field>
      <RecurrenceFields startName="due_at" />
      <Field label="Приоритет">
        <select name="priority" defaultValue="normal" className="input">
          {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Field>
      <div className="sticky-actions"><Submit className="w-full">Создать задачу</Submit></div>
      <p className="text-xs text-muted">Назначать задачи другим можно в своих проектах или с правом управления задачами.</p>
    </ActionForm>
  );
}
