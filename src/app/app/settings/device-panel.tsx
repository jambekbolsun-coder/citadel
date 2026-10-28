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

function keyToBytes(b64url: string) {
  const b64 = (b64url + "=".repeat((4 - (b64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type PushState = "loading" | "unsupported" | "ios-browser" | "no-sw" | "denied" | "off" | "on";

export function PushToggle() {
  const [state, setState] = useState<PushState>("loading");
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const standalone = matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setState(ios && !standalone ? "ios-browser" : "unsupported");
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.getRegistration("/");
      if (!reg) return setState("no-sw");
      setState((await reg.pushManager.getSubscription()) ? "on" : "off");
    })();
  }, []);

  async function enable() {
    setBusy(true);
    setMsg({});
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "denied" : "off");
        return;
      }
      const supabase = createClient();
      const { data: key, error } = await supabase.rpc("push_public_key");
      if (error || !key) throw new Error("Сервер уведомлений ещё не настроен");
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(key as string) }));
      const j = sub.toJSON();
      const { error: e2 } = await supabase.rpc("push_subscribe", { p_endpoint: j.endpoint, p_p256dh: j.keys?.p256dh, p_auth: j.keys?.auth, p_ua: navigator.userAgent });
      if (e2) throw new Error(e2.message);
      setState("on");
      setMsg({ ok: "Уведомления включены на этом устройстве" });
    } catch (e) {
      setMsg({ error: e instanceof Error ? e.message : "Не удалось включить уведомления" });
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMsg({});
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await createClient().from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
      setMsg({ ok: "Уведомления на этом устройстве выключены" });
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setMsg({});
    const { error } = await createClient().rpc("push_test");
    setBusy(false);
    setMsg(error ? { error: error.message } : { ok: "Отправлено. Уведомление придёт в течение нескольких секунд — можно свернуть или закрыть приложение." });
  }

  const status: Record<PushState, string> = {
    loading: "проверка…",
    unsupported: "этот браузер не поддерживает push-уведомления",
    "ios-browser": "на iPhone/iPad уведомления работают только в установленном приложении",
    "no-sw": "приложение ещё загружается — обновите страницу",
    denied: "запрещены в настройках браузера",
    off: "выключены на этом устройстве",
    on: "включены на этом устройстве",
  };
  return (
    <div className="space-y-3 text-sm">
      <p>Статус: <b>{status[state]}</b></p>
      <div className="flex flex-wrap gap-2">
        {state === "off" && <button type="button" disabled={busy} className={btn("primary")} onClick={enable}>Включить уведомления</button>}
        {state === "on" && <>
          <button type="button" disabled={busy} className={btn("secondary")} onClick={test}>Отправить тестовое</button>
          <button type="button" disabled={busy} className={btn("ghost")} onClick={disable}>Выключить</button>
        </>}
      </div>
      {msg.error && <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-bad">{msg.error}</p>}
      {msg.ok && <p role="status" className="rounded-lg bg-good-soft px-3 py-2 text-good">{msg.ok}</p>}
      {state === "ios-browser" && <p className="text-xs text-muted">Safari → «Поделиться» → «На экран Домой», затем откройте Цитадель с иконки и включите уведомления здесь (iOS 16.4+).</p>}
      {state === "denied" && <p className="text-xs text-muted">Разрешите уведомления для этого сайта в настройках браузера и обновите страницу.</p>}
      <p className="text-xs text-muted">Уведомления приходят, даже когда приложение закрыто. Включается отдельно на каждом устройстве. Все уведомления также сохраняются во «Входящих».</p>
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
