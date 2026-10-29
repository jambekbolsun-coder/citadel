import { Field } from "@/components/ui";
import { ActionForm, Submit } from "@/components/action-form";
import { PeopleSelect } from "@/components/people-select";
import type { Person } from "@/lib/data";
import { todayLocal } from "@/lib/format";
import { createExpense } from "./actions";

type Opt = { id: string; name: string };
type Acc = Opt & { currency?: string };

export function ExpenseForm({ accs, people, cats, projects, deps }: { accs: Acc[]; people: Person[]; cats: (Opt & { parent_id: string | null; requires_project: boolean })[]; projects: Opt[]; deps: Opt[] }) {
  return (
    <ActionForm action={createExpense} reset className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Сумма *"><input name="amount" required inputMode="decimal" autoComplete="off" className="input" /></Field>
        <Field label="Валюта"><select name="currency" className="input"><option>KGS</option><option>USD</option></select></Field>
        <Field label="Дата покупки *"><input name="purchased_on" type="date" required defaultValue={todayLocal()} className="input" /></Field>
        <Field label="Дата оплаты"><input name="paid_on" type="date" className="input" /></Field>
      </div>
      <Field label="Описание *"><input name="description" required className="input" /></Field>
      <Field label="Категория *"><select name="category_id" required className="input">{cats.map((c) => <option key={c.id} value={c.id}>{c.parent_id ? "— " : ""}{c.name}{c.requires_project ? " (нужен проект)" : ""}</option>)}</select></Field>
      <Field label="Продавец / контрагент"><input name="vendor" className="input" /></Field>
      <Field label="Проект"><select name="project_id" className="input"><option value="">—</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
      <Field label="Отдел"><select name="department_id" className="input"><option value="">—</option>{deps.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Счёт оплаты"><select name="account_id" className="input"><option value="">—</option>{accs.map((a) => <option key={a.id} value={a.id}>{a.name}{a.currency ? ` · ${a.currency}` : ""}</option>)}</select></Field>
        <Field label="Способ"><input name="method" className="input" /></Field>
      </div>
      <Field label="Ответственный"><PeopleSelect name="responsible_id" people={people} /></Field>
      <Field label="Теги (через запятую)"><input name="tags" className="input" /></Field>
      <Field label="Повторяемость"><select name="recurrence" className="input"><option value="">Разовый</option><option value="monthly">Ежемесячно</option><option value="weekly">Еженедельно</option><option value="yearly">Ежегодно</option></select></Field>
      <Field label="Чек / фото (до 4 МБ)"><input name="receipt" type="file" accept="image/*,application/pdf" className="input" aria-describedby="receipt-hint" /><span id="receipt-hint" className="mt-1 block text-xs text-muted">На телефоне можно сфотографировать чек камерой или выбрать из галереи.</span></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_asset" /> Учесть как имущество (без двойного списания)</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="draft" /> Сохранить как черновик</label>
      <div className="sticky-actions"><Submit className="w-full">Внести расход</Submit></div>
    </ActionForm>
  );
}
