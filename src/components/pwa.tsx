"use client";
import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";
import { btn } from "@/components/ui";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export function SwRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || location.hostname === "localhost") return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).then((reg) => {
      reg.addEventListener("updatefound", () => {
        const w = reg.installing;
        w?.addEventListener("statechange", () => {
          if (w.state === "installed" && navigator.serviceWorker.controller) w.postMessage("skip-waiting");
        });
      });
    });
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!reloaded) {
        reloaded = true;
        location.reload();
      }
    });
  }, []);
  return null;
}

/** Кнопка «Скачать приложение»: нативный prompt на Android/Chrome, инструкция на iOS. */
export function InstallButton({ className }: { className?: string }) {
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    setIos(/iPad|iPhone|iPod/.test(ua) || (ua.includes("Mac") && "ontouchend" in document));
    setInstalled(window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true);
    const h = (e: Event) => {
      e.preventDefault();
      setEvt(e as BIPEvent);
    };
    window.addEventListener("beforeinstallprompt", h);
    window.addEventListener("appinstalled", () => setInstalled(true));
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);

  if (installed) return <span className="text-sm text-muted">Приложение установлено</span>;

  return (
    <>
      <button
        type="button"
        className={btn("secondary", className)}
        onClick={async () => {
          if (evt) {
            await evt.prompt();
            await evt.userChoice;
            setEvt(null);
          } else setOpen(true);
        }}
      >
        <Download size={16} /> Скачать приложение
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 md:items-center" role="dialog" aria-modal="true" onClick={() => setOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold">Установка «Цитадели»</h3>
              <button aria-label="Закрыть" onClick={() => setOpen(false)} className="text-muted"><X size={18} /></button>
            </div>
            {ios ? (
              <ol className="list-decimal space-y-2 pl-5 text-sm">
                <li>Откройте сайт в <b>Safari</b>.</li>
                <li>Нажмите <Share size={14} className="inline" /> <b>Поделиться</b> внизу экрана.</li>
                <li>Выберите <b>«На экран „Домой“»</b> и нажмите «Добавить».</li>
              </ol>
            ) : (
              <ol className="list-decimal space-y-2 pl-5 text-sm">
                <li>Откройте сайт в <b>Chrome</b> или <b>Edge</b>.</li>
                <li>Откройте меню браузера (⋮) и выберите <b>«Установить приложение»</b> или «Добавить на главный экран».</li>
                <li>Если пункта нет — браузер не поддерживает установку или приложение уже установлено.</li>
              </ol>
            )}
            <p className="mt-3 text-xs text-muted">Автоматическая установка одним нажатием доступна не на всех устройствах.</p>
          </div>
        </div>
      )}
    </>
  );
}
