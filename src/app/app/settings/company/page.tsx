import { redirect } from "next/navigation";
import { requireActive } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { ActionForm, Submit } from "@/components/action-form";
import { SettingsPage } from "@/components/settings-list";
import { saveAppSetting } from "../actions";

export const metadata = { title: "Параметры компании" };

export default async function Company() {
  const s = await requireActive();
  if (!s.isOwner) redirect("/app/settings");
  const supabase = await createClient();
  const { data } = await supabase.from("app_settings").select("key,value,label").order("key");
  return (
    <SettingsPage title="Параметры компании" subtitle="Изменения записываются в журнал аудита">
      <Card>
        <div className="space-y-4">
          {((data ?? []) as { key: string; value: string; label: string | null }[]).map((x) => (
            <ActionForm key={x.key} action={saveAppSetting} className="grid grid-cols-[1fr_auto] items-end gap-2">
              <input type="hidden" name="key" value={x.key} />
              <label className="block">
                <span className="label">{x.label ?? x.key}</span>
                <input name="value" defaultValue={x.key === "work_days" ? (JSON.parse(x.value) as number[]).join(",") : x.value} className="input" />
              </label>
              <Submit variant="secondary">OK</Submit>
            </ActionForm>
          ))}
        </div>
      </Card>
    </SettingsPage>
  );
}
