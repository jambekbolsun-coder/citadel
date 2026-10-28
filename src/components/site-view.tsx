import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check, Clapperboard, LineChart, Megaphone, Target, CalendarCheck, Users, FileCheck2, Sparkles } from "lucide-react";
import type { Block, PublicTariff } from "@/lib/site";
import { LeadForm } from "@/components/lead-form";
import { kindCount, money } from "@/lib/format";

type Items = { title?: string; text?: string; q?: string; a?: string; metric?: string; image?: string }[];
const icons = [CalendarCheck, Users, FileCheck2, Target, Clapperboard, Megaphone, LineChart, Sparkles];
const PERIOD: Record<string, string> = { one_time: "разово", monthly: "в месяц", yearly: "в год" };

function composition(c: Record<string, number>) {
  return Object.entries(c)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => kindCount(k, v))
    .join(" · ");
}

export function SiteView({ blocks, settings, tariffs, preview = false }: { blocks: Block[]; settings: Record<string, string | null>; tariffs: PublicTariff[]; preview?: boolean }) {
  const get = (t: string) => blocks.find((b) => b.type === t)?.content as Record<string, unknown> | undefined;
  const services = ((get("services")?.items as Items) ?? []).map((s) => s.title ?? "").filter(Boolean);
  const serviceOptions = [...services, ...tariffs.map((t) => `Тариф «${t.name}»`)];

  return (
    <div className="bg-[#0c1311] text-[#eef3f0]" style={{ ["--bg" as string]: "#0c1311" }}>
      {preview && <div className="sticky top-0 z-50 bg-warn px-4 py-2 text-center text-sm font-semibold text-black">Предпросмотр черновика — не опубликовано</div>}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0c1311]/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/logo.webp" alt="" width={36} height={36} className="rounded-lg" priority />
            <span className="font-display text-lg font-semibold tracking-tight">SMM KADR</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-white/70 md:flex">
            <a href="#services" className="hover:text-white">Услуги</a>
            <a href="#tariffs" className="hover:text-white">Тарифы</a>
            <a href="#faq" className="hover:text-white">Вопросы</a>
            <a href="#contacts" className="hover:text-white">Контакты</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className="rounded-xl px-3 py-2 text-sm font-semibold text-white/70 hover:text-white">Вход</Link>
            <a href="#lead" className="rounded-xl bg-[#e0162b] px-4 py-2 text-sm font-semibold text-white hover:brightness-110">Заявка</a>
          </div>
        </div>
      </header>

      {blocks.map((b) => {
        const c = b.content as Record<string, unknown>;
        switch (b.type) {
          case "hero":
            return (
              <section key={b.key} className="relative overflow-hidden">
                <div className="pointer-events-none absolute -right-40 -top-40 h-[520px] w-[520px] rounded-full bg-[#e0162b]/25 blur-3xl" />
                <div className="pointer-events-none absolute -left-32 bottom-0 h-[360px] w-[360px] rounded-full bg-[#7fd8c0]/10 blur-3xl" />
                <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 md:grid-cols-[1.2fr_1fr] md:py-24">
                  <div>
                    {c.eyebrow ? <div className="mb-4 inline-flex rounded-full border border-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-white/70">{String(c.eyebrow)}</div> : null}
                    <h1 className="font-display text-4xl font-bold leading-[1.05] tracking-tight md:text-6xl">{String(c.title ?? "")}</h1>
                    <p className="mt-5 max-w-xl text-lg text-white/70">{String(c.subtitle ?? "")}</p>
                    <div className="mt-8 flex flex-wrap gap-3">
                      <a href="#lead" className="inline-flex items-center gap-2 rounded-xl bg-[#e0162b] px-6 py-3.5 font-semibold text-white hover:brightness-110">
                        {String(c.cta ?? "Оставить заявку")} <ArrowRight size={18} />
                      </a>
                      <a href="#tariffs" className="inline-flex items-center rounded-xl border border-white/20 px-6 py-3.5 font-semibold text-white/90 hover:bg-white/5">
                        {String(c.secondary ?? "Тарифы")}
                      </a>
                    </div>
                  </div>
                  <div className="relative mx-auto aspect-square w-full max-w-[420px]">
                    <div className="absolute inset-0 rotate-3 rounded-[36px] bg-[#e0162b]" />
                    <Image src="/logo.webp" alt="Фирменный знак KADR — разрезанный ананас" fill sizes="420px" className="rounded-[36px] object-cover shadow-2xl" priority />
                  </div>
                </div>
              </section>
            );
          case "benefits":
          case "services": {
            const items = (c.items as Items) ?? [];
            if (!items.length) return null;
            return (
              <section key={b.key} id={b.type === "services" ? "services" : undefined} className="mx-auto max-w-6xl px-4 py-14">
                <h2 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">{String(c.title ?? "")}</h2>
                <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {items.map((it, i) => {
                    const Icon = icons[(i + (b.type === "services" ? 4 : 0)) % icons.length];
                    return (
                      <div key={i} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                        <Icon className="mb-4 text-[#ff4d5e]" size={26} />
                        <h3 className="font-semibold">{it.title}</h3>
                        <p className="mt-2 text-sm leading-relaxed text-white/65">{it.text}</p>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          }
          case "tariffs":
            return (
              <section key={b.key} id="tariffs" className="mx-auto max-w-6xl px-4 py-14">
                <h2 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">{String(c.title ?? "Тарифы")}</h2>
                {c.subtitle ? <p className="mt-2 text-white/60">{String(c.subtitle)}</p> : null}
                {tariffs.length === 0 ? (
                  <p className="mt-6 text-white/60">Актуальный прайс уточняйте у менеджера.</p>
                ) : (
                  <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {tariffs.map((t) => (
                      <div key={t.id} className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                        <div className="text-sm font-semibold uppercase tracking-wide text-white/60">{t.name}</div>
                        <div className="mt-2 font-display text-3xl font-semibold">
                          {t.price_on_request || t.price_minor === null ? "Индивидуально" : money(t.price_minor, t.currency)}
                        </div>
                        {!t.price_on_request && <div className="text-sm text-white/50">{PERIOD[t.period_type] ?? ""}</div>}
                        <p className="mt-3 text-sm text-white/70">{t.description}</p>
                        {composition(t.composition) && (
                          <ul className="mt-3 space-y-1 text-sm text-white/70">
                            {composition(t.composition).split(" · ").map((x) => (
                              <li key={x} className="flex gap-2"><Check size={16} className="mt-0.5 text-[#7fd8c0]" /> {x}</li>
                            ))}
                          </ul>
                        )}
                        <a href="#lead" className="mt-auto pt-5 text-sm font-semibold text-[#ff4d5e] hover:underline">Обсудить тариф →</a>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          case "cases": {
            const items = (c.items as Items) ?? [];
            if (!items.length) return null; // без проверяемых данных секцию не показываем
            return (
              <section key={b.key} className="mx-auto max-w-6xl px-4 py-14">
                <h2 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">{String(c.title ?? "Кейсы")}</h2>
                <div className="mt-8 grid gap-4 md:grid-cols-3">
                  {items.map((it, i) => (
                    <div key={i} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                      {it.metric && <div className="font-display text-3xl font-semibold text-[#7fd8c0]">{it.metric}</div>}
                      <h3 className="mt-2 font-semibold">{it.title}</h3>
                      <p className="mt-2 text-sm text-white/65">{it.text}</p>
                    </div>
                  ))}
                </div>
              </section>
            );
          }
          case "team":
            return (
              <section key={b.key} className="mx-auto max-w-6xl px-4 py-14">
                <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#e0162b]/15 to-transparent p-8 md:p-12">
                  <h2 className="font-display text-3xl font-semibold tracking-tight">{String(c.title ?? "")}</h2>
                  <p className="mt-4 max-w-3xl text-lg leading-relaxed text-white/75">{String(c.text ?? "")}</p>
                </div>
              </section>
            );
          case "faq": {
            const items = (c.items as Items) ?? [];
            if (!items.length) return null;
            return (
              <section key={b.key} id="faq" className="mx-auto max-w-3xl px-4 py-14">
                <h2 className="font-display text-3xl font-semibold tracking-tight">{String(c.title ?? "Вопросы")}</h2>
                <div className="mt-6 divide-y divide-white/10 rounded-2xl border border-white/10">
                  {items.map((it, i) => (
                    <details key={i} className="group p-5">
                      <summary className="flex cursor-pointer list-none items-center justify-between font-semibold">
                        {it.q}<span className="text-white/40 transition group-open:rotate-45">+</span>
                      </summary>
                      <p className="mt-3 text-white/70">{it.a}</p>
                    </details>
                  ))}
                </div>
              </section>
            );
          }
          case "contacts":
            return (
              <section key={b.key} id="contacts" className="mx-auto max-w-6xl px-4 py-14">
                <div id="lead" className="grid gap-8 md:grid-cols-[1fr_1.4fr]">
                  <div>
                    <h2 className="font-display text-3xl font-semibold tracking-tight">{String(c.title ?? "Контакты")}</h2>
                    <p className="mt-3 text-white/70">{String(c.text ?? "")}</p>
                    <ul className="mt-6 space-y-2 text-white/80">
                      {settings.phone && <li>Телефон: <a className="underline" href={`tel:${settings.phone}`}>{settings.phone}</a></li>}
                      {settings.email && <li>Email: <a className="underline" href={`mailto:${settings.email}`}>{settings.email}</a></li>}
                      {settings.address && <li>Адрес: {settings.address}</li>}
                      {settings.instagram && <li>Instagram: <a className="underline" href={settings.instagram} rel="noopener noreferrer" target="_blank">{settings.instagram.replace(/^https?:\/\//, "")}</a></li>}
                      {settings.telegram && <li>Telegram: {settings.telegram}</li>}
                    </ul>
                  </div>
                  <div className="text-ink [--bg:#101a17] [--surface:#16231f] [--surface-2:#1a2923] [--border:#2e4239] [--text:#e3eee9] [--muted:#93a89e]">
                    <LeadForm services={serviceOptions} />
                  </div>
                </div>
              </section>
            );
          default:
            return null;
        }
      })}

      <footer className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-8 text-sm text-white/50">
          <span>© {new Date().getFullYear()} SMM KADR · Бишкек</span>
          <div className="flex gap-4">
            <Link href="/privacy" className="hover:text-white">Политика конфиденциальности</Link>
            <Link href="/login" className="hover:text-white">Вход для сотрудников</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
