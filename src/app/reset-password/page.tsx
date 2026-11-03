import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { ResetRequestForm } from "@/components/auth-forms";
import { Notice } from "@/components/ui";

export const metadata = { title: "Восстановление пароля" };

export default async function ResetPassword({ searchParams }: PageProps<"/reset-password">) {
  const sp = await searchParams;
  return (
    <AuthShell title="Восстановление пароля" footer={<Link href="/login">← Ко входу</Link>}>
      {sp.expired ? <div className="mb-4"><Notice tone="warn">Ссылка для смены пароля устарела или уже использована. Запросите новую и откройте самое последнее письмо.</Notice></div> : null}
      <ResetRequestForm />
    </AuthShell>
  );
}
