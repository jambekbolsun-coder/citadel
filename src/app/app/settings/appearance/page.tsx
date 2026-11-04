import { requireActive } from "@/lib/auth";
import { Card } from "@/components/ui";
import { SettingsPage } from "@/components/settings-list";
import { ThemePicker } from "@/components/theme-picker";
import { saveTheme } from "../actions";

export const metadata = { title: "Тема и язык" };

export default async function Appearance() {
  await requireActive();
  return (
    <SettingsPage title="Тема и язык">
      <div className="space-y-4">
        <Card title="Тема"><ThemePicker saveTheme={saveTheme} /></Card>
        <Card title="Язык и формат">
          <p className="text-sm">Русский · даты и время по Бишкеку (Asia/Bishkek) · неделя с понедельника.</p>
          <p className="mt-1 text-xs text-muted">Другие языки появятся здесь после перевода интерфейса.</p>
        </Card>
      </div>
    </SettingsPage>
  );
}
