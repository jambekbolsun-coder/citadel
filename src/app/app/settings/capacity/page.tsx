import { requireActive } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { ActionForm, Submit } from "@/components/action-form";
import { SettingsPage } from "@/components/settings-list";
import { saveCapacity } from "../actions";

export const metadata = { title: "Нормативы производства" };

export default async function Capacity() {
  await requireActive("projects.manage");
  const supabase = await createClient();
  const { data } = await supabase.from("capacity_rules").select("key,label,value,unit").order("key");
  return (
    <SettingsPage title="Нормативы производства" subtitle="Без утверждённых нормативов система не считает часы и показывает «ёмкость не рассчитана».">
      <Card>
        <div className="space-y-4">
          {((data ?? []) as { key: string; label: string; value: number | null; unit: string }[]).map((c) => (
            <ActionForm key={c.key} action={saveCapacity} className="grid grid-cols-[1fr_auto] items-end gap-2">
              <input type="hidden" name="key" value={c.key} />
              <label className="block">
                <span className="label">
                  {c.label} <span className="font-normal">({c.unit})</span>
                </span>
                <input name="value" defaultValue={c.value ?? ""} placeholder="не задано" inputMode="decimal" className="input" />
              </label>
              <Submit variant="secondary">OK</Submit>
            </ActionForm>
          ))}
        </div>
      </Card>
    </SettingsPage>
  );
}
