import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { ActionForm, Submit } from "@/components/action-form";
import { updatePassword } from "@/app/auth-actions";
import { getSession } from "@/lib/auth";
import { Field } from "@/components/ui";
import Link from "next/link";

export const metadata = { title: "Новый пароль" };

export default async function UpdatePassword() {
  const s = await getSession();
  if (!s) redirect("/reset-password");
  return (
    <AuthShell title="Новый пароль" subtitle={s.email ?? undefined} footer={<Link href="/app">В приложение →</Link>}>
      <ActionForm action={updatePassword} className="space-y-4">
        <Field label="Новый пароль" hint="Минимум 10 символов, буквы и цифры"><input name="password" type="password" required minLength={10} className="input" autoComplete="new-password" /></Field>
        <Field label="Повторите пароль"><input name="password2" type="password" required minLength={10} className="input" autoComplete="new-password" /></Field>
        <Submit className="w-full">Сохранить</Submit>
      </ActionForm>
    </AuthShell>
  );
}
