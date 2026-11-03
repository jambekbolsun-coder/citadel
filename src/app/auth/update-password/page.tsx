import { redirect } from "next/navigation";
import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { NewPasswordForm } from "@/components/auth-forms";
import { getSession } from "@/lib/auth";

export const metadata = { title: "Новый пароль" };

export default async function UpdatePassword() {
  const s = await getSession();
  if (!s) redirect("/reset-password?expired=1");
  return (
    <AuthShell title="Новый пароль" subtitle={s.email ?? undefined} footer={<Link href="/app">В приложение →</Link>}>
      <NewPasswordForm />
    </AuthShell>
  );
}
