"use client";
import { useEffect, useState } from "react";
import { medal, type Prize, type Row } from "@/lib/contests";
import { cn } from "@/components/ui";

const prizeText = (prizes: Prize[], place: number) => {
  const p = prizes.find((x) => x.place === place);
  if (!p) return "";
  return [p.amount_minor > 0 ? `${(p.amount_minor / 100).toLocaleString("ru-RU")} сом` : "", p.text].filter(Boolean).join(" · ");
};

/** Пьедестал 2–1–3 одной группы. */
export function Podium({ rows, prizes, me }: { rows: Row[]; prizes: Prize[]; me: string }) {
  const by = (pl: number) => rows.filter((r) => r.place === pl);
  const col = (pl: number, h: string) => (
    <div className="flex min-w-0 flex-1 flex-col items-center justify-end text-center">
      {pl === 1 && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/mascot/celebrate-sm.webp" alt="" width={96} height={96} className="mascot-pop -mb-2 h-24 w-24 object-contain" />
      )}
      {by(pl).map((r) => (
        <div key={r.user_id} className={cn("w-full truncate text-sm font-semibold", r.user_id === me && "text-primary")}>{r.full_name}</div>
      ))}
      {by(pl).length > 0 && <div className="text-xs text-muted">{by(pl)[0].score} баллов</div>}
      <div className={cn("mt-1 flex w-full flex-col items-center justify-start rounded-t-2xl pt-2 font-display text-2xl font-extrabold text-white", h, pl === 1 ? "bg-[#1845d2]" : pl === 2 ? "bg-[#5b7fe6]" : "bg-[#8aa3ee]")}>
        <span aria-hidden>{medal(pl)}</span>
        <span className="sr-only">{pl}-е место</span>
        {prizeText(prizes, pl) && <span className="mt-1 px-1 text-[11px] font-semibold leading-tight text-white/90">{prizeText(prizes, pl)}</span>}
      </div>
    </div>
  );
  return (
    <div className="flex items-end gap-2" aria-label="Пьедестал">
      {col(2, "h-24")}
      {col(1, "h-32")}
      {col(3, "h-20")}
    </div>
  );
}

/** Церемония на весь экран при первом открытии итогов (на устройстве). */
export function Ceremony({ contestId, title, winners, myPlace }: { contestId: string; title: string; winners: { place: number; name: string }[]; myPlace: number | null }) {
  const [open, setOpen] = useState(false);
  const key = `kadr.ceremony.${contestId}`;
  useEffect(() => {
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, "1");
    } catch {
      return;
    }
    const t = window.setTimeout(() => setOpen(true), 0);
    return () => window.clearTimeout(t);
  }, [key]);
  if (!open) return null;
  return (
    <div className="greet-overlay" role="dialog" aria-modal="true" aria-label={`Итоги: ${title}`} onClick={() => setOpen(false)}>
      <div className="confetti" aria-hidden>{Array.from({ length: 24 }, (_, i) => <i key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 8) * 0.18}s` }} />)}</div>
      <div className="greet-cloud" onClick={(e) => e.stopPropagation()}>
        <span className="greet-puff greet-puff-1" aria-hidden />
        <span className="greet-puff greet-puff-2" aria-hidden />
        <span className="greet-puff greet-puff-3" aria-hidden />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/mascot/celebrate-lg.webp" alt="" width={256} height={256} className="greet-mascot" />
        <h2 className="greet-title font-display">Итоги: {title}</h2>
        <ul className="mt-3 space-y-1 text-left text-[15px] font-semibold">
          {winners.map((w) => <li key={`${w.place}${w.name}`} className="flex gap-2"><span aria-hidden>{medal(w.place)}</span><span className="sr-only">{w.place}-е место:</span> {w.name}</li>)}
        </ul>
        {myPlace !== null && myPlace <= 3 && <p className="greet-phrase">Поздравляем — у вас {myPlace}-е место!</p>}
        <div className="greet-actions"><button type="button" onClick={() => setOpen(false)} className="greet-btn greet-btn-primary">Посмотреть результаты</button></div>
      </div>
    </div>
  );
}
