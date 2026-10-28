import { AuthShell } from "@/components/auth-shell";
import { ActionForm, Submit } from "@/components/action-form";
import { requestReset } from "@/app/auth-actions";
import { Field } from "@/components/ui";
import Link from "next/link";

export const metadata = { title: "Восстановление пароля" };

export default function ResetPassword() {
  return (
    <AuthShell title="Восстановление пароля" footer={<Link href="/login">← Ко входу</Link>}>
      <ActionForm action={requestReset} className="space-y-4">
        <Field label="Email"><input name="email" type="email" required className="input" /></Field>
        <Submit className="w-full">Отправить ссылку</Submit>
      </ActionForm>
    </AuthShell>
  );
}
