import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Camera, ChartLine, Check, Menu, Phone, Target, Video } from "lucide-react";
import type { Block, PublicTariff, Slide, SlideImage, SlideStat } from "@/lib/site";
import { NAV, slidePrice } from "@/lib/site-model";
import { cn } from "@/components/ui";
import { LeadCta } from "./lead-cta";
import { SiteLeadForm } from "./site-lead-form";
import "./site.css";

// Размеры исходных ассетов из презентации — next/image сам отдаёт AVIF/WebP нужной ширины.
const KNOWN: Record<string, [number, number]> = {
  "/site/equipment.webp": [941, 1672],
  "/site/partners.webp": [1206, 664],
  "/site/report.webp": [1312, 1199],
};
const PHONE: [number, number] = [706, 1536];
/** «80 000 → 25 000»: разряды числа не разрываются переносом строки. */
const nb = (t?: string) => (t ?? "").replace(/(\d)[ \u00a0](?=\d)/g, "$1\u00a0");

function Img({ img, sizes, className, priority }: { img: SlideImage; sizes: string; className?: string; priority?: boolean }) {
  const wh = KNOWN[img.src] ?? (img.src.startsWith("/site/phone-") ? PHONE : null);
  if (wh) return <Image src={img.src} alt={img.alt ?? ""} width={wh[0]} height={wh[1]} sizes={sizes} className={cn("h-auto w-full", className)} priority={priority} />;
  // изображения, загруженные через CMS (Supabase Storage)
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={img.src} alt={img.alt ?? ""} loading={priority ? "eager" : "lazy"} decoding="async" className={cn("h-auto w-full", className)} />;
}

function InstagramIcon({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" />
    </svg>
  );
}
function SiteIcon({ name }: { name: string }) {
  if (name === "instagram") return <InstagramIcon />;
  if (name === "ads") return <span className="rounded-md border-2 border-current px-1.5 text-[13px] font-extrabold leading-5">ADS</span>;
  const I = { target: Target, chart: ChartLine, camera: Camera, video: Video, phone: Phone, check: Check }[name] ?? Check;
  return <I size={26} aria-hidden />;
}

function Title({ s, hero }: { s: Slide; hero?: boolean }) {
  if (!s.title && !s.title_accent) return null;
  const Tag = hero ? "h1" : "h2";
  return (
    <Tag className={cn("k-display k-title", hero && "k-title-hero")}>
      {s.title}
      {s.title_accent && <><br className={s.title ? "" : "hidden"} /><span className="k-cyan">{s.title_accent}</span></>}
    </Tag>
  );
}

function Stats({ s }: { s: Slide }) {
  const list = s.stats ?? [];
  if (!list.length) return null;
  const style = s.stats_style ?? "grid";
  if (style === "team")
    return (
      <ul className="grid grid-cols-2 gap-3 sm:gap-4">
        {list.map((x, i) => (
          <li key={i} className="k-card p-4 sm:p-7">
            <div className="k-num text-[28px] sm:text-[34px]">{x.value}</div>
            <div className="k-label mt-2 text-[13px] min-[400px]:text-[15px] sm:text-[17px]">{x.label}</div>
          </li>
        ))}
      </ul>
    );
  if (style === "big") {
    const [first, ...rest] = list;
    return (
      <div className="space-y-3 sm:space-y-4">
        <div className="k-card k-card-pad">
          <div className="k-num text-[88px] sm:text-[120px]">{nb(first.value)}</div>
          {first.label && <div className="k-label mt-1 text-[22px] sm:text-[28px]">{first.label}</div>}
          {first.note && <p className="mt-3 font-bold text-[var(--k-muted)]">{first.note}</p>}
        </div>
        {rest.map((x, i) => <StatCard key={i} x={x} />)}
      </div>
    );
  }
  return (
    <ul className={cn("grid gap-3 sm:gap-4", style === "grid3" ? "grid-cols-3" : "grid-cols-2")}>
      {list.map((x, i) => (
        <li key={i} className={cn(x.wide && "col-span-2", style === "grid3" && "col-span-1")}>
          <StatCard x={x} compact={style === "grid3"} />
        </li>
      ))}
    </ul>
  );
}
function StatCard({ x, compact }: { x: SlideStat; compact?: boolean }) {
  return (
    <div className={cn("k-card h-full", compact ? "p-3 min-[400px]:p-4 sm:p-6" : "k-card-pad")}>
      <div className={cn("k-num", x.plain && "!text-white", x.wide ? "text-[36px] min-[400px]:text-[40px] sm:text-[56px]" : compact ? "text-[24px] min-[400px]:text-[32px] sm:text-[40px] lg:text-[36px] xl:text-[44px]" : "text-[44px] sm:text-[60px]")}>{nb(x.value)}</div>
      {x.label && <div className={cn("k-label mt-2", compact ? "text-[11px] min-[400px]:text-[12px] sm:text-[16px]" : "text-[14px] sm:text-[17px]")}>{x.label}</div>}
      {x.note && <div className="mt-1.5 text-[14px] font-semibold text-[var(--k-muted)]">{x.note}</div>}
    </div>
  );
}

