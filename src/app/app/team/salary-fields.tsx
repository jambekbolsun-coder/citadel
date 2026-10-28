import { Field } from "@/components/ui";

export function SalaryFields() {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Field label="Тип оплаты">
        <select name="pay_type" className="input" defaultValue="">
          <option value="">— не задано —</option>
          <option value="fixed">Фиксированная</option>
          <option value="piecework">Сдельная</option>
          <option value="mixed">Смешанная</option>
        </select>
      </Field>
      <Field label="Оклад в месяц, сом"><input name="base" inputMode="decimal" className="input" /></Field>
      <Field label="Дни выплат" hint="одна или две даты: 5 или 5, 20"><input name="pay_days" placeholder="5" className="input" /></Field>
      <Field label="Ставка за видео"><input name="rate_video" inputMode="decimal" className="input" /></Field>
      <Field label="Ставка за пост"><input name="rate_post" inputMode="decimal" className="input" /></Field>
      <Field label="Ставка за карусель"><input name="rate_carousel" inputMode="decimal" className="input" /></Field>
    </div>
  );
}
