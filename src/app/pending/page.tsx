import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { getSession } from "@/lib/auth";
import { logout } from "@/app/auth-actions";
import { Notice, btn } from "@/components/ui";
import Link from "next/link";

export const metadata = { title: "Ожидание доступа" };

export default async function Pending({ searchParams }: PageProps<"/pending">) {
  const sp = await searchParams;
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.profile?.status === "active") redirect("/app");
  const blocked = s.profile?.status === "blocked";
  const noInvite = s.roles.length === 0;
  return (
    <AuthShell title={blocked ? "Доступ заблокирован" : "Ожидание утверждения"} subtitle={s.email ?? undefined}>
      {blocked ? (
        <Notice tone="bad">Ваш доступ к данным компании закрыт. Обратитесь к руководителю.</Notice>
      ) : noInvite ? (
        <Notice tone="warn">Аккаунт не привязан к приглашению. Откройте персональную ссылку или QR-код от руководителя.</Notice>
      ) : (
        <div className="space-y-3">
          {sp.joined ? <Notice tone="good">Вы присоединились к SMM KADR. Установите приложение на телефон.</Notice> : null}
          <Notice>Владелец проверит профиль и откроет доступ. До утверждения данные компании недоступны.</Notice>
        </div>
      )}
      <div className="mt-5 flex gap-2">
        <Link href="/pending" className={btn("secondary")}>Проверить снова</Link>
        <form action={logout}><button className={btn("ghost")}>Выйти</button></form>
      </div>
    </AuthShell>
  );
}
