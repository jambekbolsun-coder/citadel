import { requireActive } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { LoadError, PageHeader } from "@/components/ui";
import { bishkekDay } from "@/lib/mascot";
import { monthBounds, type Contest } from "@/lib/contests";
import { ContestForm } from "../contest-form";

export const metadata = { title: "Новый сезон" };
const MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];

export default async function NewContest({ searchParams }: PageProps<"/app/contests/new">) {
  const sp = await searchParams;
  await requireActive("contests.manage");
  const supabase = await createClient();
  const editId = typeof sp.edit === "string" && /^[0-9a-f-]{36}$/i.test(sp.edit) ? sp.edit : null;
  const [{ data: deps }, { data: roles }, edit] = await Promise.all([
    supabase.from("departments").select("id,name").is("archived_at", null).order("name"),
    supabase.from("roles").select("code,name").neq("code", "owner").order("sort"),
    editId ? supabase.from("contests").select("*").eq("id", editId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (editId && (!edit.data || edit.data.status !== "active")) return <LoadError title="Этот сезон уже нельзя изменить" back="/app/contests" />;
  const today = bishkekDay();
  const { from, to } = monthBounds(today);
  const title = `Лучший сотрудник — ${MONTHS[Number(today.slice(5, 7)) - 1]}`;
  return (
    <>
      <PageHeader back="/app/contests" title={editId ? "Изменить сезон" : "Новый сезон"} subtitle="Сотрудники видят только свои баллы, пока вы не нажмёте «Показать результаты»" />
      <ContestForm
        contest={(edit.data as Contest | null) ?? undefined}
        defaults={{ from: today > from ? today : from, to, title }}
        departments={((deps ?? []) as { id: string; name: string }[])}
        roles={((roles ?? []) as { code: string; name: string }[]).map((r) => ({ id: r.code, name: r.name }))}
      />
    </>
  );
}
