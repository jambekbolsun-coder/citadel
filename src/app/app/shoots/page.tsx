import Link from "next/link";
import { requireActive } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge, ButtonLink, Empty, PageHeader, Tabs } from "@/components/ui";
import { dateTime, time } from "@/lib/format";

export const metadata = { title: "Съёмки" };

export default async function Shoots({ searchParams }: PageProps<"/app/shoots">) {
  const sp = await searchParams;
  await requireActive();
  const supabase = await createClient();
  const view = typeof sp.view === "string" ? sp.view : "upcoming";
  let q = supabase.from("shoots").select("id,title,starts_at,ends_at,location,status,ambassador_needed,projects(id,name),shoot_participants(role,response)");
  q = view === "upcoming" ? q.eq("status", "planned").gte("ends_at", new Date().toISOString()).order("starts_at") : q.or(`status.neq.planned,ends_at.lt.${new Date().toISOString()}`).order("starts_at", { ascending: false }).limit(60);
  const { data } = await q;
  const rows = (data ?? []) as unknown as { id: string; title: string; starts_at: string; ends_at: string; location: string | null; status: string; ambassador_needed: boolean; projects: { id: string; name: string } | null; shoot_participants: { role: string; response: string }[] }[];
  return (
    <>
      <PageHeader title="Съёмки" subtitle="Дата и место — директор по планированию; состав и ТЗ — креативный директор; подтверждение — участники"
        actions={<ButtonLink href="/app/shoots/new">+ Запланировать</ButtonLink>} />
      <Tabs items={[{ key: "upcoming", label: "Предстоящие", href: "/app/shoots" }, { key: "past", label: "Прошедшие и отменённые", href: "/app/shoots?view=past" }]} active={view} />
      {rows.length === 0 ? <Empty title="Съёмок нет" /> : (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((s) => {
            const mob = s.shoot_participants.filter((p) => p.role === "mobilographer");
            const amb = s.shoot_participants.filter((p) => p.role === "ambassador");
            const empty = mob.length === 0 || (s.ambassador_needed && amb.length === 0);
            const confirmed = s.shoot_participants.length > 0 && s.shoot_participants.every((p) => p.response === "accepted");
            return (
              <Link key={s.id} href={`/app/shoots/${s.id}`} className="rounded-2xl border border-line bg-surface p-4 hover:border-primary">
                <div className="flex items-start justify-between gap-2">
                  <div><div className="font-semibold">{s.title}</div><div className="text-sm text-muted">{s.projects?.name}</div></div>
                  <Badge status={s.status === "planned" ? "pending" : s.status === "done" ? "done" : "cancelled"}>{s.status === "planned" ? "Запланирована" : s.status === "done" ? "Проведена" : "Отменена"}</Badge>
                </div>
                <div className="mt-2 text-sm">{dateTime(s.starts_at)}–{time(s.ends_at)} · {s.location ?? "место не указано"}</div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {empty ? <Badge tone="bad">Команда не назначена</Badge> : <Badge tone="info">Состав: {s.shoot_participants.length}</Badge>}
                  {!empty && <Badge tone={confirmed ? "good" : "warn"}>{confirmed ? "Все подтвердили" : "Ждём подтверждений"}</Badge>}
                  {!s.ambassador_needed && <Badge>амбассадор не нужен</Badge>}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
