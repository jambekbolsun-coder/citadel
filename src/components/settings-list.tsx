import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { iconOf } from "@/components/icons";
import type { SettingsGroup } from "@/lib/nav";

export function SettingsSection({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="mb-6">
      {title && <h2 className="group-title">{title}</h2>}
      {children}
    </section>
  );
}

export function SettingsGroups({ groups }: { groups: SettingsGroup[] }) {
  return (
    <>
      {groups.map((g) => (
        <SettingsSection key={g.title} title={g.title}>
          <ul className="grouped">
            {g.rows.map((r) => {
              const Icon = iconOf(r.icon);
              return (
                <li key={r.href}>
                  <Link href={r.href} className="row">
                    <span className="row-icon"><Icon size={18} /></span>
                    <span className="min-w-0 flex-1 truncate">{r.label}</span>
                    {r.status && <span className="shrink-0 text-sm text-muted">{r.status}</span>}
                    <ChevronRight size={18} className="shrink-0 text-muted" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </SettingsSection>
      ))}
    </>
  );
}

/** Узкая колонка для вложенных экранов настроек: на телефоне во всю ширину, на десктопе — читаемая ширина. */
export function SettingsPage({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-2xl">
      <h1 className="font-display text-[22px] font-semibold leading-tight md:text-[26px]">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      <div className="mt-5">{children}</div>
    </div>
  );
}