function Bullets({ items }: { items?: string[] }) {
  if (!items?.length) return null;
  return (
    <ul className="k-card k-bullets px-5 py-2 sm:px-7 sm:py-3">
      {items.map((b, i) => <li key={i}>{b}</li>)}
    </ul>
  );
}

function Chips({ s }: { s: Slide }) {
  if (!s.chips?.length) return null;
  return (
    <div>
      {s.chips_title && <div className="k-pill mb-3">{s.chips_title}</div>}
      <ul className="k-card grid grid-cols-2 gap-x-4 gap-y-4 p-5 sm:grid-cols-3 sm:p-6">
        {s.chips.map((c, i) => <li key={i} className={cn("k-label text-[13px] sm:text-[14px]", i % 2 === 0 ? "k-cyan" : "text-white")}>{c}</li>)}
      </ul>
    </div>
  );
}

function AccentCard({ s }: { s: Slide }) {
  const c = s.card;
  if (!c || (!c.title && !c.text)) return null;
  return (
    <div className="k-card k-card-pad">
      {c.kicker && <div className="k-label k-cyan text-[13px]">{c.kicker}</div>}
      {c.title && <div className={cn("mt-1 text-[22px] font-extrabold leading-tight sm:text-[26px]", c.title_accent && "k-cyan", !c.kicker && "mt-0")}>{c.title}</div>}
      {c.text && <p className={cn("mt-2 text-[15px] font-bold leading-relaxed sm:text-base", c.text_accent ? "k-cyan" : "text-white/90")}>{c.text}</p>}
    </div>
  );
}

function Price({ s, tariffs }: { s: Slide; tariffs: PublicTariff[] }) {
  const { text } = slidePrice(s, tariffs);
  if (!text && !s.price_unit) return null;
  const long = text.length > 9;
  return (
    <div>
      {text && <div className={cn("k-display k-price", long && "k-price-sm", s.price_accent && "k-cyan")}>{nb(text)}</div>}
      {s.price_unit && <div className={cn("k-unit", s.price_unit_large && "k-unit-lg")}>{s.price_unit}</div>}
    </div>
  );
}

function Cta({ s }: { s: Slide }) {
  if (!s.cta && !s.cta2) return null;
  const one = (c: NonNullable<Slide["cta"]>, primary: boolean) =>
    c.action === "tariffs" ? (
      <a href="#tariffs" className={cn("k-btn", primary ? "k-btn-primary" : "k-btn-ghost")}>{c.label}</a>
    ) : c.action === "link" && c.href ? (
      <a href={c.href} className={cn("k-btn", primary ? "k-btn-primary" : "k-btn-ghost")} rel="noopener noreferrer">{c.label}</a>
    ) : (
      <LeadCta tariff={s.tariff_code} className={cn("k-btn", primary ? "k-btn-primary" : "k-btn-ghost")}>{c.label} <ArrowRight size={18} aria-hidden /></LeadCta>
    );
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
      {s.cta && one(s.cta, true)}
      {s.cta2 && one(s.cta2, false)}
    </div>
  );
}

