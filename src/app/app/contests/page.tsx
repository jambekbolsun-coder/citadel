import Link from "next/link";
import { requireActive } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge, ButtonLink, Card, Empty, LoadError, PageHeader } from "@/components/ui";
import { date } from "@/lib/format";
import { bishkekDay } from "@/lib/mascot";
import { METRICS, PHASE_LABEL, daysLeft, medal, phaseOf, type Contest } from "@/lib/contests";

export const metadata = { title: "Соревнования" };

type Mine = { score: number; eligible: boolean } | null;

export default async function Contests() {
  const s = await requireActive();
  const supabase = await createClient();
  const manager = s.can("contests.manage");
  const today = bishkekDay();
  const { data, error } = await supabase.from("contests").select("*").neq("status", "cancelled").order("starts_on", { ascending: false }).limit(30);
  if (error) return <LoadError title="Не удалось загрузить соревнования" text={error.message} />;
  const list = (data ?? []) as Contest[];
  const live = list.filter((c) => c.status === "active");
  const done = list.filter((c) => c.status === "revealed");
  const [mine, podiums] = await Promise.all([
    Promise.all(live.map(async (c) => ((await supabase.rpc("my_contest_score", { p_contest: c.id })).data ?? null) as Mine)),
    done.length
      ? supabase.from("contest_results").select("contest_id,place,user_id,profiles!contest_results_user_id_fkey(full_name)").in("contest_id", done.map((c) => c.id)).lte("place", 3).order("place")
      : Promise.resolve({ data: [] }),
  ]);
  const winners = (podiums.data ?? []) as unknown as { contest_id: string; place: number; user_id: string; profiles: { full_name: string } | null }[];

  return (
    <>
      <PageHeader title="Соревнования" subtitle="Кто сдаёт работу вовремя и без правок — получает баллы. Итоги объявляет руководитель."
        actions={manager ? <ButtonLink href="/app/contests/new">+ Новый сезон</ButtonLink> : null} />

      {live.length === 0 && done.length === 0 ? (
        <Empty title="Сезонов пока нет" text={manager ? "Запустите первый сезон — сотрудники сразу увидят свои баллы." : "Когда руководитель запустит сезон, здесь появятся ваши баллы."}
          action={manager ? <ButtonLink href="/app/contests/new">Запустить сезон</ButtonLink> : undefined} />
      ) : null}

      {live.length > 0 && (
        <div className="mb-6 grid gap-3 md:grid-cols-2">
          {live.map((c, i) => {
            const ph = phaseOf(c, today);
            const m = mine[i];
            return (
              <Link key={c.id} href={`/app/contests/${c.id}`} className="block rounded-3xl border border-line bg-surface p-4 transition active:scale-[.99] md:hover:border-brand">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{c.title}</div>
                    <div className="text-xs text-muted">{date(c.starts_on)} – {date(c.ends_on)} · {ph === "running" ? `осталось ${daysLeft(c.ends_on, today)} дн.` : PHASE_LABEL[ph]}</div>
                  </div>
                  <Badge tone={ph === "ended" ? "warn" : "good"}>{PHASE_LABEL[ph]}</Badge>
                </div>
                {m ? (
                  <div className="mt-3 flex items-end gap-3">
                    <div className="font-display text-4xl font-extrabold text-primary">{m.score}</div>
                    <div className="pb-1 text-sm text-muted">ваших баллов из 100{!m.eligible && " · пока мало работ для места"}</div>
                  </div>
                ) : <p className="mt-3 text-sm text-muted">{manager ? "Открыть рейтинг участников" : "Вы не участвуете в этом сезоне"}</p>}
                {c.prizes.length > 0 && <div className="mt-2 flex flex-wrap gap-2 text-xs">{c.prizes.map((p) => <span key={p.place} className="rounded-full bg-surface-2 px-2 py-1">{medal(p.place)} {[p.amount_minor ? `${(p.amount_minor / 100).toLocaleString("ru-RU")} сом` : "", p.text].filter(Boolean).join(" · ")}</span>)}</div>}
              </Link>
            );
          })}
        </div>
      )}

      {done.length > 0 && (
        <>
          <h2 className="group-title">Зал славы</h2>
          <div className="mb-6 grid gap-3 md:grid-cols-2">
            {done.map((c) => (
              <Link key={c.id} href={`/app/contests/${c.id}`} className="block rounded-3xl border border-line bg-surface p-4 md:hover:border-brand">
                <div className="font-semibold">{c.title}</div>
                <div className="text-xs text-muted">{date(c.starts_on)} – {date(c.ends_on)}</div>
                <ul className="mt-2 space-y-0.5 text-sm">
                  {winners.filter((w) => w.contest_id === c.id).slice(0, 6).map((w) => <li key={w.user_id}>{medal(w.place)} {w.profiles?.full_name}</li>)}
                </ul>
              </Link>
            ))}
          </div>
        </>
      )}

      <Card title="Как считаются баллы">
        <ul className="space-y-1.5 text-sm">
          {METRICS.map((m) => <li key={m.key}><b>{m.label}</b> — {m.hint}</li>)}
        </ul>
        <p className="mt-2 text-xs text-muted">Баллы 0–100 — средневзвешенное этих долей. Показатель без данных (например, у вас нет сторис) не снижает баллы. До объявления итогов каждый видит только свои баллы.</p>
      </Card>
    </>
  );
}
