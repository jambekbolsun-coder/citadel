import Link from "next/link";
import { requireActive } from "@/lib/auth";
import { Card, btn } from "@/components/ui";
import { SettingsPage } from "@/components/settings-list";
import { logout } from "@/app/auth-actions";
import { SignOutEverywhere } from "../device-panel";

export const metadata = { title: "Выход и сеансы" };

export default async function Sessions() {
  await requireActive();
  return (
    <SettingsPage title="Выход и сеансы">
      <div className="space-y-4">
        <Card title="Это устройство">
          <p className="mb-3 text-sm text-muted">Выход завершит сеанс только в этом браузере.</p>
          <form action={logout}>
            <button className={btn("secondary", "w-full")}>Выйти на этом устройстве</button>
          </form>
        </Card>
        <Card title="Все устройства">
          <p className="mb-3 text-sm text-muted">Аннулирует вход везде — на телефоне, компьютере и в установленном приложении. Понадобится снова ввести пароль.</p>
          <SignOutEverywhere />
        </Card>
        <Link href="/auth/update-password" className="row rounded-2xl border border-line bg-surface">
          Изменить пароль (завершает другие сеансы) →
        </Link>
      </div>
    </SettingsPage>
  );
}
