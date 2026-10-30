"use client";
import { useActionState, useEffect, useState } from "react";
import QRCode from "qrcode";
import { Copy, Download } from "lucide-react";
import { Submit } from "@/components/action-form";
import { btn } from "@/components/ui";

type State = { ok?: string; error?: string; data?: Record<string, unknown> } | null;

export function InviteLinkPanel({ link }: { link: string }) {
  const [qr, setQr] = useState<string>("");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    QRCode.toDataURL(link, { width: 512, margin: 2, color: { dark: "#0b1640", light: "#ffffff" } }).then(setQr);
  }, [link]);
  return (
    <div className="mt-4 grid gap-4 rounded-2xl border border-line bg-surface-2 p-4 sm:grid-cols-[180px_1fr]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {qr ? <img src={qr} alt="QR-код приглашения" className="h-44 w-44 rounded-xl bg-white p-1" /> : <div className="h-44 w-44 animate-pulse rounded-xl bg-surface" />}
      <div className="min-w-0 space-y-2">
        <div className="break-all rounded-lg bg-surface p-2 font-mono text-xs">{link}</div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btn("secondary")} onClick={() => { navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
            <Copy size={16} /> {copied ? "Скопировано" : "Скопировать ссылку"}
          </button>
          {qr && <a href={qr} download="smm-kadr-invite.png" className={btn("secondary")}><Download size={16} /> Скачать QR</a>}
        </div>
        <p className="text-xs text-muted">Ссылка одноразовая, действует ограниченное время. Email при регистрации должен совпадать с приглашением. Ссылка сама по себе не подтверждает личность — после регистрации профиль утверждает владелец.</p>
      </div>
    </div>
  );
}

export function InviteActionForm({ action, children, className }: { action: (p: State, fd: FormData) => Promise<State>; children: React.ReactNode; className?: string }) {
  const [state, act] = useActionState(action, null);
  return (
    <div>
      <form action={act} className={className}>
        {children}
      </form>
      {state?.error && <p role="alert" className="mt-2 rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{state.error}</p>}
      {state?.ok && <p className="mt-2 rounded-lg bg-good-soft px-3 py-2 text-sm text-good">{state.ok}</p>}
      {typeof state?.data?.link === "string" && <InviteLinkPanel link={state.data.link} />}
    </div>
  );
}

export { Submit };
