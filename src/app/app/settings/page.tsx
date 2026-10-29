import Link from "next/link";
import { LogOut } from "lucide-react";
import { requireActive } from "@/lib/auth";
import { Avatar } from "@/components/ui";
import { SettingsGroups } from "@/components/settings-list";
import { logout } from "@/app/auth-actions";
import { settingsGroups } from "@/lib/nav";

export const metadata = { title: "Настройки" };

// Корень настроек — только сведения сессии; тяжёлые данные грузят вложенные экраны при открытии
export default async function Settings() {
  const s = await requireActive();
  const p = s.profile!;
  return (
    <div className="mx-auto w-full max-w-2xl">
      <h1 className="sr-only">Настройки</h1>
      <div className="mb-7 flex flex-col items-center pt-2 text-center">
        <Link href="/app/settings/profile" aria-label="Редактировать профиль" className="rounded-full">
          <Avatar name={p.full_name} url={p.avatar_url} size={88} />
        </Link>
        <div className="mt-3 font-display text-xl font-semibold [overflow-wrap:anywhere]">{p.full_name || s.email}</div>
        <div className="mt-0.5 text-sm text-muted">{[p.job_title, "SMM KADR"].filter(Boolean).join(" · ")}</div>
        <Link href="/app/settings/profile" className="mt-3 inline-flex min-h-10 items-center rounded-full bg-surface px-4 text-sm font-semibold ring-1 ring-line">
          Редактировать профиль
        </Link>
      </div>
      <SettingsGroups groups={settingsGroups(s)} />
      <form action={logout} className="mb-4">
        <button className="row w-full justify-center rounded-2xl border border-line bg-surface font-semibold text-bad">
          <LogOut size={18} /> Выйти из аккаунта
        </button>
      </form>
      <p className="pb-2 text-center text-xs text-muted">{s.email}</p>
    </div>
  );
}
