import { requireActive } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, Field, PageHeader } from "@/components/ui";
import { ActionForm, Submit } from "@/components/action-form";
import { RecurrenceFields } from "@/components/recurrence-fields";
import { createShoot } from "../actions";

export const metadata = { title: "Новая съёмка" };

export default async function NewShoot({ searchParams }: PageProps<"/app/shoots/new">) {
  const sp = await searchParams;
  await requireActive();
  const supabase = await createClient();
  const { data: projects } = await supabase.from("projects").select("id,name").not("status", "in", "(closed,cancelled)").order("name");
  return (
    <>
      <PageHeader back="/app/shoots" title="Новая съёмка" subtitle="За одну съёмку можно отснять несколько видео — это не 1 выезд на ролик" />
      <Card>
        <ActionForm action={createShoot} className="grid gap-3 sm:grid-cols-2">
          <Field label="Проект *">
            <select name="project_id" required defaultValue={typeof sp.project === "string" ? sp.project : ""} className="input">
              <option value="">— выберите —</option>
              {(projects ?? []).map((p: { id: string; name: string }) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Название"><input name="title" placeholder="Съёмка в ресторане" className="input" /></Field>
          <Field label="Начало (Бишкек) *"><input name="starts_at" type="datetime-local" required className="input" /></Field>
          <Field label="Окончание *"><input name="ends_at" type="datetime-local" required className="input" /></Field>
          <Field label="Место"><input name="location" className="input" /></Field>
          <Field label="Количество материалов"><input name="planned_items" type="number" min={0} className="input" /></Field>
          <Field label="Темы и сценарии" className="sm:col-span-2"><textarea name="topics" className="input" /></Field>
          <Field label="Режиссёрские и технические заметки" className="sm:col-span-2"><textarea name="notes" className="input" /></Field>
          <Field label="Одежда, реквизит, оборудование" className="sm:col-span-2"><input name="equipment" className="input" /></Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="ambassador_needed" defaultChecked /> Нужен амбассадор</label>
          <div className="sm:col-span-2"><RecurrenceFields startName="starts_at" /></div>
          <div className="sm:col-span-2"><Submit>Создать и перейти к составу</Submit><p className="mt-2 text-xs text-muted">Для серии откроется первая съёмка — участников можно сразу назначить на все повторы.</p></div>
        </ActionForm>
      </Card>
    </>
  );
}
