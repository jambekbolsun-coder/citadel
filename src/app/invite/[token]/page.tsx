import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { ActionForm, Submit } from "@/components/action-form";
import { acceptInvite, signUp } from "@/app/auth-actions";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { Field, Notice } from "@/components/ui";

export const metadata = { title: "Приглашение" };

type Preview = { valid: boolean; reason?: string; full_name?: string; job_title?: string; email_hint?: string; department?: string; roles?: string[] };
const REASON: Record<string, string> = {
  not_found: "Ссылка недействительна.",
  revoked: "Приглашение отозвано. Попросите руководителя выпустить новое.",
  used: "Приглашение уже использовано.",
  expired: "Срок действия приглашения истёк. Попросите выпустить новое.",
};

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const supabase = await createClient();
  const { data } = await supabase.rpc("invite_preview", { p_token: token });
  const p = (data ?? { valid: false, reason: "not_found" }) as Preview;
  const session = await getSession();

  if (!p.valid) {
    if (session?.profile?.status === "pending_approval") {
      return (
        <AuthShell title="Приглашение принято">
          <Notice tone="good">Ваш профиль ожидает утверждения владельцем.</Notice>
          <Link href="/pending" className="mt-4 inline-block text-primary">Перейти →</Link>
        </AuthShell>
      );
    }
    return (
      <AuthShell title="Приглашение недоступно">
        <Notice tone="bad">{REASON[p.reason ?? "not_found"]}</Notice>
      </AuthShell>
    );
  }

  const intro = (
    <div className="mb-4 rounded-xl bg-surface-2 p-4 text-sm">
      <div className="text-muted">SMM KADR приглашает</div>
      <div className="mt-1 text-lg font-semibold">{p.full_name}</div>
      <div className="mt-1">{[p.job_title, p.department].filter(Boolean).join(" · ") || "Позиция будет уточнена"}</div>
      {p.roles && p.roles.length > 0 && <div className="mt-1 text-muted">Роли: {p.roles.join(", ")}</div>}
    </div>
  );

  if (!session) {
    return (
      <AuthShell title="Присоединиться к «Цитадели»" subtitle={`Используйте email, на который выписано приглашение (${p.email_hint})`}>
        {intro}
        <ActionForm action={signUp} className="space-y-4">
          <input type="hidden" name="next" value={`/invite/${token}`} />
          <input type="hidden" name="full_name" value={p.full_name} />
          <Field label="Рабочий email"><input name="email" type="email" required className="input" autoComplete="email" /></Field>
          <Field label="Пароль" hint="Минимум 10 символов, буквы и цифры. PIN для быстрого входа задаётся после."><input name="password" type="password" required minLength={10} className="input" autoComplete="new-password" /></Field>
          <Field label="Повторите пароль"><input name="password2" type="password" required minLength={10} className="input" autoComplete="new-password" /></Field>
          <Submit className="w-full">Создать аккаунт и подтвердить email</Submit>
        </ActionForm>
        <p className="mt-4 text-sm text-muted">
          Уже есть аккаунт? <Link className="text-primary" href={`/login?next=/invite/${token}`}>Войти</Link>
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Заполните профиль" subtitle={`Вы вошли как ${session.email}`}>
      {intro}
      <ActionForm action={acceptInvite} className="space-y-4">
        <input type="hidden" name="token" value={token} />
        <Field label="Телефон"><input name="phone" type="tel" className="input" autoComplete="tel" /></Field>
        <Field label="Зоны ответственности и обязанности"><textarea name="responsibilities" className="input" /></Field>
        <Field label="О себе"><textarea name="about" className="input" /></Field>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="rules" required className="mt-1 h-4 w-4" />
          <span>Принимаю правила доступа: данные компании конфиденциальны, доступы не передаются третьим лицам, действия фиксируются в журнале.</span>
        </label>
        <Submit className="w-full">Присоединиться</Submit>
      </ActionForm>
      <p className="mt-3 text-xs text-muted">Роль, зарплата и права назначаются руководителем и не меняются через эту форму.</p>
    </AuthShell>
  );
}
