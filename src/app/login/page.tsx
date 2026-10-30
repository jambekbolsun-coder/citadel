import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "./login-form";
import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Notice } from "@/components/ui";

export const metadata = { title: "Вход" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : "/app";
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
      {sp.confirmed ? <div className="mb-4"><Notice tone="good">Email подтверждён. Войдите с паролем.</Notice></div> : null}
      <LoginForm next={next} />
      <p className="mt-4 text-xs text-muted">Доступ — только по персональному приглашению. Общих паролей нет.</p>
    </AuthShell>
  );
}
