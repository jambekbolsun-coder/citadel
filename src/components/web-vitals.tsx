"use client";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useReportWebVitals } from "next/web-vitals";
import { VITAL_NAMES, type Vital } from "@/lib/vitals";

type ReportCallback = Parameters<typeof useReportWebVitals>[0];
const ENDPOINT = "/app/vitals";
const queue: Vital[] = [];

function context() {
  const conn = (navigator as Navigator & { connection?: { effectiveType?: string } }).connection?.effectiveType ?? null;
  return { width: Math.round(window.innerWidth), conn, standalone: window.matchMedia("(display-mode: standalone)").matches };
}

function flush() {
  if (!queue.length) return;
  const body = JSON.stringify(queue.splice(0, 40));
  const sent = navigator.sendBeacon?.(ENDPOINT, new Blob([body], { type: "application/json" }));
  if (!sent) fetch(ENDPOINT, { method: "POST", body, keepalive: true, headers: { "content-type": "application/json" } }).catch(() => {});
}

function push(v: Omit<Vital, "width" | "conn" | "standalone">) {
  // локальная разработка не должна смешиваться с замерами сотрудников
  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") return;
  queue.push({ ...v, ...context() });
  if (queue.length >= 20) flush();
}

// Стабильная ссылка на колбэк — иначе Next повторно отдаёт уже отправленные метрики
const report: ReportCallback = (m) => {
  if (!(VITAL_NAMES as readonly string[]).includes(m.name)) return;
  const nav = (m as { navigationType?: string }).navigationType ?? null;
  const url = (m as { navigationURL?: string }).navigationURL ?? location.pathname;
  push({ name: m.name as Vital["name"], value: m.value, rating: (m.rating as Vital["rating"]) ?? null, route: url, nav });
};

/** Обезличенные замеры: Web Vitals и время перехода между экранами (до каркаса и до данных). */
export function WebVitals() {
  useReportWebVitals(report);
  const path = usePathname();
  const pending = useRef<{ t0: number; to: string } | null>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank") return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname === location.pathname) return;
      pending.current = { t0: performance.now(), to: url.pathname };
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    const timer = setInterval(flush, 15_000);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const p = pending.current;
    if (!p || p.to !== path) return;
    pending.current = null;
    push({ name: "route-shell", value: performance.now() - p.t0, route: path });
    const main = document.getElementById("main");
    const ready = () => push({ name: "route-ready", value: performance.now() - p.t0, route: path });
    const busy = () => !!main?.querySelector('[aria-busy="true"]');
    if (!main || !busy()) {
      const raf = requestAnimationFrame(ready);
      return () => cancelAnimationFrame(raf);
    }
    const mo = new MutationObserver(() => {
      if (!busy()) {
        mo.disconnect();
        ready();
      }
    });
    mo.observe(main, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-busy"] });
    const giveUp = setTimeout(() => mo.disconnect(), 20_000);
    return () => {
      mo.disconnect();
      clearTimeout(giveUp);
    };
  }, [path]);

  return null;
}
