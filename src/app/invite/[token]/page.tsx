import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { AcceptInviteForm, SignupForm } from "@/components/auth-forms";
import { logout } from "@/app/auth-actions";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { btn, Notice } from "@/components/ui";
import type { EmailQuota } from "@/lib/email-quota";

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
  const { data: quota } = session ? { data: null } : await supabase.rpc("email_quota");

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
      <AuthShell title="Присоединиться к SMM KADR" subtitle={`Используйте email, на который выписано приглашение (${p.email_hint})`}>
        {intro}
        <SignupForm next={`/invite/${token}`} fullName={p.full_name ?? ""} submitLabel="Создать аккаунт" quota={quota as EmailQuota | null} />
        <p className="mt-4 text-sm text-muted">
          Уже зарегистрировались или подтвердили email? <Link className="text-primary" href={`/login?next=/invite/${token}`}>Войти</Link>
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Заполните профиль" subtitle={`Вы вошли как ${session.email}`}>
      {intro}
      <AcceptInviteForm token={token} />
      <p className="mt-3 text-xs text-muted">Роль, зарплата и права назначаются руководителем и не меняются через эту форму.</p>
      <form action={logout} className="mt-4 border-t border-line pt-4 text-sm">
        <input type="hidden" name="next" value={`/invite/${token}`} />
        <p className="text-muted">Приглашение выписано на {p.email_hint}. Вошли другим аккаунтом?</p>
        <button className={btn("secondary", "mt-2 w-full")}>Выйти и войти другим email</button>
      </form>
    </AuthShell>
  );
}
