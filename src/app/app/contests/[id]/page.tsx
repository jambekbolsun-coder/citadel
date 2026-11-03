import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActive } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge, ButtonLink, Card, LoadError, PageHeader, cn } from "@/components/ui";
import { ActionForm, Submit } from "@/components/action-form";
import { date } from "@/lib/format";
import { bishkekDay } from "@/lib/mascot";
import { METRICS, PHASE_LABEL, daysLeft, medal, metricText, phaseOf, type Contest, type Metrics, type Row } from "@/lib/contests";
import { cancelContest, issueBonuses, revealContest } from "../actions";
import { Ceremony, Podium } from "../podium";

export const metadata = { title: "Сезон соревнования" };

function Breakdown({ m, weights }: { m: Metrics; weights: Contest["weights"] }) {
  return (
    <ul className="divide-y divide-line">
      {METRICS.map((x) => {
        const v = m[x.key];
        return (
          <li key={x.key} className="flex items-center gap-3 py-2 text-sm">
            <span className="min-w-0 flex-1"><span className="font-semibold">{x.label}</span> <span className="text-xs text-muted">· вес {weights[x.key] ?? 0}</span></span>
            <span className="w-24 shrink-0"><span className="block h-2 overflow-hidden rounded-full bg-surface-2"><span className="block h-full rounded-full bg-primary" style={{ width: `${Math.max(0, v ?? 0)}%` }} /></span></span>
            <span className="w-12 shrink-0 text-right font-semibold tabular-nums">{metricText(v)}</span>
          </li>
        );
      })}
    </ul>
  );
}

function Facts({ m }: { m: Metrics }) {
  return (
    <p className="mt-2 text-xs text-muted">
      Назначено со сроком: {m.due} · сдано: {m.finished} · вовремя: {m.on_time} · возвратов на правки: {m.revisions} из {m.submissions} · дней в приложении: {m.active_days} из {m.work_days}
    </p>
  );
}