function Visual({ s, first }: { s: Slide; first: boolean }) {
  const imgs = s.images ?? [];
  if (!imgs.length) return null;
  switch (s.image_style) {
    case "hero":
      return (
        <div className="relative mx-auto aspect-[5/6] w-full max-w-[560px]" aria-hidden={false}>
          {imgs[1] && (
            <div className="k-phone k-float absolute right-[2%] top-0 w-[44%] [--r:5deg]" style={{ transform: "rotate(5deg)" }}>
              <Img img={imgs[1]} sizes="(min-width:1024px) 240px, 40vw" priority={first} />
            </div>
          )}
          {imgs[2] && (
            <div className="k-phone k-float-2 absolute right-[27%] top-[15%] w-[34%] [--r:-4deg]" style={{ transform: "rotate(-4deg)" }}>
              <Img img={imgs[2]} sizes="(min-width:1024px) 200px, 34vw" />
            </div>
          )}
          {imgs[0] && (
            <div className="absolute bottom-0 left-0 w-[58%]">
              <Img img={imgs[0]} sizes="(min-width:1024px) 330px, 56vw" className="k-object" priority={first} />
            </div>
          )}
        </div>
      );
    case "object":
      return (
        <div className="mx-auto w-full max-w-[420px]">
          <Img img={imgs[0]} sizes="(min-width:1024px) 420px, 80vw" className="k-object" />
        </div>
      );
    case "phone":
      return (
        <div className="mx-auto w-[62%] max-w-[300px] sm:w-[48%] lg:w-full">
          <div className="k-phone"><Img img={imgs[0]} sizes="(min-width:1024px) 300px, 60vw" /></div>
        </div>
      );
    case "panel":
      return (
        <div className="space-y-3">
          {imgs.map((img, i) => (
            <figure key={i} className="k-card relative p-2.5 sm:p-3">
              <Img img={img} sizes="(min-width:1024px) 560px, 92vw" className="rounded-[14px]" />
              {img.caption && <figcaption className="k-pill absolute bottom-4 left-4 sm:bottom-5 sm:left-5">{img.caption}</figcaption>}
            </figure>
          ))}
        </div>
      );
    case "phones":
      return (
        <ul className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:mx-auto sm:grid sm:max-w-[920px] sm:grid-cols-3 sm:gap-6 sm:overflow-visible sm:px-0" aria-label="Профили клиентов">
          {imgs.map((img, i) => (
            <li key={i} className="w-[68%] flex-none snap-center sm:w-auto">
              <div className="k-phone"><Img img={img} sizes="(min-width:640px) 30vw, 66vw" /></div>
              {(img.caption || img.sub) && (
                <div className="k-card mt-3 px-4 py-3">
                  {img.caption && <div className="k-cyan text-[17px] font-extrabold">{img.caption}</div>}
                  {img.sub && <div className="k-label mt-1 text-[12px]">{img.sub}</div>}
                </div>
              )}
            </li>
          ))}
        </ul>
      );
    default:
      return null;
  }
}

function Icons({ s }: { s: Slide }) {
  if (!s.icons?.length) return null;
  return (
    <ul className="grid grid-cols-4 gap-2 sm:gap-3">
      {s.icons.map((x, i) => (
        <li key={i} className="k-card flex flex-col items-center gap-2 px-1 py-4 text-center">
          <span className="text-white"><SiteIcon name={x.icon} /></span>
          <span className="text-[12px] font-bold sm:text-[13px]">{x.label}</span>
        </li>
      ))}
    </ul>
  );
}

function Contacts({ settings }: { settings: Record<string, string | null> }) {
  const ig = settings.instagram;
  const igHandle = ig ? "@" + ig.replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/$/, "").replace(/^@/, "") : null;
  const igHref = ig ? (ig.startsWith("http") ? ig : `https://instagram.com/${ig.replace(/^@/, "")}`) : null;
  const wa = settings.whatsapp;
  const waHref = wa ? `https://wa.me/${wa.replace(/\D/g, "")}` : null;
  if (!ig && !wa && !settings.phone && !settings.email) return null;
  return (
    <div className="k-card k-card-pad space-y-4">
      {igHref && (
        <div>
          <div className="k-label k-cyan text-[13px]">Instagram</div>
          <a href={igHref} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex min-h-11 items-center text-[22px] font-extrabold hover:underline">{igHandle}</a>
        </div>
      )}
      {waHref && (
        <div>
          <div className="k-label k-cyan text-[13px]">WhatsApp</div>
          <a href={waHref} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex min-h-11 items-center text-[20px] font-extrabold hover:underline">{wa}</a>
        </div>
      )}
      {settings.phone && (
        <div>
          <div className="k-label k-cyan text-[13px]">Телефон</div>
          <a href={`tel:${settings.phone.replace(/[^\d+]/g, "")}`} className="mt-1 inline-flex min-h-11 items-center text-[20px] font-extrabold hover:underline">{settings.phone}</a>
        </div>
      )}
      {settings.email && (
        <div>
          <div className="k-label k-cyan text-[13px]">Email</div>
          <a href={`mailto:${settings.email}`} className="mt-1 inline-flex min-h-11 items-center text-[18px] font-bold hover:underline">{settings.email}</a>
        </div>
      )}
      {settings.address && <p className="font-semibold text-white/85">{settings.address}</p>}
    </div>
  );
}

