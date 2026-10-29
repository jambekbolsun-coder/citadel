import { requireActive } from "@/lib/auth";
import { Card } from "@/components/ui";
import { SettingsPage } from "@/components/settings-list";
import { InstallButton } from "@/components/pwa";

export const metadata = { title: "Приложение" };

export default async function AppInfo() {
  await requireActive();
  return (
    <SettingsPage title="Установка и о приложении">
      <div className="space-y-4">
        <Card title="Установить на телефон">
          <InstallButton />
          <p className="mt-2 text-sm text-muted">Android: системное окно установки. iPhone: Safari → «Поделиться» → «На экран „Домой“». Push на iPhone работают только из установленного приложения (iOS 16.4+).</p>
        </Card>
        <Card title="О приложении">
          <dl className="grid gap-2 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-muted">Название</dt><dd>Цитадель · SMM KADR</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Версия</dt><dd>0.3</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Данные</dt><dd className="text-right">Приватные страницы не сохраняются в кэше устройства</dd></div>
          </dl>
        </Card>
      </div>
    </SettingsPage>
  );
}
