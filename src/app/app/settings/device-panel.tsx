"use client";
import { useActionState, useEffect, useState } from "react";
import { Submit } from "@/components/action-form";
import { getDeviceId, setPinFlag } from "@/components/pin-lock";
import { createClient } from "@/lib/supabase/client";
import { btn } from "@/components/ui";

type State = { ok?: string; error?: string; data?: Record<string, unknown> } | null;

export function PinSetup({ userId, action, removeAction, devices }: { userId: string; action: (p: State, fd: FormData) => Promise<State>; removeAction: (p: State, fd: FormData) => Promise<State>; devices: { device_id: string; device_name: string | null; last_used_at: string | null }[] }) {
  const [state, act] = useActionState(action, null);
  const [rm, rmAct] = useActionState(removeAction, null);
  const [device, setDevice] = useState("");
  const [name, setName] = useState("");
  useEffect(() => {
    setDevice(getDeviceId());
    setName(`${navigator.platform || "Устройство"} · ${navigator.userAgent.match(/(Chrome|Safari|Firefox|Edg)\/[\d.]+/)?.[0] ?? "браузер"}`);
  }, []);
  useEffect(() => {
    if (state?.data?.pin === "set") setPinFlag(userId, true);
  }, [state, userId]);
  useEffect(() => {
    if (rm?.ok) setPinFlag(userId, false);
  }, [rm, userId]);
  const thisHas = devices.some((d) => d.device_id === device);
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">PIN — быстрый экран разблокировки на уже доверенном устройстве. Проверяется на сервере, 5 ошибок — сброс и вход паролем. С нового устройства — только пароль.</p>
      <form action={act} className="grid gap-2 sm:grid-cols-3">
        <input type="hidden" name="device_id" value={device} />
        <input type="hidden" name="device_name" value={name} />
        <input name="pin" inputMode="numeric" pattern="\d{4}" maxLength={4} required placeholder="Новый PIN (4 цифры)" className="input" autoComplete="off" />
        <input name="pin2" inputMode="numeric" pattern="\d{4}" maxLength={4} required placeholder="Повторите PIN" className="input" autoComplete="off" />
        <Submit variant="secondary">{thisHas ? "Сменить PIN" : "Установить PIN"}</Submit>
      </form>
      {state?.error && <p className="text-sm text-bad">{state.error}</p>}
      {state?.ok && <p className="text-sm text-good">{state.ok}</p>}
      {devices.length > 0 && (
        <ul className="space-y-1 text-sm">{devices.map((d) => (
          <li key={d.device_id} className="flex items-center justify-between gap-2 rounded-xl bg-surface-2 px-3 py-2">
            <span>{d.device_name ?? "Устройство"} {d.device_id === device && <b className="text-primary">(это устройство)</b>}<span className="block text-xs text-muted">последний вход по PIN: {d.last_used_at ? new Date(d.last_used_at).toLocaleString("ru-RU") : "—"}</span></span>
            <form action={rmAct}><input type="hidden" name="device_id" value={d.device_id} /><button className="text-xs text-bad">удалить</button></form>
          </li>
        ))}</ul>
      )}
    </div>
  );
}

export function ThemeSwitch() {
  const [t, setT] = useState("system");
  useEffect(() => {
    try { setT(localStorage.getItem("citadel.theme") ?? "system"); } catch {}
  }, []);
  const apply = (v: string) => {
    setT(v);
    try { if (v === "system") localStorage.removeItem("citadel.theme"); else localStorage.setItem("citadel.theme", v); } catch {}
    if (v === "system") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = v;
  };
  return (
    <div className="flex gap-2">{[["system", "Как в системе"], ["light", "Светлая"], ["dark", "Тёмная"]].map(([k, l]) => <button key={k} type="button" onClick={() => apply(k)} className={btn(t === k ? "primary" : "secondary")}>{l}</button>)}</div>
  );
}

export function PushToggle() {
  const [state, setState] = useState<string>("");
  useEffect(() => {
    if (!("Notification" in window)) setState("unsupported");
    else setState(Notification.permission);
  }, []);
  if (state === "unsupported") return <p className="text-sm text-muted">Этот браузер не поддерживает системные уведомления. На iPhone они доступны только для установленного на экран «Домой» приложения (iOS 16.4+).</p>;
  return (
    <div className="space-y-2 text-sm">
      <p>Статус: <b>{state === "granted" ? "разрешены" : state === "denied" ? "запрещены в настройках браузера" : "не запрошены"}</b></p>
      {state !== "granted" && state !== "denied" && <button type="button" className={btn("secondary")} onClick={async () => setState(await Notification.requestPermission())}>Разрешить уведомления</button>}
      <p className="text-xs text-muted">Системные уведомления показываются, пока приложение открыто или работает в фоне. Доставка push при полностью закрытом приложении — best-effort; входящие в приложении сохраняются всегда.</p>
    </div>
  );
}

export function SignOutEverywhere() {
  return (
    <button type="button" className={btn("danger")} onClick={async () => { await createClient().auth.signOut({ scope: "global" }); localStorage.removeItem("citadel.pin"); location.assign(new URL("/login", location.origin)); }}>
      Выйти на всех устройствах
    </button>
  );
}
