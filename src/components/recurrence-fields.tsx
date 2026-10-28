"use client";
import { useEffect, useRef, useState } from "react";
import { describe, expand, isoDow, type Rule } from "@/lib/recurrence";

const WD = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function readRule(form: HTMLFormElement): Rule | null {
  const fd = new FormData(form);
  const freq = String(fd.get("repeat_freq") ?? "");
  if (!["daily", "weekly", "monthly"].includes(freq)) return null;
  const end = String(fd.get("repeat_end") ?? "count");
  return {
    freq: freq as Rule["freq"],
    interval: Number(fd.get("repeat_interval")) || 1,
    weekdays: fd.getAll("repeat_weekday").map(Number),
    monthly: (String(fd.get("repeat_monthly") || "day")) as Rule["monthly"],
    ...(end === "until" ? { until: String(fd.get("repeat_until") ?? "") } : { count: Number(fd.get("repeat_count")) || 0 }),
  };
}

/** Поля повтора для формы. startName — поле datetime-local с первой датой серии. */
export function RecurrenceFields({ startName }: { startName: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [freq, setFreq] = useState("");
  const [end, setEnd] = useState("count");
  const [start, setStart] = useState("");
  const [preview, setPreview] = useState<{ text: string; dates: string[] } | null>(null);

  useEffect(() => {
    const form = box.current?.closest("form");
    if (!form) return;
    const update = () => {
      const s = String(new FormData(form).get(startName) ?? "").slice(0, 10);
      setStart(s);
      const rule = readRule(form);
      if (!rule || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return setPreview(null);
      const dates = expand(s, rule);
      setPreview({ text: describe(s, rule), dates });
    };
    update();
    form.addEventListener("input", update);
    form.addEventListener("change", update);
    const onReset = () => setTimeout(() => { setFreq(""); setEnd("count"); update(); });
    form.addEventListener("reset", onReset);
    return () => {
      form.removeEventListener("input", update);
      form.removeEventListener("change", update);
      form.removeEventListener("reset", onReset);
    };
  }, [startName]);

  const startDow = /^\d{4}-\d{2}-\d{2}$/.test(start) ? isoDow(start) : null;
  return (
    <div ref={box} className="space-y-2 rounded-xl border border-line p-3">
      <label className="block text-sm font-semibold">
        Повторять
        <select name="repeat_freq" value={freq} onChange={(e) => setFreq(e.target.value)} className="input mt-1">
          <option value="">Не повторять</option>
          <option value="daily">Каждый день / каждые N дней</option>
          <option value="weekly">По неделям</option>
          <option value="monthly">По месяцам</option>
        </select>
      </label>
      {freq && (
        <>
          <label className="flex items-center gap-2 text-sm">
            Интервал: каждые
            <input name="repeat_interval" type="number" min={1} max={52} defaultValue={1} className="input w-20" />
            {freq === "daily" ? "дн." : freq === "weekly" ? "нед." : "мес."}
          </label>
          {freq === "weekly" && (
            <div className="flex flex-wrap gap-1">
              {WD.map((w, i) => (
                <label key={w} className="flex cursor-pointer items-center gap-1 rounded-lg bg-surface-2 px-2 py-1 text-xs ring-1 ring-line has-[:checked]:bg-primary has-[:checked]:text-primary-ink">
                  <input type="checkbox" name="repeat_weekday" value={i + 1} defaultChecked={startDow === i + 1} className="sr-only" />
                  {w}
                </label>
              ))}
            </div>
          )}
          {freq === "monthly" && (
            <select name="repeat_monthly" defaultValue="day" className="input">
              <option value="day">В то же число</option>
              <option value="nth">В тот же N-й день недели (напр. первый понедельник)</option>
              <option value="last">В последний такой день недели месяца</option>
            </select>
          )}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <select name="repeat_end" value={end} onChange={(e) => setEnd(e.target.value)} className="input w-auto">
              <option value="count">Количество раз</option>
              <option value="until">До даты</option>
            </select>
            {end === "count" ? <input name="repeat_count" type="number" min={2} max={60} defaultValue={4} className="input w-24" /> : <input name="repeat_until" type="date" className="input w-auto" />}
          </div>
          {preview ? (
            <p className="text-xs text-muted">
              <b className="text-ink">{preview.text}</b> · будет создано: {preview.dates.length}
              {preview.dates.length > 0 && <> — {preview.dates.slice(0, 6).map((d) => d.slice(8) + "." + d.slice(5, 7)).join(", ")}{preview.dates.length > 6 ? "…" : ""}</>}
            </p>
          ) : (
            <p className="text-xs text-muted">Укажите дату и время первого повтора — покажу даты серии. Максимум 60 повторов.</p>
          )}
        </>
      )}
    </div>
  );
}
