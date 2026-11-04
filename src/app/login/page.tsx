import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "@/components/auth-forms";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Notice } from "@/components/ui";
import { safeNext } from "@/lib/safe-next";

export const metadata = { title: "Вход" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  const session = await getSession();
  if (session) redirect(next);
  const supabase = await createClient();
  const { data: ownerExists } = await supabase.rpc("owner_exists");
  return (
    <AuthShell
      title="Вход в SMM KADR"
      subtitle="Рабочее пространство SMM KADR"
      footer={!ownerExists ? <Link href="/setup" className="font-semibold text-primary">Первичная настройка владельца</Link> : <Link href="/reset-password" className="hover:text-ink">Забыли пароль?</Link>}
    >
      {sp.confirmed ? <div className="mb-4"><Notice tone="good">Email подтверждён. Войдите с паролем, который вы придумали при регистрации.</Notice></div> : null}
      {sp.link ? <div className="mb-4"><Notice>Ссылка из письма открыта в другом браузере или приложении. Если вы подтверждали email — он уже подтверждён: войдите с паролем, который придумали. Не помните пароль — «Забыли пароль?».</Notice></div> : null}
      {sp.expired ? <div className="mb-4"><Notice tone="warn">Ссылка из письма устарела или уже использована. Войдите с паролем или запросите новое письмо.</Notice></div> : null}
      <LoginForm next={next} />
      <p className="mt-4 text-xs text-muted">Доступ — только по персональному приглашению. Общих паролей нет.</p>
    </AuthShell>
  );
}
