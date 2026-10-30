import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { ActionForm, Submit } from "@/components/action-form";
import { claimOwner, signUp } from "@/app/auth-actions";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { Field, Notice } from "@/components/ui";

export const metadata = { title: "Первичная настройка" };

// Доступно только пока в системе нет владельца (проверяется и на сервере в claim_first_owner)
export default async function Setup() {
  const supabase = await createClient();
  const { data: ownerExists } = await supabase.rpc("owner_exists");
  if (ownerExists) redirect("/login");
  const session = await getSession();

  if (session) {
    return (
      <AuthShell title="Назначение владельца" subtitle={`Аккаунт: ${session.email}`}>
        <Notice>Вы станете единственным владельцем SMM KADR. Дальше сотрудники добавляются только через QR-приглашения.</Notice>
        <ActionForm action={claimOwner} className="mt-4 space-y-4">
          <Field label="ФИО владельца">
            <input name="full_name" required defaultValue={session.profile?.full_name ?? ""} className="input" />
          </Field>
          <Submit className="w-full">Стать владельцем</Submit>
        </ActionForm>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Создание аккаунта владельца" subtitle="Один раз при запуске системы">
      <ActionForm action={signUp} className="space-y-4">
        <input type="hidden" name="next" value="/setup" />
        <Field label="ФИО"><input name="full_name" required className="input" autoComplete="name" /></Field>
        <Field label="Email"><input name="email" type="email" required className="input" autoComplete="email" /></Field>
        <Field label="Пароль" hint="Минимум 10 символов, буквы и цифры"><input name="password" type="password" required minLength={10} className="input" autoComplete="new-password" /></Field>
        <Field label="Повторите пароль"><input name="password2" type="password" required minLength={10} className="input" autoComplete="new-password" /></Field>
        <Submit className="w-full">Создать аккаунт</Submit>
      </ActionForm>
      <p className="mt-4 text-xs text-muted">После подтверждения email войдите и вернитесь на эту страницу, чтобы закрепить роль владельца.</p>
    </AuthShell>
  );
}