function SlideSection({ b, index, tariffs, settings, tariffOptions }: { b: Block; index: number; tariffs: PublicTariff[]; settings: Record<string, string | null>; tariffOptions: { code: string; name: string }[] }) {
  const s = b.content as Slide;
  const hero = s.layout === "hero";
  const contact = s.layout === "contact";
  const wide = s.image_style === "phones";
  const visual = <Visual s={s} first={index === 0} />;
  const num = String(index + 1).padStart(2, "0");

  const text = (
    <div className="min-w-0 space-y-6 sm:space-y-7">
      {s.pill && <div className="k-pill">{s.pill}</div>}
      <Title s={s} hero={hero} />
      <Price s={s} tariffs={tariffs} />
      {s.lead && <p className={cn("k-lead", s.lead_accent && "k-cyan k-display !text-[clamp(1.05rem,3vw,1.5rem)]")}>{s.lead}</p>}
      {hero && s.badge && <div className="k-pill">{s.badge}</div>}
      <Stats s={s} />
      <Bullets items={s.bullets} />
      <Chips s={s} />
      {s.note && <p className="text-[15px] font-bold text-white/90">{s.note}</p>}
      {!hero && !contact && <AccentCard s={s} />}
      <Icons s={s} />
      {!hero && s.badge && <div className="k-pill">{s.badge}</div>}
      {s.footnote && <p className="k-foot">{s.footnote}</p>}
      {!contact && <Cta s={s} />}
      {hero && s.card?.title && (
        <div className="pt-2">
          <div className="k-display text-[28px] sm:text-[34px]">{s.card.title}</div>
          {s.card.text && <div className="k-label k-cyan mt-1 text-[13px] sm:text-[14px]">{s.card.text}</div>}
        </div>
      )}
    </div>
  );

  return (
    <section id={s.anchor || undefined} className="k-slide" aria-label={s.rubric || s.title || undefined}>
      <div className="k-wrap">
        {s.rubric && <div className="k-rubric"><b>{num}</b> {s.rubric}</div>}
        {contact ? (
          <div className="grid gap-8 lg:grid-cols-[1fr_1.05fr] lg:gap-12">
            <div className="min-w-0 space-y-6">
              {text}
              <Cta s={s} />
              <div className="grid items-start gap-4 sm:grid-cols-[1fr_auto]">
                <Contacts settings={settings} />
                {s.images?.[0] && <div className="hidden w-[190px] sm:block"><div className="k-phone"><Img img={s.images[0]} sizes="190px" /></div></div>}
              </div>
              <AccentCard s={s} />
            </div>
            <div id="lead" className="min-w-0 scroll-mt-24">
              <SiteLeadForm tariffs={tariffOptions} />
            </div>
          </div>
        ) : wide ? (
          <div className="space-y-8">
            <div className="max-w-3xl space-y-6">{text}</div>
            {visual}
          </div>
        ) : (
          <div className={cn("grid items-center gap-10 lg:gap-14", visual ? "lg:grid-cols-[1.05fr_0.95fr]" : "")}>
            {text}
            {visual}
          </div>
        )}
      </div>
    </section>
  );
}

