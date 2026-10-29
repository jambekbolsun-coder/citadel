import Link from "next/link";
import { requireActive } from "@/lib/auth";
import { Card } from "@/components/ui";
import { SettingsPage } from "@/components/settings-list";
import { PushToggle } from "../device-panel";

export const metadata = { title: "Push-уведомления" };

export default async function PushSettings() {
  await requireActive();
  return (
    <SettingsPage title="Push-уведомления" subtitle="Системные уведомления приходят, даже когда приложение закрыто. Включаются отдельно на каждом устройстве.">
      <div className="space-y-4">
        <Card><PushToggle /></Card>
        <Link href="/app/notifications" className="row rounded-2xl border border-line bg-surface">Все уведомления →</Link>
      </div>
    </SettingsPage>
  );
}
