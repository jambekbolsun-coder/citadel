"use client";
import { useRef, useState, useTransition } from "react";
import { btn } from "@/components/ui";
import { money } from "@/lib/format";
import { addSpend } from "./actions";

type Creative = { id: string; seq: number; title: string; currency: string; status: string };
const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(16).padStart(8, "0")}-0000-4000-8000-${Math.random().toString(16).slice(2, 14).padEnd(12, "0")}`);

/**
 * Быстрая запись результата: дата → видео (или вся кампания) → сумма и показатели.
 * Ключ повторной отправки живёт до успешного ответа сервера: двойное нажатие, повтор после обрыва связи
 * и обновление страницы не создают второй расход. При ошибке введённые значения не сбрасываются.
 */
export function SpendForm({ campaignId, campaignCurrency, creatives, today, unallocated }: { campaignId: string; campaignCurrency: string; creatives: Creative[]; today: string; unallocated: Record<string, number> }) {
  const [state, setState] = useState<Awaited<ReturnType<typeof addSpend>>>(null);
  const [pending, startTransition] = useTransition();
  const [key, setKey] = useState(newKey);
  const [creative, setCreative] = useState("");
  const [day, setDay] = useState(today);
  const [cur, setCur] = useState(campaignCurrency);
  const [offline, setOffline] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const picked = creatives.find((c) => c.id === creative);
  const currency = picked?.currency ?? cur;
  const free = unallocated[`${day}|${currency}`] ?? 0;

  return (
    <form
      ref={form}
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!navigator.onLine) {
          setOffline(true);
          return;
        }
        setOffline(false);
        const fd = new FormData(e.currentTarget);
        startTransition(async () => {
          const res = await addSpend(null, fd).catch((): Awaited<ReturnType<typeof addSpend>> => ({ error: "Сервер не ответил. Если запись дошла, повторная отправка её не удвоит." }));
          setState(res);
          if (res?.ok) {
            form.current?.reset();
            setCreative("");
            setDay(today);
            setKey(newKey());
          }
        });
      }}
    >
      <input type="hidden" name="id" value={campaignId} />
      <input type="hidden" name="key" value={key} />
      <input type="hidden" name="currency" value={currency} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">1. Дата</span>
          <input name="day" type="date" required max={today} value={day} onChange={(e) => setDay(e.target.value)} className="input" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">2. Видео</span>
          <select name="creative_id" value={creative} onChange={(e) => setCreative(e.target.value)} className="input">
            <option value="">Вся кампания (не по видео)</option>
            {creatives.map((c) => (
              <option key={c.id} value={c.id}>#{c.seq} {c.title}{c.status !== "active" ? " (не включён)" : ""}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">3. Расход, {currency === "KGS" ? "сом" : currency}</span>
          <input name="spend" inputMode="decimal" autoComplete="off" placeholder="0" className="input" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Обращения</span>
          <input name="leads" type="number" min={0} inputMode="numeric" placeholder="0" className="input" />
        </label>
      </div>
      {!picked && (
        <div className="flex gap-2 text-sm" role="radiogroup" aria-label="Валюта">
          {["USD", "KGS"].map((c) => (
            <button key={c} type="button" role="radio" aria-checked={cur === c} onClick={() => setCur(c)} className={`min-h-11 flex-1 rounded-xl px-3 font-semibold ring-1 ${cur === c ? "bg-brand-soft text-brand ring-brand" : "bg-surface-2 ring-line"}`}>
              {c === "KGS" ? "Сомы (KGS)" : "Доллары (USD)"}
            </button>
          ))}
        </div>
      )}
      {picked && free > 0 && (
        <label className="flex items-start gap-3 rounded-xl bg-info-soft p-3 text-sm text-info">
          <input type="checkbox" name="from_unallocated" value="1" defaultChecked className="mt-1 h-5 w-5" />
          <span>Взять из общего расхода за этот день (не распределено {money(free, currency)}). Итог кампании не изменится — сумма перейдёт на это видео.</span>
        </label>
      )}
      <details className="rounded-xl bg-surface-2 px-3 py-2">
        <summary className="cursor-pointer py-1 text-sm font-medium">Показы, клики, комментарий</summary>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <input name="impressions" type="number" min={0} inputMode="numeric" placeholder="Показы" className="input" />
          <input name="clicks" type="number" min={0} inputMode="numeric" placeholder="Клики" className="input" />
          <input name="note" placeholder="Что сделал / оптимизация" className="input col-span-2" />
        </div>
      </details>
      <button type="submit" disabled={pending} className={btn("primary", "w-full")}>{pending ? "Сохраняем…" : "Записать результат"}</button>
      {offline && <p role="alert" className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">Нет связи. Ничего не отправлено, введённые данные сохранены — повторите, когда появится интернет.</p>}
      {state?.error && <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{state.error} Данные в форме сохранены.</p>}
      {state?.ok && <p role="status" className="rounded-lg bg-good-soft px-3 py-2 text-sm text-good">{state.ok}</p>}
    </form>
  );
}
