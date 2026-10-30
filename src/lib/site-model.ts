// Модель блока сайта «slide» — одна страница коммерческого предложения SMM KADR.
// Блок собирается из необязательных полей; редактор CMS и рендер сайта используют одну схему.

export type SlideImage = { src: string; alt: string; caption?: string; sub?: string };
export type SlideStat = { value: string; label?: string; note?: string; wide?: boolean; plain?: boolean };
export type SlideCard = { kicker?: string; title?: string; title_accent?: boolean; text?: string; text_accent?: boolean };
export type SlideCta = { label: string; action: "lead" | "tariffs" | "link"; href?: string };

export type Slide = {
  layout?: "hero" | "default" | "contact";
  anchor?: string;
  rubric?: string;
  pill?: string;
  title?: string;
  title_accent?: string;
  price?: string;
  price_unit?: string;
  price_accent?: boolean;
  price_unit_large?: boolean;
  tariff_code?: string;
  lead?: string;
  lead_accent?: boolean;
  stats_style?: "team" | "big" | "grid" | "grid3";
  stats?: SlideStat[];
  bullets?: string[];
  chips_title?: string;
  chips?: string[];
  note?: string;
  card?: SlideCard;
  badge?: string;
  icons?: { icon: string; label: string }[];
  footnote?: string;
  image_style?: "hero" | "object" | "phone" | "panel" | "phones";
  images?: SlideImage[];
  cta?: SlideCta;
  cta2?: SlideCta;
};

export type PublicTariff = {
  id: string;
  code: string;
  name: string;
  price_on_request: boolean;
  price_minor: number | null;
  currency: string;
  period_type: string;
  composition: Record<string, number>;
  description: string | null;
};

export const ANCHORS: [string, string][] = [
  ["", "— без якоря —"],
  ["top", "Начало страницы"],
  ["services", "Услуги"],
  ["tariffs", "Тарифы"],
  ["cases", "Кейсы"],
  ["about", "О нас"],
  ["contacts", "Контакты"],
];
export const NAV: [string, string][] = [
  ["services", "Услуги"],
  ["tariffs", "Тарифы"],
  ["cases", "Кейсы"],
  ["about", "О нас"],
  ["contacts", "Контакты"],
];
export const ICONS = ["instagram", "target", "chart", "ads", "camera", "video", "phone", "check"] as const;

/** «10 500» — сумма в тыйынах в виде прайса (неразрывный пробел между тысячами). */
export function priceText(minor: number) {
  return Math.round(minor / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** Только цифры строки цены: «80 000 → 25 000» → «8000025000», «10 500» → «10500». */
export const priceDigits = (s: string) => s.replace(/\D/g, "");

/**
 * Цена для показа: текст из CMS; если пуст — текущая версия тарифа из справочника.
 * mismatch = цена на сайте отличается от справочника (подсказка в CMS: справочник используется в мастере проекта).
 */
export function slidePrice(s: Slide, tariffs: PublicTariff[]): { text: string; mismatch: PublicTariff | null } {
  const t = s.tariff_code ? tariffs.find((x) => x.code === s.tariff_code) : undefined;
  const own = (s.price ?? "").trim();
  if (!t || t.price_on_request || t.price_minor === null) return { text: own, mismatch: null };
  const dir = priceText(t.price_minor);
  if (!own) return { text: dir, mismatch: null };
  // сравниваем только «простые» цены вида «43 999»; составные («80 000 → 25 000», «500 000 СОМ») — по первой сумме
  const first = own.match(/\d[\d\s]*/)?.[0] ?? "";
  return { text: own, mismatch: priceDigits(first) === priceDigits(dir) ? null : t };
}

/** Разбор строк редактора: «значение | подпись | примечание». */
export function parseLines(raw: string) {
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.split("|").map((x) => x.trim()));
}

export function asSlide(content: Record<string, unknown>): Slide {
  return content as Slide;
}
