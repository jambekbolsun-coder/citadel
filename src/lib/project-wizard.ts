// Мастер «Добавить проект»: состояние, проверки шагов и сборка запроса к project_wizard_create.
// Чистые функции без React — покрыты тестами (project-wizard.test.ts).
import { parseMoney } from "@/lib/format";
import { normalizePhone } from "@/lib/phone";

export const CONTENT_KINDS: [string, string][] = [["video", "Видео"], ["story", "Сторис"], ["post", "Посты"], ["carousel", "Карусели"], ["ad_creative", "Рекламные креативы"], ["shoot", "Съёмки"]];
export const PROJECT_KINDS: [string, string, string][] = [
  ["one_time", "Разовый", "Один объём работ, без ежемесячного повторения"],
  ["monthly", "Месячный", "Объём на каждый месяц, план периода — в календаре"],
  ["yearly", "Годовой", "Предоплата за год, объём помесячно"],
  ["custom", "Индивидуальный", "Свои условия и состав"],
];
export const NICHES = ["Строительство", "Недвижимость", "Спецтехника", "Ресторан / кафе", "Красота и здоровье", "Медицина", "Образование", "Торговля / магазин", "Авто", "Услуги", "Производство", "Туризм", "IT / онлайн"];
export const SOURCES = ["Сайт", "Instagram", "Рекомендация", "WhatsApp", "Повторный клиент", "Холодный контакт"];
export const TEAM_ROLES: [string, string][] = [["targetologist", "Таргетолог"], ["mobilographer", "Мобилограф"], ["designer", "Дизайнер"], ["editor", "Монтажёр"], ["ambassador", "Амбассадор"], ["scriptwriter", "Сценарист"], ["marketer", "Маркетолог"], ["member", "Участник"]];

export type Tariff = { id: string; code: string; name: string; version_id: string; price_minor: number; currency: string; period_type: string; period_months: number; composition: Record<string, number>; stories_method: string | null; notes: string | null };

export type ClientDraft = {
  contact_name: string; phone: string; company_name: string; niche: string; niche_other: string;
  whatsapp: string; whatsapp_same: boolean; instagram: string; tiktok: string; facebook: string;
  address: string; source: string; notes: string;
};
export type WizardState = {
  mode: "new" | "existing";
  client: ClientDraft;
  existing: { id: string; company_name: string; contact_name: string | null; phone: string | null; niche: string | null } | null;
  update_client: boolean;
  force_new_client: boolean;
  name: string; name_touched: boolean;
  kind: string; tariff_version_id: string; niche: string;
  price: string; currency: string;
  composition: Record<string, string>; stories_method: string;
  contract_start: string; contract_end: string; work_start: string;
  wishes: string;
  admin_id: string; manager_id: string; creative_director_id: string;
  team: { user_id: string; role: string }[];
  paid: string; paid_on: string; paid_method: string; next_payment_on: string; payment_terms: string;
  lead_id: string;
};

export const emptyClient = (): ClientDraft => ({ contact_name: "", phone: "", company_name: "", niche: "", niche_other: "", whatsapp: "", whatsapp_same: true, instagram: "", tiktok: "", facebook: "", address: "", source: "", notes: "" });

export function initialState(me: string, today: string): WizardState {
  return {
    mode: "new", client: emptyClient(), existing: null, update_client: false, force_new_client: false,
    name: "", name_touched: false, kind: "monthly", tariff_version_id: "", niche: "",
    price: "", currency: "KGS", composition: {}, stories_method: "",
    contract_start: today, contract_end: "", work_start: "", wishes: "",
    admin_id: "", manager_id: me, creative_director_id: "", team: [],
    paid: "", paid_on: today, paid_method: "", next_payment_on: "", payment_terms: "", lead_id: "",
  };
}

export const nicheOf = (c: ClientDraft) => (c.niche === "other" ? c.niche_other.trim() : c.niche.trim());

/** Тип проекта по тарифу: разовый тариф не превращается в месячный план. */
export function kindFromTariff(t: Pick<Tariff, "period_type">): string {
  return t.period_type === "one_time" ? "one_time" : t.period_type === "yearly" ? "yearly" : "monthly";
}

/** Применить версию тарифа: цена, тип, состав и метод сторис из справочника (дальше их можно уточнить). */
export function applyTariff(s: WizardState, t: Tariff | null): WizardState {
  if (!t) return { ...s, tariff_version_id: "" };
  return {
    ...s,
    tariff_version_id: t.version_id,
    kind: kindFromTariff(t),
    price: String(t.price_minor / 100),
    currency: t.currency,
    composition: Object.fromEntries(Object.entries(t.composition).map(([k, v]) => [k, String(v)])),
    stories_method: t.stories_method ?? "",
  };
}

/** Сколько сторис даст метод «4 каждый день» за месяц из N дней — для подсказки (120 ≠ 4 × 31). */
export const storiesFourDaily = (days: number) => 4 * days;

