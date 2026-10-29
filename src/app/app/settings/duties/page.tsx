import { requireActive } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { SettingsPage } from "@/components/settings-list";

export const metadata = { title: "Должность и обязанности" };

export default async function Duties() {
  const s = await requireActive();
  const p = s.profile!;
  const supabase = await createClient();
  const [{ data: roles }, { data: dept }] = await Promise.all([
    s.roles.length ? supabase.from("roles").select("code,name").in("code", s.roles) : Promise.resolve({ data: [] }),
    p.department_id ? supabase.from("departments").select("name").eq("id", p.department_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return (
    <SettingsPage title="Должность и обязанности" subtitle="Только для чтения. Изменения вносит руководитель.">
      <div className="space-y-4">
        <Card>
          <dl className="grid gap-3 text-sm">
            <div><dt className="text-muted">Должность</dt><dd className="font-semibold">{p.job_title || "не указана"}</dd></div>
            <div><dt className="text-muted">Отдел</dt><dd className="font-semibold">{(dept as { name: string } | null)?.name ?? "не указан"}</dd></div>
            <div><dt className="text-muted">Роли в системе</dt><dd className="font-semibold">{((roles ?? []) as { name: string }[]).map((r) => r.name).join(", ") || "не назначены"}</dd></div>
          </dl>
        </Card>
        <Card title="Утверждённые обязанности">
          <p className="whitespace-pre-wrap text-sm">{p.responsibilities || "Обязанности пока не описаны."}</p>
        </Card>
      </div>
    </SettingsPage>
  );
}
