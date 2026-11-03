"use client";
import { useState } from "react";
import { KeepForm } from "@/components/keep-form";
import { btn, cn } from "@/components/ui";
import { METRICS, type Contest } from "@/lib/contests";
import { saveContest } from "./actions";

type Opt = { id: string; name: string };

/** Создание и правка сезона. Поля не очищаются при ошибке (KeepForm). */
export function ContestForm({ contest, defaults, departments, roles }: { contest?: Contest; defaults: { from: string; to: string; title: string }; departments: Opt[]; roles: Opt[] }) {
  const [scope, setScope] = useState<Contest["scope"]>(contest?.scope ?? "all");
  const [w, setW] = useState<Record<string, number>>(contest?.weights ?? Object.fromEntries(METRICS.map((m) => [m.key, m.def])));
  const total = Object.values(w).reduce((a, b) => a + (Number(b) || 0), 0);
  const prize = (place: number) => contest?.prizes.find((p) => p.place === place);
  return (
    <KeepForm action={saveContest} className="mx-auto max-w-2xl space-y-4">
      {(pending) => (
        <>
          {contest && <input type="hidden" name="id" value={contest.id} />}
          <section className="space-y-3 rounded-2xl border border-line bg-surface p-4">
            <label className="block"><span className="label">Название сезона *</span><input name="title" required minLength={2} maxLength={120} defaultValue={contest?.title ?? defaults.title} className="input" /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block"><span className="label">Начало</span><input type="date" name="starts_on" required defaultValue={contest?.starts_on ?? defaults.from} className="input" /></label>
              <label className="block"><span className="label">Окончание</span><input type="date" name="ends_on" required defaultValue={contest?.ends_on ?? defaults.to} className="input" /></label>
            </div>
            <label className="block"><span className="label">Описание для сотрудников</span><textarea name="description" rows={2} maxLength={500} defaultValue={contest?.description ?? ""} placeholder="Например: лучший по итогам месяца получает аванс" className="input" /></label>
          </section>

          <section className="space-y-3 rounded-2xl border border-line bg-surface p-4">
            <div className="font-semibold">Кто участвует</div>
            <div role="radiogroup" className="grid grid-cols-3 gap-1 rounded-2xl bg-surface-2 p-1 text-sm">
              {([["all", "Все"], ["departments", "Отделы"], ["roles", "Роли"]] as const).map(([v, l]) => (
                <label key={v} className={cn("flex min-h-11 cursor-pointer items-center justify-center rounded-xl font-semibold", scope === v ? "bg-surface shadow-sm" : "text-muted")}>
                  <input type="radio" name="scope" value={v} checked={scope === v} onChange={() => setScope(v)} className="sr-only" /> {l}
                </label>
              ))}
            </div>
            {scope === "departments" && (
              <div className="grid gap-1 sm:grid-cols-2">
                {departments.length ? departments.map((d) => <label key={d.id} className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" name="departments" value={d.id} defaultChecked={contest?.scope_ids.includes(d.id)} className="h-4 w-4" /> {d.name}</label>)
                  : <p className="text-sm text-muted">Отделов пока нет — создайте их в «Сотрудники → Отделы».</p>}
              </div>
            )}
            {scope === "roles" && (
              <div className="grid gap-1 sm:grid-cols-2">
                {roles.map((r) => <label key={r.id} className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" name="roles" value={r.id} defaultChecked={contest?.scope_ids.includes(r.id)} className="h-4 w-4" /> {r.name}</label>)}
              </div>
            )}
            <label className="block">
              <span className="label">Рейтинг</span>
              <select name="ranking" defaultValue={contest?.ranking ?? "overall"} className="input">
                <option value="overall">Общий — одни 1–2–3 места на всех</option>
                <option value="by_department">Внутри каждого отдела — свои 1–2–3 места</option>
              </select>
            </label>
            <p className="text-xs text-muted">Владелец не участвует. Баллы — в процентах от назначенной работы, поэтому разные должности сравнимы.</p>
          </section>

          <section className="space-y-3 rounded-2xl border border-line bg-surface p-4">
            <div className="flex items-baseline justify-between gap-3"><span className="font-semibold">Что считается и насколько важно</span><span className="text-xs text-muted">сумма весов: {total}</span></div>
            {METRICS.map((m) => (
              <label key={m.key} className="grid grid-cols-[1fr_76px] items-center gap-3">
                <span><span className="block text-sm font-semibold">{m.label}</span><span className="block text-xs text-muted">{m.hint}</span></span>
                <input name={`w_${m.key}`} type="number" min={0} max={100} inputMode="numeric" value={w[m.key] ?? 0} onChange={(e) => setW({ ...w, [m.key]: Number(e.target.value) })} className="input text-center" />
              </label>
            ))}
            <label className="grid grid-cols-[1fr_76px] items-center gap-3">
              <span><span className="block text-sm font-semibold">Минимум работ для места</span><span className="block text-xs text-muted">меньше — сотрудник видит баллы, но не попадает в 1–2–3</span></span>
              <input name="min_items" type="number" min={0} max={100} inputMode="numeric" defaultValue={contest?.min_items ?? 3} className="input text-center" />
            </label>
          </section>

          <section className="space-y-3 rounded-2xl border border-line bg-surface p-4">
            <div className="font-semibold">Призы</div>
            {[1, 2, 3].map((p) => (
              <div key={p} className="grid grid-cols-[32px_1fr_1fr] items-center gap-2">
                <span className="text-xl" aria-label={`${p}-е место`}>{p === 1 ? "🥇" : p === 2 ? "🥈" : "🥉"}</span>
                <input name={`prize_${p}`} inputMode="decimal" placeholder="Премия, сом" defaultValue={prize(p)?.amount_minor ? String(prize(p)!.amount_minor / 100) : ""} className="input" />
                <input name={`prize_text_${p}`} maxLength={120} placeholder="или приз словами" defaultValue={prize(p)?.text ?? ""} className="input" />
              </div>
            ))}
            <p className="text-xs text-muted">Сумма в сомах — после объявления итогов кнопка «Начислить премии» создаст черновики в «Зарплатах». Приз словами просто показывается на церемонии.</p>
          </section>

          <div className="sticky-actions md:bottom-4">
            <button type="submit" disabled={pending} className={btn("primary", "w-full")}>{pending ? "Сохраняем…" : contest ? "Сохранить изменения" : "Запустить сезон"}</button>
          </div>
        </>
      )}
    </KeepForm>
  );
}