function money(v: string, label: string): number | null {
  try {
    return parseMoney(v);
  } catch {
    throw new Error(`${label}: укажите сумму цифрами, например 43 999 или 15000.50`);
  }
}

export type MoneySummary = { price: number; declared: number; remainder: number; confirmed: number };
/** Деньги проекта при создании: подтверждённая оплата = 0 (заявленная ждёт независимого подтверждения), остаток считается от подтверждённой. */
export function moneySummary(s: Pick<WizardState, "price" | "paid">): MoneySummary {
  const price = money(s.price, "Стоимость") ?? 0;
  const declared = money(s.paid, "Оплата") ?? 0;
  return { price, declared, confirmed: 0, remainder: price };
}

/** Проверка шага; null — можно идти дальше. Сообщения — для человека. */
export function stepError(step: number, s: WizardState): string | null {
  if (step === 0) {
    if (s.mode === "existing") return s.existing ? null : "Выберите клиента из базы или переключитесь на «Новый клиент»";
    if (s.client.contact_name.trim().length < 2) return "Укажите ФИО контактного лица";
    if (!s.client.phone.trim()) return "Укажите номер телефона клиента";
    try {
      normalizePhone(s.client.phone);
    } catch (e) {
      return (e as Error).message;
    }
    if (!s.client.whatsapp_same && s.client.whatsapp.trim()) {
      try {
        normalizePhone(s.client.whatsapp);
      } catch {
        return "WhatsApp: некорректный номер";
      }
    }
    if (s.client.niche === "other" && !s.client.niche_other.trim()) return "Укажите нишу или выберите её из списка";
    return null;
  }
  if (step === 1) {
    if (!PROJECT_KINDS.some(([k]) => k === s.kind) && s.kind !== "one_time_shoot") return "Выберите тип проекта";
    try {
      const p = money(s.price, "Стоимость");
      if (p === null) return "Укажите стоимость договора (0 — если бесплатно)";
    } catch (e) {
      return (e as Error).message;
    }
    for (const [k, l] of CONTENT_KINDS) {
      const v = s.composition[k];
      if (v && !/^\d{1,5}$/.test(v.trim())) return `${l}: укажите целое число`;
    }
    if (s.contract_end && s.contract_start && s.contract_end < s.contract_start) return "Окончание договора раньше даты начала";
    return null;
  }
  if (step === 2) {
    try {
      const { price, declared } = moneySummary(s);
      if (declared > price) return "Оплата клиента больше стоимости договора";
      if (declared > 0 && !s.paid_on) return "Укажите дату оплаты";
    } catch (e) {
      return (e as Error).message;
    }
    return null;
  }
  return null;
}

/** Запрос к project_wizard_create (суммы — в тыйынах, телефоны — нормализованы). */
export function buildPayload(s: WizardState, key: string) {
  const { price, declared } = moneySummary(s);
  const c = s.client;
  const client =
    s.mode === "new" || s.update_client
      ? {
          contact_name: c.contact_name.trim(), company_name: c.company_name.trim(), niche: nicheOf(c),
          phone: c.phone.trim() ? normalizePhone(c.phone) : "",
          whatsapp: c.whatsapp_same ? "" : c.whatsapp.trim() ? normalizePhone(c.whatsapp) : "",
          whatsapp_same: c.whatsapp_same,
          socials: { instagram: c.instagram.trim(), tiktok: c.tiktok.trim(), facebook: c.facebook.trim() },
          address: c.address.trim(), source: c.source.trim(), notes: c.notes.trim(),
        }
      : {};
  return {
    idempotency_key: key,
    client_id: s.mode === "existing" ? s.existing?.id ?? "" : "",
    client,
    update_client: s.mode === "existing" && s.update_client,
    force_new_client: s.force_new_client,
    name: s.name.trim(),
    kind: s.kind,
    tariff_version_id: s.tariff_version_id,
    niche: s.niche.trim(),
    price_minor: price,
    currency: s.currency,
    composition: Object.fromEntries(Object.entries(s.composition).filter(([, v]) => v.trim() !== "").map(([k, v]) => [k, Number(v)])),
    stories_method: s.stories_method,
    contract_start: s.contract_start, contract_end: s.contract_end, work_start: s.work_start,
    wishes: s.wishes.trim(),
    admin_id: s.admin_id, manager_id: s.manager_id, creative_director_id: s.creative_director_id,
    team: s.team.filter((m) => m.user_id),
    paid_minor: declared, paid_on: declared > 0 ? s.paid_on : "", paid_method: s.paid_method.trim(),
    next_payment_on: s.next_payment_on, payment_terms: s.payment_terms.trim(),
    lead_id: s.lead_id,
  };
}

/** Название проекта по умолчанию: бренд → компания → ФИО. */
export function defaultName(s: WizardState): string {
  if (s.mode === "existing") return s.existing?.company_name ?? "";
  return s.client.company_name.trim() || s.client.contact_name.trim();
}