export default async function ContestPage({ params }: PageProps<"/app/contests/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const s = await requireActive();
  const supabase = await createClient();
  const manager = s.can("contests.manage");
  const { data, error } = await supabase.from("contests").select("*").eq("id", id).maybeSingle();
  if (error) return <LoadError title="Не удалось открыть сезон" text={error.message} back="/app/contests" />;
  if (!data) notFound();
  const c = data as Contest;
  const today = bishkekDay();
  const ph = phaseOf(c, today);

  const [mine, board, results] = await Promise.all([
    c.status === "active" ? supabase.rpc("my_contest_score", { p_contest: id }) : Promise.resolve({ data: null }),
    manager && c.status === "active" ? supabase.rpc("contest_leaderboard", { p_contest: id }) : Promise.resolve({ data: null, error: null }),
    c.status === "revealed" ? supabase.from("contest_results").select("user_id,group_key,group_label,score,place,eligible,metrics,profiles!contest_results_user_id_fkey(full_name)").eq("contest_id", id).order("place", { nullsFirst: false }) : Promise.resolve({ data: null }),
  ]);
  const my = mine.data as { score: number; eligible: boolean; metrics: Metrics } | null;
  const rows: Row[] = c.status === "revealed"
    ? ((results.data ?? []) as unknown as (Omit<Row, "full_name"> & { profiles: { full_name: string } | null })[]).map((r) => ({ ...r, full_name: r.profiles?.full_name ?? "—" }))
    : ((board.data ?? []) as Row[]);
  const groups = [...new Set(rows.map((r) => r.group_key))];
  const myRow = rows.find((r) => r.user_id === s.userId);
  const hasMoneyPrizes = c.prizes.some((p) => p.amount_minor > 0);

  return (
    <>
      <PageHeader back="/app/contests" title={c.title} subtitle={`${date(c.starts_on)} – ${date(c.ends_on)} · ${PHASE_LABEL[ph]}${ph === "running" ? ` · осталось ${daysLeft(c.ends_on, today)} дн.` : ""}`}
        actions={manager && c.status === "active" ? <ButtonLink href={`/app/contests/new?edit=${c.id}`} variant="secondary">Изменить</ButtonLink> : null} />
      {c.description && <p className="mb-4 text-sm text-muted">{c.description}</p>}

      {c.status === "revealed" && (
        <Ceremony contestId={c.id} title={c.title} myPlace={myRow?.place ?? null}
          winners={rows.filter((r) => r.place !== null && r.place <= 3).slice(0, 9).map((r) => ({ place: r.place!, name: groups.length > 1 ? `${r.full_name} (${r.group_label})` : r.full_name }))} />
      )}

      {/* мои баллы во время сезона */}
      {c.status === "active" && my && (
        <Card className="mb-4" title="Мои баллы">
          <div className="flex items-end gap-3">
            <div className="font-display text-5xl font-extrabold text-primary">{my.score}</div>
            <div className="pb-1.5 text-sm text-muted">из 100{!my.eligible && ` · для места нужно ещё назначенных работ (минимум ${c.min_items})`}</div>
          </div>
          <Breakdown m={my.metrics} weights={c.weights} />
          <Facts m={my.metrics} />
          <p className="mt-2 text-xs text-muted">Места и баллы коллег откроются, когда руководитель объявит итоги после {date(c.ends_on)}.</p>
        </Card>
      )}
      {c.status === "active" && !my && !manager && <Card className="mb-4"><p className="text-sm text-muted">Вы не участвуете в этом сезоне.</p></Card>}

      {/* итоги: пьедестал по группам */}
      {c.status === "revealed" && groups.map((g) => {
        const gr = rows.filter((r) => r.group_key === g);
        return (
          <Card key={g} className="mb-4" title={groups.length > 1 ? gr[0]?.group_label ?? "Группа" : "Победители"}>
            <Podium rows={gr} prizes={c.prizes} me={s.userId} />
          </Card>
        );
      })}

      {/* управление сезоном */}
      {manager && (
        <Card className="mb-4" title="Управление">
          <div className="flex flex-wrap gap-2">
            {c.status === "active" && (
              ph === "ended" ? (
                <ActionForm action={revealContest} confirm="Показать результаты всем участникам? После этого баллы фиксируются.">
                  <input type="hidden" name="id" value={c.id} />
                  <Submit>🏆 Показать результаты</Submit>
                </ActionForm>
              ) : <p className="text-sm text-muted">Кнопка «Показать результаты» появится {date(new Date(Date.parse(c.ends_on) + 86_400_000).toISOString().slice(0, 10))} — после окончания сезона.</p>
            )}
            {c.status === "revealed" && hasMoneyPrizes && s.can("payroll.manage") && !c.bonuses_issued_at && (
              <ActionForm action={issueBonuses} confirm="Создать черновики премий победителям в «Зарплатах»?">
                <input type="hidden" name="id" value={c.id} />
                <Submit>Начислить премии</Submit>
              </ActionForm>
            )}
            {c.bonuses_issued_at && <Link href="/app/payroll" className="text-sm font-semibold text-primary">Премии начислены — утвердить в «Зарплатах» →</Link>}
            {c.status === "active" && (
              <ActionForm action={cancelContest} confirm="Отменить сезон? Баллы не сохранятся.">
                <input type="hidden" name="id" value={c.id} />
                <Submit variant="secondary">Отменить сезон</Submit>
              </ActionForm>
            )}
          </div>
        </Card>
      )}

      {/* таблица: живой рейтинг владельцу / итоги всем после объявления */}
      {rows.length > 0 && (
        <Card className="p-0 md:p-0" title={c.status === "revealed" ? "Все результаты" : "Рейтинг сейчас (видите только вы)"}>
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.user_id} className={cn("px-4 py-3", r.user_id === s.userId && "bg-brand-soft/40")}>
                <details>
                  <summary className="flex cursor-pointer list-none items-center gap-3">
                    <span className="w-9 shrink-0 text-center font-display text-lg font-extrabold">{r.place ? (medal(r.place) || r.place) : "—"}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{r.full_name}</span>
                      <span className="block text-xs text-muted">{groups.length > 1 ? `${r.group_label} · ` : ""}{r.eligible ? `сдано ${r.metrics.finished} из ${r.metrics.due}` : `мало работ для места (${r.metrics.due})`}</span>
                    </span>
                    <span className="shrink-0 font-display text-xl font-extrabold tabular-nums">{r.score}</span>
                  </summary>
                  <div className="mt-2"><Breakdown m={r.metrics} weights={c.weights} /><Facts m={r.metrics} /></div>
                </details>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {manager && c.status === "active" && rows.length === 0 && <Card><p className="text-sm text-muted">Пока нет участников по выбранным условиям.</p></Card>}
      {c.status === "revealed" && <p className="mt-3 text-xs text-muted"><Badge>итоги зафиксированы {date(c.revealed_at)}</Badge></p>}
    </>
  );
}
