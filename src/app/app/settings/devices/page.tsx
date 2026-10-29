import { requireActive } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { SettingsPage } from "@/components/settings-list";
import { PinSetup } from "../device-panel";
import { removePin, savePin } from "../actions";

export const metadata = { title: "PIN и устройства" };

export default async function Devices() {
  const s = await requireActive();
  const supabase = await createClient();
  const { data } = await supabase.from("device_pins").select("device_id,device_name,last_used_at").eq("user_id", s.userId);
  return (
    <SettingsPage title="PIN-код и доверенные устройства">
      <Card>
        <PinSetup userId={s.userId} action={savePin} removeAction={removePin} devices={(data ?? []) as { device_id: string; device_name: string | null; last_used_at: string | null }[]} />
      </Card>
    </SettingsPage>
  );
}
