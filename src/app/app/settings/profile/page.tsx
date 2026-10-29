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
        <Field label="Должность" hint="Меняет руководитель"><input value={p.job_title ?? ""} disabled className="input opacity-70" /></Field>
        <Field label="Email" hint="Меняется через владельца"><input value={s.email ?? ""} disabled className="input opacity-70" /></Field>
        <input type="hidden" name="theme" value={p.theme} />
        <div className="sticky-actions"><Submit className="w-full">Сохранить</Submit></div>
      </ActionForm>
    </SettingsPage>
  );
}
