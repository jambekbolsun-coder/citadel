"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { getMood } from "@/app/app/mood-actions";
import { bishkekDay, bishkekHour, greetingFor, mascotSrc } from "@/lib/mascot";
import type { Mood } from "@/lib/mood";

const SEEN_KEY = "kadr.greet";
const PIN_FLAG = "citadel.pin";
const UNLOCK_KEY = "citadel.unlocked";

/**
 * Заставка «Доброе утро, имя!» с илбирсом — раз в день на устройстве, при первом открытии приложения.
 * Ждёт, пока снимут PIN-блокировку; закрывается сама через несколько секунд, по тапу или Escape.
 */
export function GreetingSplash({ userId }: { userId: string }) {
  const [mood, setMood] = useState<Mood | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [hour, setHour] = useState(12);
  const timer = useRef<number | undefined>(undefined);
  const closeRef = useRef<HTMLButtonElement>(null);
  const key = `${SEEN_KEY}.${userId.slice(0, 8)}`;

  const close = useCallback(() => {
    window.clearTimeout(timer.current);
    setLeaving(true);
    window.setTimeout(() => setMood(null), 280);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let poll: number | undefined;
    try {
      if (localStorage.getItem(key) === bishkekDay()) return; // сегодня уже приветствовали
    } catch {
      return;
    }
    const locked = () => {
      try {
        return localStorage.getItem(PIN_FLAG) === userId && sessionStorage.getItem(UNLOCK_KEY) !== "1";
      } catch {
        return false;
      }
    };
    const start = async () => {
      const m = await getMood().catch(() => null);
      if (cancelled || !m) return;
      try {
        localStorage.setItem(key, m.day);
      } catch {}
      setHour(bishkekHour());
      setMood(m);
      // строгому и «злому» илбирсу даём чуть больше времени — там кнопка «Открыть просрочки»
      timer.current = window.setTimeout(close, m.action ? 6000 : 3800);
    };
    if (locked()) {
      poll = window.setInterval(() => {
        if (!locked()) {
          window.clearInterval(poll);
          void start();
        }
      }, 500);
    } else void start();
    return () => {
      cancelled = true;
      window.clearInterval(poll);
      window.clearTimeout(timer.current);
    };
  }, [key, userId, close]);

  useEffect(() => {
    if (!mood) return;
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mood, close]);

  if (!mood) return null;
  const hello = `${greetingFor(hour)}${mood.name ? `, ${mood.name}` : ""}!`;
  return (
    <div
      className={`greet-overlay ${leaving ? "is-leaving" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={hello}
      onClick={close}
      onPointerEnter={() => window.clearTimeout(timer.current)}
    >
      <div className="greet-cloud" onClick={(e) => e.stopPropagation()}>
        <span className="greet-puff greet-puff-1" aria-hidden />
        <span className="greet-puff greet-puff-2" aria-hidden />
        <span className="greet-puff greet-puff-3" aria-hidden />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={mascotSrc(mood.emotion)} alt="" width={256} height={256} className="greet-mascot" decoding="async" />
        <h2 className="greet-title font-display">{hello}</h2>
        <p className="greet-phrase">{mood.phrase}</p>
        <div className="greet-actions">
          {mood.action && (
            <Link href={mood.action.href} onClick={close} className="greet-btn greet-btn-primary">{mood.action.label}</Link>
          )}
          <button ref={closeRef} type="button" onClick={close} className={`greet-btn ${mood.action ? "greet-btn-ghost" : "greet-btn-primary"}`}>
            {mood.action ? "Позже" : "Начать работу"}
          </button>
        </div>
      </div>
    </div>
  );
}
