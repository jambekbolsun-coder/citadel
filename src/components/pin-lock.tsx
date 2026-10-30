"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { APP_ICON } from "@/lib/brand";

const DEVICE_KEY = "citadel.device";
const PIN_FLAG = "citadel.pin";
const UNLOCK_KEY = "citadel.unlocked";
const IDLE_MS = 10 * 60 * 1000;

export function getDeviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID() + crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}
export function setPinFlag(userId: string, on: boolean) {
  if (on) localStorage.setItem(PIN_FLAG, userId);
  else localStorage.removeItem(PIN_FLAG);
  sessionStorage.setItem(UNLOCK_KEY, "1");
}

/**
 * Локальный экран блокировки ранее авторизованного доверенного сеанса.
 * PIN проверяется на сервере (bcrypt, лимит попыток, временная блокировка); 5 ошибок — сброс PIN и полный выход.
 * Это не замена паролю: вход с нового устройства — только паролем.
 */
export function PinLock({ userId }: { userId: string }) {
  const [locked, setLocked] = useState(false);
  const [pin, setPin] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const last = useRef(0);

  const shouldLock = useCallback(() => {
    try {
      return localStorage.getItem(PIN_FLAG) === userId && sessionStorage.getItem(UNLOCK_KEY) !== "1";
    } catch {
      return false;
    }
  }, [userId]);

  useEffect(() => {
    last.current = Date.now();
    setLocked(shouldLock());
    const bump = () => (last.current = Date.now());
    const tick = setInterval(() => {
      if (localStorage.getItem(PIN_FLAG) === userId && Date.now() - last.current > IDLE_MS) {
        sessionStorage.removeItem(UNLOCK_KEY);
        setLocked(true);
      }
    }, 30_000);
    const vis = () => {
      if (document.visibilityState === "visible" && Date.now() - last.current > IDLE_MS && localStorage.getItem(PIN_FLAG) === userId) {
        sessionStorage.removeItem(UNLOCK_KEY);
        setLocked(true);
      }
    };
    ["pointerdown", "keydown"].forEach((e) => window.addEventListener(e, bump));
    document.addEventListener("visibilitychange", vis);
    return () => {
      clearInterval(tick);
      ["pointerdown", "keydown"].forEach((e) => window.removeEventListener(e, bump));
      document.removeEventListener("visibilitychange", vis);
    };
  }, [shouldLock, userId]);

  async function submit(p: string) {
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("verify_device_pin", { p_device: getDeviceId(), p_pin: p });
    setBusy(false);
    setPin("");
    if (error) return setMsg("Ошибка проверки. Проверьте сеть.");
    const r = String(data);
    if (r === "ok") {
      sessionStorage.setItem(UNLOCK_KEY, "1");
      last.current = Date.now();
      setLocked(false);
    } else if (r === "locked") setMsg("Слишком много попыток. Подождите минуту.");
    else if (r.startsWith("wrong:")) setMsg(`Неверный PIN. Осталось попыток: ${r.split(":")[1]}`);
    else {
      // reset / none — нужен полный вход паролем
      localStorage.removeItem(PIN_FLAG);
      await supabase.auth.signOut({ scope: "local" });
      // полная перезагрузка: очищает состояние приложения после выхода
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      location.href = "/login";
    }
  }

  if (!locked) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-bg/95 backdrop-blur" role="dialog" aria-modal="true" aria-label="Экран блокировки">
      <div className="w-full max-w-xs text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={APP_ICON} alt="" className="mx-auto h-16 w-16 rounded-2xl" />
        <h2 className="mt-4 text-lg font-semibold">Введите PIN</h2>
        <div className="mt-4 flex justify-center gap-3" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={`h-3.5 w-3.5 rounded-full ${i < pin.length ? "bg-primary" : "bg-surface-2 ring-1 ring-line"}`} />
          ))}
        </div>
        {msg && <p className="mt-3 text-sm text-bad" role="alert">{msg}</p>}
        <div className="mt-6 grid grid-cols-3 gap-3">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((k, i) =>
            k === "" ? (
              <span key={i} />
            ) : (
              <button
                key={i}
                disabled={busy}
                className="h-16 rounded-2xl bg-surface text-xl font-semibold ring-1 ring-line active:bg-surface-2"
                onClick={() => {
                  if (k === "⌫") return setPin((p) => p.slice(0, -1));
                  const n = (pin + k).slice(0, 4);
                  setPin(n);
                  if (n.length === 4) submit(n);
                }}
              >
                {k}
              </button>
            ),
          )}
        </div>
        <button
          className="mt-6 text-sm text-muted underline"
          onClick={async () => {
            localStorage.removeItem(PIN_FLAG);
            await createClient().auth.signOut({ scope: "local" });
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination
            location.href = "/login";
          }}
        >
          Войти паролем
        </button>
      </div>
    </div>
  );
}
