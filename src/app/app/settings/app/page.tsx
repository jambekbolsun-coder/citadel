import { requireActive } from "@/lib/auth";
import { Card } from "@/components/ui";
import { SettingsPage } from "@/components/settings-list";
import { InstallButton, ResetAppButton } from "@/components/pwa";
import { APP_VERSION } from "@/lib/version";

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
        <Card title="Обновление">
          <p className="text-sm text-muted">Приложение обновляется само при открытии. Если видите старый логотип или старый экран — нажмите кнопку: кеш этого устройства очистится, загрузится свежая версия. Вход и данные сохраняются.</p>
          <ResetAppButton className="mt-3 w-full" />
          <p className="mt-2 text-xs text-muted">Значок на главном экране: Android обновляет его сам (обычно в течение суток после запуска приложения, иногда спрашивает «Обновить приложение?» — согласитесь). iPhone значок не обновляет — удалите его и снова добавьте из Safari.</p>
        </Card>
        <Card title="О приложении">
          <dl className="grid gap-2 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-muted">Название</dt><dd>SMM KADR</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Версия</dt><dd>{APP_VERSION}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Данные</dt><dd className="text-right">Приватные страницы не сохраняются в кэше устройства</dd></div>
          </dl>
        </Card>
      </div>
    </SettingsPage>
  );
}
