import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { InstallButton } from "@/components/pwa";

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-6 flex items-center gap-3">
          <Image src="/logo.webp" alt="" width={44} height={44} className="rounded-xl" priority />
          <div>
            <div className="font-display text-lg font-semibold leading-tight">Цитадель</div>
            <div className="text-xs text-muted">SMM KADR</div>
          </div>
        </Link>
        <div className="rounded-2xl border border-line bg-surface p-6">
          <h1 className="text-xl font-semibold">{title}</h1>
          {subtitle && <div className="mt-1 text-sm text-muted">{subtitle}</div>}
          <div className="mt-5">{children}</div>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
          {footer ?? <span />}
          <InstallButton />
        </div>
      </div>
    </main>
  );
}
