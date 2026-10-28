import Link from "next/link";
import { clsx } from "clsx";
import type { ReactNode } from "react";
import { tone as toneOf } from "@/lib/labels";

type Tone = "neutral" | "good" | "warn" | "bad" | "info" | "brand";

export function cn(...a: Parameters<typeof clsx>) {
  return clsx(...a);
}

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: string }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {back && (
          <Link href={back} className="mb-1 inline-block text-sm text-muted hover:text-ink">
            ← Назад
          </Link>
        )}
        <h1 className="font-display text-2xl font-semibold tracking-tight md:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ children, className, title, actions }: { children: ReactNode; className?: string; title?: ReactNode; actions?: ReactNode }) {
  return (
    <section className={cn("rounded-2xl border border-line bg-surface p-4 md:p-5", className)}>
      {(title || actions) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-base font-semibold">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

const toneCls: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted border-line",
  good: "bg-good-soft text-good border-transparent",
  warn: "bg-warn-soft text-warn border-transparent",
  bad: "bg-bad-soft text-bad border-transparent",
  info: "bg-info-soft text-info border-transparent",
  brand: "bg-brand-soft text-brand border-transparent",
};

export function Badge({ children, tone, status }: { children: ReactNode; tone?: Tone; status?: string }) {
  const t = tone ?? (status ? toneOf(status) : "neutral");
  return <span className={cn("inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold", toneCls[t])}>{children}</span>;
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: Tone }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className={cn("mt-1 font-display text-2xl font-semibold", tone === "bad" && "text-bad", tone === "good" && "text-good", tone === "warn" && "text-warn")}>{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}

const btnBase = "inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition disabled:opacity-50 disabled:pointer-events-none";
const btnVariants = {
  primary: "bg-primary text-primary-ink hover:brightness-110",
  secondary: "border border-line bg-surface-2 text-ink hover:bg-surface",
  ghost: "text-muted hover:text-ink hover:bg-surface-2",
  danger: "bg-bad text-white hover:brightness-110",
  brand: "bg-brand text-white hover:brightness-110",
};
export type BtnVariant = keyof typeof btnVariants;
export function btn(v: BtnVariant = "primary", extra?: string) {
  return cn(btnBase, btnVariants[v], extra);
}

export function ButtonLink({ href, children, variant = "primary", className }: { href: string; children: ReactNode; variant?: BtnVariant; className?: string }) {
  return (
    <Link href={href} className={btn(variant, className)}>
      {children}
    </Link>
  );
}

export function Field({ label, children, hint, className }: { label: string; children: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Empty({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line px-6 py-10 text-center">
      <div className="font-semibold">{title}</div>
      {text && <p className="mx-auto mt-1 max-w-md text-sm text-muted">{text}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Notice({ children, tone = "info" }: { children: ReactNode; tone?: Tone }) {
  return <div className={cn("rounded-xl border px-4 py-3 text-sm", toneCls[tone])}>{children}</div>;
}

export function Avatar({ name, url, size = 32 }: { name?: string | null; url?: string | null; size?: number }) {
  const ini = (name ?? "?").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={name ?? ""} width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span className="inline-flex shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-bold text-muted" style={{ width: size, height: size }}>
      {ini}
    </span>
  );
}

export function Progress({ value, max, tone = "good" }: { value: number; max: number; tone?: Tone }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const color = tone === "bad" ? "bg-bad" : tone === "warn" ? "bg-warn" : "bg-primary";
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={value} aria-valuemax={max}>
      <div className={cn("h-full rounded-full", color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Tabs({ items, active }: { items: { href: string; label: string; key: string }[]; active: string }) {
  return (
    <div className="scroll-x mb-4 -mx-1">
      <div className="flex gap-1 px-1">
        {items.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            className={cn(
              "whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold",
              t.key === active ? "bg-surface text-ink shadow-sm ring-1 ring-line" : "text-muted hover:text-ink",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

export function Pager({ page, hasMore, base }: { page: number; hasMore: boolean; base: string }) {
  const sep = base.includes("?") ? "&" : "?";
  return (
    <div className="mt-4 flex items-center justify-between text-sm">
      {page > 1 ? <Link className={btn("secondary")} href={`${base}${sep}page=${page - 1}`}>← Назад</Link> : <span />}
      <span className="text-muted">Стр. {page}</span>
      {hasMore ? <Link className={btn("secondary")} href={`${base}${sep}page=${page + 1}`}>Далее →</Link> : <span />}
    </div>
  );
}
