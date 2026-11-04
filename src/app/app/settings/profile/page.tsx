import { requireActive } from "@/lib/auth";
import { Avatar, Field } from "@/components/ui";
import { ActionForm, Submit } from "@/components/action-form";
import { SettingsPage } from "@/components/settings-list";
import { saveProfile } from "../actions";

export const metadata = { title: "Профиль" };

export default async function ProfileSettings() {
  const s = await requireActive();
  const p = s.profile!;
  return (
    <SettingsPage title="Редактировать профиль" subtitle="Фото, имя и контакты видят коллеги. Должность и права меняет руководитель.">
      <ActionForm action={saveProfile} className="space-y-4">
        <div className="flex flex-col items-center gap-2">
          <Avatar name={p.full_name} url={p.avatar_url} size={96} />
          <label className="inline-flex min-h-11 cursor-pointer items-center rounded-full px-4 text-sm font-semibold text-primary">
            Сменить фото
            <input type="file" name="avatar" accept="image/*" className="sr-only" />
          </label>
        </div>
        <Field label="Имя и фамилия"><input name="full_name" defaultValue={p.full_name} required autoComplete="name" className="input" /></Field>
        <Field label="Рабочий телефон"><input name="phone" type="tel" inputMode="tel" autoComplete="tel" defaultValue={p.phone ?? ""} className="input" /></Field>
        <Field label="О себе"><textarea name="about" defaultValue={p.about ?? ""} className="input" /></Field>
        <fieldset className="rounded-2xl border border-line p-3">
          <legend className="px-1 text-sm font-semibold">Приветствие илбирса</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Как вас называть" hint="Пусто — имя из ФИО"><input name="greet_name" maxLength={40} defaultValue={(p as { greet_name?: string | null }).greet_name ?? ""} placeholder="например, Айка" className="input" /></Field>
            <Field label="Обращение" hint="Для фраз «вы молодец / вы умница»">
              <select name="address_form" defaultValue={(p as { address_form?: string }).address_form ?? "none"} className="input">
                <option value="none">Не указывать (нейтрально)</option>
                <option value="he">Он — «молодец»</option>
                <option value="she">Она — «умница»</option>
              </select>
            </Field>
            <Field label="День рождения" hint="Необязательно — илбирс поздравит"><input name="birth_date" type="date" defaultValue={(p as { birth_date?: string | null }).birth_date ?? ""} className="input" /></Field>
          </div>
        </fieldset>
        <Field label="Должность" hint="Меняет руководитель"><input value={p.job_title ?? ""} disabled className="input opacity-70" /></Field>
        <Field label="Email" hint="Меняется через владельца"><input value={s.email ?? ""} disabled className="input opacity-70" /></Field>
        <div className="sticky-actions"><Submit className="w-full">Сохранить</Submit></div>
      </ActionForm>
    </SettingsPage>
  );
}