// Блоки прежнего шаблона (скрыты по умолчанию). Если владелец включит их в CMS — показываем в новом стиле.
function LegacySection({ b, tariffs }: { b: Block; tariffs: PublicTariff[] }) {
  const c = b.content as { title?: string; subtitle?: string; text?: string; items?: { title?: string; text?: string; q?: string; a?: string; metric?: string }[] };
  const items = c.items ?? [];
  return (
    <section className="k-slide">
      <div className="k-wrap space-y-6">
        {c.title && <h2 className="k-display k-title !text-[clamp(2rem,5vw,3.2rem)]">{c.title}</h2>}
        {(c.subtitle || c.text) && <p className="k-lead max-w-3xl">{c.subtitle ?? c.text}</p>}
        {b.type === "tariffs" && (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tariffs.map((t) => (
              <li key={t.id} className="k-card k-card-pad">
                <div className="k-label k-cyan">{t.name}</div>
                {t.price_minor !== null && !t.price_on_request && <div className="k-display mt-2 text-3xl">{Math.round(t.price_minor / 100).toLocaleString("ru-RU")} {t.currency === "KGS" ? "сом" : t.currency}</div>}
                {t.description && <p className="mt-2 text-white/85">{t.description}</p>}
              </li>
            ))}
          </ul>
        )}
        {items.length > 0 && (
          <ul className="grid gap-4 sm:grid-cols-2">
            {items.map((it, i) => (
              <li key={i} className="k-card k-card-pad">
                {it.metric && <div className="k-num text-3xl">{it.metric}</div>}
                <div className="text-lg font-extrabold">{it.title ?? it.q}</div>
                <p className="mt-2 text-white/85">{it.text ?? it.a}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export function SiteView({ blocks, settings, tariffs, preview = false }: { blocks: Block[]; settings: Record<string, string | null>; tariffs: PublicTariff[]; preview?: boolean }) {
  const slides = blocks.filter((b) => b.type === "slide");
  const anchors = new Set(slides.map((b) => (b.content as Slide).anchor).filter(Boolean));
  const nav = NAV.filter(([id]) => anchors.has(id));
  const hasContact = slides.some((b) => (b.content as Slide).layout === "contact");
  const tariffOptions = tariffs.map((t) => ({ code: t.code, name: t.name }));
  let i = 0;

  return (
    <div className="kadr min-h-dvh">
      {preview && <div className="sticky top-0 z-50 bg-[#ffcf33] px-4 py-2 text-center text-sm font-bold text-black">Предпросмотр черновика — посетители сайта этого пока не видят</div>}
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-black">К содержимому</a>
      <header className="k-header">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-3 px-4 py-2.5 md:px-8">
          <Link href="/" className="flex min-h-11 items-center" aria-label="SMM KADR — на главную">
            <Image src="/brand/logo-horizontal-white.svg" alt="SMM KADR" width={176} height={35} priority unoptimized className="h-[30px] w-auto sm:h-[34px]" />
          </Link>
          <nav className="k-nav hidden items-center gap-6 lg:flex" aria-label="Разделы сайта">
            {nav.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
          </nav>
          <div className="flex items-center gap-1.5 sm:gap-3">
            <Link href="/login" className="hidden min-h-11 items-center px-2 text-sm font-bold text-white/75 hover:text-white sm:inline-flex">Вход</Link>
            {hasContact && (
              <LeadCta className="k-btn k-btn-primary !min-h-11 whitespace-nowrap !px-4 !py-2 !text-[13px]">
                <span className="sm:hidden">Заявка</span><span className="hidden sm:inline">Обсудить проект</span>
              </LeadCta>
            )}
            <details className="relative lg:hidden">
              <summary className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-xl text-white hover:bg-white/10" aria-label="Меню">
                <Menu size={24} aria-hidden />
              </summary>
              <nav className="k-card absolute right-0 mt-2 flex w-56 flex-col p-2" aria-label="Разделы сайта">
                {nav.map(([id, label]) => <a key={id} href={`#${id}`} className="rounded-lg px-3 hover:bg-white/10">{label}</a>)}
                <Link href="/login" className="rounded-lg px-3 text-white/75 hover:bg-white/10">Вход для сотрудников</Link>
              </nav>
            </details>
          </div>
        </div>
      </header>

      <main id="main">
        {blocks.map((b) => {
          if (b.type === "slide") return <SlideSection key={b.key} b={b} index={i++} tariffs={tariffs} settings={settings} tariffOptions={tariffOptions} />;
          return <LegacySection key={b.key} b={b} tariffs={tariffs} />;
        })}
        {!hasContact && (
          <section className="k-slide" id="lead-section">
            <div className="k-wrap"><div id="lead" className="mx-auto max-w-2xl"><SiteLeadForm tariffs={tariffOptions} /></div></div>
          </section>
        )}
      </main>

      <footer className="border-t border-white/10 bg-[#040d3a]">
        <div className="mx-auto grid max-w-[1200px] gap-6 px-4 py-10 text-sm text-white/70 md:grid-cols-[1fr_auto] md:px-8">
          <div>
            <Image src="/brand/logo-horizontal-white.svg" alt="SMM KADR" width={176} height={35} unoptimized className="h-[30px] w-auto" />
            <p className="mt-3 font-bold uppercase tracking-wide text-[var(--k-cyan)]">Маркетинг, который продаёт</p>
            <p className="mt-1">© {new Date().getFullYear()} SMM KADR · Бишкек</p>
          </div>
          <div className="flex flex-col gap-1 md:items-end">
            <Link href="/privacy" className="inline-flex min-h-11 items-center hover:text-white">Политика конфиденциальности</Link>
            <Link href="/login" className="inline-flex min-h-11 items-center hover:text-white">Вход для сотрудников</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
