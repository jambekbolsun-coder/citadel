"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { Check, ChevronLeft, ChevronRight, Search, Trash2, UserPlus, Users } from "lucide-react";
import { btn, cn } from "@/components/ui";
import { money } from "@/lib/format";
import { formatPhone, phoneKey } from "@/lib/phone";
import {
  CONTENT_KINDS, NICHES, PROJECT_KINDS, SOURCES, TEAM_ROLES, applyTariff, buildPayload, defaultName, initialState,
  moneySummary, nicheOf, stepError, storiesFourDaily, type Tariff, type WizardState,
} from "@/lib/project-wizard";
import { createProjectWizard, lookupClients, type ClientHit, type WizardResult } from "../actions";

type P = { id: string; full_name: string; job_title: string | null };
type Existing = NonNullable<WizardState["existing"]>;
const STEPS = ["Клиент", "Проект и тариф", "Команда и оплата"];
const DRAFT_KEY = "kadr.projectWizard.draft.v1";

function F({ label, hint, error, children, className }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="label">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-xs font-semibold text-bad">{error}</span> : hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}
function PSel({ value, onChange, people, empty = "— назначить позже —" }: { value: string; onChange: (v: string) => void; people: P[]; empty?: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="input">
      <option value="">{empty}</option>
      {people.map((p) => <option key={p.id} value={p.id}>{p.full_name}{p.job_title ? ` · ${p.job_title}` : ""}</option>)}
    </select>
  );
}
const hitToExisting = (h: ClientHit): Existing => ({ id: h.id, company_name: h.company_name, contact_name: h.contact_name, phone: h.phone, niche: h.niche });

export function ProjectWizard({
  tariffs, people, byRole, me, today, canPrices, canPayments, canManageClients, preset,
}: {
  tariffs: Tariff[]; people: P[]; byRole: Record<string, P[]>; me: string; today: string;
  canPrices: boolean; canPayments: boolean; canManageClients: boolean;
  preset: { existing?: Existing | null; lead?: { id: string; name: string; phone: string; business: string | null; tariff_id: string | null } | null };
}) {
  const fresh = (): WizardState => {
    const s = initialState(me, today);
    if (preset.existing) return { ...s, mode: "existing", existing: preset.existing, name: preset.existing.company_name, niche: preset.existing.niche ?? "", lead_id: preset.lead?.id ?? "" };
    if (preset.lead) {
      const t = tariffs.find((x) => x.id === preset.lead!.tariff_id) ?? null;
      return applyTariff({ ...s, lead_id: preset.lead.id, client: { ...s.client, contact_name: preset.lead.name, phone: preset.lead.phone, company_name: preset.lead.business ?? "", source: "Сайт" } }, t);
    }
    return s;
  };
  const [s, setS] = useState<WizardState>(fresh);
  const [step, setStep] = useState(0);
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);
  const [dup, setDup] = useState<NonNullable<Extract<WizardResult, { ok: false }>["duplicate_client"]> | null>(null);
  const [done, setDone] = useState<Extract<WizardResult, { ok: true }> | null>(null);
  const [pending, start] = useTransition();
  const [draftInfo, setDraftInfo] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const top = useRef<HTMLDivElement>(null);

  const set = <K extends keyof WizardState>(k: K, v: WizardState[K]) => setS((x) => ({ ...x, [k]: v }));
  const setC = (k: keyof WizardState["client"], v: string | boolean) => setS((x) => ({ ...x, client: { ...x.client, [k]: v } }));

  // черновик на этом устройстве (только по кнопке; телефон клиента не уходит за пределы браузера)
  useEffect(() => {
    if (preset.existing || preset.lead) return;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) setDraftInfo(JSON.parse(raw).savedAt ?? null);
    } catch {}
  }, [preset.existing, preset.lead]);
  function saveDraft() {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ s, step, savedAt: new Date().toLocaleString("ru-RU", { timeZone: "Asia/Bishkek" }) }));
      setSavedNote("Черновик сохранён на этом устройстве");
      window.setTimeout(() => setSavedNote(null), 2500);
    } catch {
      setSavedNote("Не удалось сохранить черновик в браузере");
    }
  }
  function restoreDraft() {
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null");
      if (d?.s) {
        setS({ ...initialState(me, today), ...d.s });
        setStep(Math.min(2, Number(d.step) || 0));
      }
    } catch {}
    setDraftInfo(null);
  }
  const dropDraft = () => {
    try { localStorage.removeItem(DRAFT_KEY); } catch {}
    setDraftInfo(null);
  };

  // поиск совпадений: телефон (≥6 цифр) или компания/ФИО (≥3 символа)
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<ClientHit[]>([]);
  const [similar, setSimilar] = useState<ClientHit[]>([]);
  useEffect(() => {
    if (s.mode !== "existing") return;
    const t = window.setTimeout(async () => setHits(q.trim().length >= 2 ? await lookupClients(q) : []), 250);
    return () => window.clearTimeout(t);
  }, [q, s.mode]);
  const probe = s.mode === "new" ? ((s.client.phone.replace(/\D/g, "").length >= 6 && s.client.phone) || (s.client.company_name.trim().length >= 3 && s.client.company_name) || "") : "";
  useEffect(() => {
    if (!probe) { setSimilar([]); return; }
    const t = window.setTimeout(async () => {
      const r = await lookupClients(probe);
      const pk = phoneKey(s.client.phone);
      setSimilar(r.filter((h) => h.match === "phone" || (pk && phoneKey(h.phone) === pk) || h.company_name.toLowerCase() === s.client.company_name.trim().toLowerCase()));
    }, 350);
    return () => window.clearTimeout(t);
  }, [probe, s.client.phone, s.client.company_name]);

  function pickExisting(h: ClientHit) {
    setS((x) => ({
      ...x, mode: "existing", existing: hitToExisting(h), update_client: false, force_new_client: false,
      name: x.name_touched ? x.name : h.company_name, niche: x.niche || h.niche || "",
      client: { ...x.client, contact_name: h.contact_name ?? "", phone: h.phone ?? "", company_name: h.company_name, niche: h.niche ?? "", whatsapp: h.whatsapp ?? "", whatsapp_same: !h.whatsapp, instagram: h.socials?.instagram ?? "", address: h.address ?? "" },
    }));
    setSimilar([]); setHits([]); setQ(""); setDup(null); setError(null);
  }

  const sum = useMemo(() => { try { return moneySummary(s); } catch { return null; } }, [s]);
  const tariff = tariffs.find((t) => t.version_id === s.tariff_version_id) ?? null;
  const stories = Number(s.composition.story || 0);

  function go(n: number) {
    if (n > step) {
      const e = stepError(step, s);
      if (e) { setError(e); return; }
      if (step === 0 && !s.name_touched) setS((x) => ({ ...x, name: defaultName(x), niche: x.niche || nicheOf(x.client) || x.existing?.niche || "" }));
    }
    setError(null);
    setStep(n);
    top.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  function submit(force = false) {
    for (const i of [0, 1, 2]) {
      const e = stepError(i, s);
      if (e) { setStep(i); setError(e); return; }
    }
    setError(null);
    const state = force ? { ...s, force_new_client: true } : s;
    let payload;
    try { payload = buildPayload(state, key); } catch (e) { setError((e as Error).message); return; }
    start(async () => {
      const r = await createProjectWizard(payload);
      if (r.ok) {
        setDone(r); setDup(null);
        try { localStorage.removeItem(DRAFT_KEY); } catch {}
      } else if (r.duplicate_client) {
        setDup(r.duplicate_client);
      } else {
        setError(r.error ?? "Не удалось создать проект. Данные формы сохранены — исправьте и повторите.");
      }
    });
  }

  if (done) {
    return (
      <div className="mx-auto max-w-xl rounded-3xl border border-line bg-surface p-6 text-center sm:p-8" role="status">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-good-soft text-good"><Check size={30} /></div>
        <h2 className="font-display text-2xl font-extrabold">Проект создан</h2>
        <p className="mt-2 text-muted">
          {done.repeat ? "Этот проект уже был создан по первому нажатию — дубль не появился." : done.client_created ? "Новый клиент добавлен в базу клиентов и связан с проектом." : "Проект добавлен к клиенту из базы — профиль клиента не дублировался."}
          {done.payment_id ? " Заявленная оплата ждёт подтверждения бухгалтерией — до этого она не считается поступившей." : ""}
        </p>
        <div className="mt-6 grid gap-2">
          <Link href={`/app/projects/${done.project_id}`} className={btn("primary", "w-full")}>Открыть проект</Link>
          <Link href={`/app/projects/${done.project_id}?tab=plan`} className={btn("secondary", "w-full")}>Распределить задачи в календаре</Link>
          <button type="button" className={btn("secondary", "w-full")} onClick={() => { setS(initialState(me, today)); setStep(0); setKey(crypto.randomUUID()); setDone(null); }}>Добавить ещё проект</button>
          <Link href={`/app/clients/${done.client_id}`} className="mt-1 text-sm text-primary underline">Карточка клиента в базе</Link>
        </div>
      </div>
    );
  }

  return (
    <div ref={top} className="mx-auto max-w-2xl scroll-mt-20">
      {draftInfo && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface p-3 text-sm">
          <span className="flex-1">Есть сохранённый черновик ({draftInfo}).</span>
          <button type="button" onClick={restoreDraft} className={btn("primary")}>Продолжить</button>
          <button type="button" onClick={dropDraft} className={btn("secondary")}>Удалить</button>
        </div>
      )}
      {/* прогресс */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold">Шаг {step + 1}/3 · {STEPS[step]}</span>
          <span className="text-muted">{STEPS.map((x, i) => (i < step ? "●" : i === step ? "◉" : "○")).join(" ")}</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${((step + 1) / 3) * 100}%` }} /></div>
      </div>

      <div className="space-y-4 rounded-3xl border border-line bg-surface p-4 sm:p-6">
        {step === 0 && (
          <>
            <div role="radiogroup" aria-label="Клиент" className="grid grid-cols-2 gap-1 rounded-2xl bg-surface-2 p-1">
              {([["new", "Новый клиент", UserPlus], ["existing", "Уже в базе", Users]] as const).map(([m, l, I]) => (
                <button key={m} type="button" role="radio" aria-checked={s.mode === m} onClick={() => { set("mode", m); setError(null); }}
                  className={cn("flex min-h-11 items-center justify-center gap-2 rounded-xl text-sm font-semibold", s.mode === m ? "bg-surface shadow-sm" : "text-muted")}>
                  <I size={17} /> {l}
                </button>
              ))}
            </div>

            {s.mode === "existing" ? (
              <div className="space-y-3">
                {s.existing ? (
                  <div className="rounded-2xl border border-primary/40 bg-brand-soft/40 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold">{s.existing.company_name}</div>
                        <div className="text-sm text-muted">{[s.existing.contact_name, formatPhone(s.existing.phone), s.existing.niche].filter(Boolean).join(" · ")}</div>
                      </div>
                      <button type="button" onClick={() => set("existing", null)} className="text-sm text-primary">Сменить</button>
                    </div>
                    {canManageClients && (
                      <label className="mt-3 flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={s.update_client} onChange={(e) => set("update_client", e.target.checked)} className="h-4 w-4" /> Уточнить данные клиента (изменения попадут в его профиль)</label>
                    )}
                  </div>
                ) : (
                  <>
                    <F label="Поиск по телефону, ФИО или компании">
                      <div className="relative">
                        <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                        <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus placeholder="0555 123 456 или «Kausar»" className="input pl-10!" inputMode="search" />
                      </div>
                    </F>
                    {q.trim().length >= 2 && hits.length === 0 && <p className="text-sm text-muted">Не найдено. Проверьте написание или создайте нового клиента.</p>}
                    <ul className="space-y-2">
                      {hits.map((h) => (
                        <li key={h.id}>
                          <button type="button" onClick={() => pickExisting(h)} className="flex w-full items-center justify-between gap-3 rounded-2xl border border-line p-3 text-left hover:bg-surface-2">
                            <span className="min-w-0"><span className="block truncate font-semibold">{h.company_name}</span><span className="block truncate text-sm text-muted">{[h.contact_name, formatPhone(h.phone), h.niche].filter(Boolean).join(" · ")}</span></span>
                            <span className="shrink-0 text-xs text-muted">проектов: {h.projects}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            ) : null}

            {(s.mode === "new" || s.update_client) && (
              <div className="grid gap-3 sm:grid-cols-2">
                <F label="ФИО контактного лица *" className="sm:col-span-2"><input value={s.client.contact_name} onChange={(e) => setC("contact_name", e.target.value)} autoComplete="off" className="input" placeholder="Асанов Бекжан" /></F>
                <F label="Телефон *" hint="Кыргызстан: 0555 123 456 или +996…; другие страны — с кодом">
                  <input value={s.client.phone} onChange={(e) => setC("phone", e.target.value)} type="tel" inputMode="tel" className="input" placeholder="+996 555 123 456" />
                </F>
                <F label="Компания / бренд"><input value={s.client.company_name} onChange={(e) => setC("company_name", e.target.value)} className="input" placeholder="Kausar Building" /></F>
                <F label="Ниша бизнеса">
                  <select value={s.client.niche && !NICHES.includes(s.client.niche) && s.client.niche !== "other" ? "other" : s.client.niche} onChange={(e) => setC("niche", e.target.value)} className="input">
                    <option value="">— выберите —</option>
                    {NICHES.map((n) => <option key={n} value={n}>{n}</option>)}
                    <option value="other">Другая…</option>
                  </select>
                </F>
                {(s.client.niche === "other" || (s.client.niche && !NICHES.includes(s.client.niche))) && (
                  <F label="Своя ниша"><input value={s.client.niche === "other" ? s.client.niche_other : s.client.niche} onChange={(e) => { setC("niche", "other"); setC("niche_other", e.target.value); }} className="input" /></F>
                )}
                <div className="sm:col-span-2">
                  <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={s.client.whatsapp_same} onChange={(e) => setC("whatsapp_same", e.target.checked)} className="h-4 w-4" /> WhatsApp на этом же номере</label>
                  {!s.client.whatsapp_same && <input value={s.client.whatsapp} onChange={(e) => setC("whatsapp", e.target.value)} type="tel" inputMode="tel" placeholder="WhatsApp: +996…" className="input mt-1" />}
                </div>
                <details className="sm:col-span-2">
                  <summary className="cursor-pointer py-2 text-sm font-semibold text-primary">Соцсети, адрес, источник (необязательно)</summary>
                  <div className="grid gap-3 pt-2 sm:grid-cols-2">
                    <F label="Instagram"><input value={s.client.instagram} onChange={(e) => setC("instagram", e.target.value)} placeholder="@brand или ссылка" className="input" /></F>
                    <F label="TikTok"><input value={s.client.tiktok} onChange={(e) => setC("tiktok", e.target.value)} className="input" /></F>
                    <F label="Facebook"><input value={s.client.facebook} onChange={(e) => setC("facebook", e.target.value)} className="input" /></F>
                    <F label="Источник обращения">
                      <select value={s.client.source} onChange={(e) => setC("source", e.target.value)} className="input"><option value="">—</option>{SOURCES.map((x) => <option key={x}>{x}</option>)}</select>
                    </F>
                    <F label="Адрес" className="sm:col-span-2"><input value={s.client.address} onChange={(e) => setC("address", e.target.value)} className="input" /></F>
                    {s.mode === "new" && <F label="Комментарий о клиенте" className="sm:col-span-2"><textarea value={s.client.notes} onChange={(e) => setC("notes", e.target.value)} rows={2} className="input" /></F>}
                  </div>
                </details>
              </div>
            )}

            {s.mode === "new" && similar.length > 0 && (
              <div className="rounded-2xl border border-warn/50 bg-warn-soft p-3 text-sm" role="status">
                <div className="font-semibold text-warn">Похоже, клиент уже в базе — выберите его, чтобы не создавать дубль:</div>
                <ul className="mt-2 space-y-2">
                  {similar.slice(0, 3).map((h) => (
                    <li key={h.id} className="flex flex-wrap items-center justify-between gap-2">
                      <span>{h.company_name} · {[h.contact_name, formatPhone(h.phone)].filter(Boolean).join(" · ")}</span>
                      <button type="button" onClick={() => pickExisting(h)} className={btn("secondary", "min-h-9 px-3 py-1")}>Выбрать</button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        {step === 1 && (
          <>
            <F label="Тариф" hint={tariffs.length ? "Состав услуг подставится из текущей версии тарифа — договор сохранит снимок условий" : "Справочник тарифов недоступен — укажите индивидуальные условия"}>
              <select value={s.tariff_version_id} onChange={(e) => setS((x) => applyTariff(x, tariffs.find((t) => t.version_id === e.target.value) ?? null))} className="input">
                <option value="">Индивидуальные условия</option>
                {tariffs.map((t) => <option key={t.version_id} value={t.version_id}>{t.name} — {money(t.price_minor, t.currency)}{t.period_type === "monthly" ? " / мес" : t.period_type === "yearly" ? " / год" : " разово"}</option>)}
              </select>
            </F>
            {tariff?.notes && <p className="rounded-xl bg-warn-soft p-3 text-sm text-warn">{tariff.notes}</p>}
            <div>
              <span className="label">Тип проекта</span>
              <div role="radiogroup" className="grid grid-cols-2 gap-2">
                {PROJECT_KINDS.map(([k, l, h]) => (
                  <button key={k} type="button" role="radio" aria-checked={s.kind === k} onClick={() => set("kind", k)}
                    className={cn("min-h-16 rounded-2xl border p-3 text-left", s.kind === k ? "border-primary bg-brand-soft/50" : "border-line")}>
                    <span className="block font-semibold">{l}</span><span className="block text-xs text-muted">{h}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <F label="Название проекта" hint="По умолчанию — название бренда"><input value={s.name} onChange={(e) => setS((x) => ({ ...x, name: e.target.value, name_touched: true }))} className="input" /></F>
              <F label="Ниша проекта" hint="Если отличается от ниши клиента"><input value={s.niche} onChange={(e) => set("niche", e.target.value)} className="input" list="niches" /></F>
              <datalist id="niches">{NICHES.map((n) => <option key={n} value={n} />)}</datalist>
              {canPrices ? (
                <>
                  <F label={s.kind === "monthly" ? "Стоимость в месяц *" : s.kind === "yearly" ? "Стоимость за год *" : "Стоимость договора *"}>
                    <input value={s.price} onChange={(e) => set("price", e.target.value)} inputMode="decimal" className="input" placeholder="43 999" />
                  </F>
                  <F label="Валюта"><select value={s.currency} onChange={(e) => set("currency", e.target.value)} className="input"><option>KGS</option><option>USD</option></select></F>
                </>
              ) : (
                <p className="text-sm text-muted sm:col-span-2">Цена договора задаётся сотрудником с правом на цены. Будет взята из тарифа.</p>
              )}
              <F label="Дата договора"><input type="date" value={s.contract_start} onChange={(e) => set("contract_start", e.target.value)} className="input" /></F>
              <F label="Окончание / расчётный период до"><input type="date" value={s.contract_end} onChange={(e) => set("contract_end", e.target.value)} className="input" /></F>
              <F label="Планируемое начало работ" hint="Можно уточнить позже"><input type="date" value={s.work_start} onChange={(e) => set("work_start", e.target.value)} className="input" /></F>
            </div>
            <details open={!s.tariff_version_id} className="rounded-2xl border border-line">
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">
                Состав услуг{s.kind === "monthly" ? " на месяц" : s.kind === "yearly" ? " на месяц (годовой договор)" : ""}: {CONTENT_KINDS.filter(([k]) => Number(s.composition[k] || 0) > 0).map(([k, l]) => `${l.toLowerCase()} ${s.composition[k]}`).join(", ") || "не задан"}
              </summary>
              <div className="grid grid-cols-2 gap-3 border-t border-line p-4 sm:grid-cols-3">
                {CONTENT_KINDS.map(([k, l]) => (
                  <F key={k} label={l}><input value={s.composition[k] ?? ""} onChange={(e) => set("composition", { ...s.composition, [k]: e.target.value })} inputMode="numeric" className="input" /></F>
                ))}
                {stories > 0 && (
                  <F label="Как считать сторис" className="col-span-2 sm:col-span-3" hint={s.stories_method === "four_each_calendar_day" ? `По 4 каждый календарный день: ${storiesFourDaily(28)}–${storiesFourDaily(31)} в месяц (не ровно ${stories}).` : `Ровно ${stories} за период, распределяются по дням.`}>
                    <select value={s.stories_method} onChange={(e) => set("stories_method", e.target.value)} className="input">
                      <option value="fixed_per_period">Фиксированно {stories} за период</option>
                      <option value="four_each_calendar_day">По 4 каждый день</option>
                    </select>
                  </F>
                )}
                {s.kind === "one_time" && <p className="col-span-2 text-xs text-muted sm:col-span-3">Разовый проект: один объём работ, ежемесячный план не создаётся.</p>}
              </div>
            </details>
            <F label="Пожелания клиента"><textarea value={s.wishes} onChange={(e) => set("wishes", e.target.value)} rows={2} className="input" /></F>
          </>
        )}

        {step === 2 && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <F label="Администратор проекта" hint={!s.admin_id ? "Можно позже — создадим вам напоминание" : undefined}><PSel value={s.admin_id} onChange={(v) => set("admin_id", v)} people={byRole.admin?.length ? byRole.admin : people} /></F>
              <F label="Менеджер проекта"><PSel value={s.manager_id} onChange={(v) => set("manager_id", v)} people={people} /></F>
              <F label="Креативный директор"><PSel value={s.creative_director_id} onChange={(v) => set("creative_director_id", v)} people={byRole.creative_director?.length ? byRole.creative_director : people} /></F>
            </div>
            <div>
              <span className="label">Команда проекта</span>
              <ul className="space-y-2">
                {s.team.map((m, i) => {
                  const pool = byRole[m.role]?.length ? byRole[m.role] : people;
                  return (
                    <li key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                      <select value={m.role} onChange={(e) => set("team", s.team.map((x, j) => (j === i ? { ...x, role: e.target.value, user_id: "" } : x)))} className="input">
                        {TEAM_ROLES.map(([r, l]) => <option key={r} value={r}>{l}</option>)}
                      </select>
                      <PSel value={m.user_id} onChange={(v) => set("team", s.team.map((x, j) => (j === i ? { ...x, user_id: v } : x)))} people={pool} empty="— сотрудник —" />
                      <button type="button" aria-label="Убрать" onClick={() => set("team", s.team.filter((_, j) => j !== i))} className="flex h-12 w-11 items-center justify-center rounded-xl text-muted hover:bg-surface-2"><Trash2 size={18} /></button>
                    </li>
                  );
                })}
              </ul>
              <button type="button" onClick={() => set("team", [...s.team, { role: s.team.length === 0 ? "targetologist" : "mobilographer", user_id: "" }])} className="mt-2 text-sm font-semibold text-primary">+ Добавить исполнителя</button>
            </div>

            {canPayments && sum && sum.price > 0 && (
              <div className="grid gap-3 rounded-2xl border border-line p-4 sm:grid-cols-2">
                <p className="text-sm text-muted sm:col-span-2">Если клиент уже передал деньги, внесите сумму — она уйдёт бухгалтеру на подтверждение и станет «оплачено» только после него. Проект запускается в производство по правилам допуска.</p>
                <F label="Клиент уже оплатил"><input value={s.paid} onChange={(e) => set("paid", e.target.value)} inputMode="decimal" placeholder="например, 15 000" className="input" /></F>
                <F label="Дата оплаты"><input type="date" value={s.paid_on} onChange={(e) => set("paid_on", e.target.value)} className="input" /></F>
                <F label="Способ оплаты"><input value={s.paid_method} onChange={(e) => set("paid_method", e.target.value)} placeholder="наличные, Мбанк, перевод…" className="input" /></F>
                <F label="Следующий платёж (дата)"><input type="date" value={s.next_payment_on} onChange={(e) => set("next_payment_on", e.target.value)} className="input" /></F>
                <F label="Условия оплаты" className="sm:col-span-2"><input value={s.payment_terms} onChange={(e) => set("payment_terms", e.target.value)} placeholder="например, 50% предоплата, остаток до 10-го числа" className="input" /></F>
              </div>
            )}

            {/* итог */}
            <div className="rounded-2xl bg-surface-2 p-4 text-sm">
              <div className="mb-2 font-semibold">Проверьте перед созданием</div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
                <dt className="text-muted">Клиент</dt><dd>{s.mode === "existing" ? `${s.existing?.company_name} (из базы)` : `${s.client.company_name || s.client.contact_name} — новый`}</dd>
                <dt className="text-muted">Проект</dt><dd>{s.name || defaultName(s)} · {PROJECT_KINDS.find(([k]) => k === s.kind)?.[1]}</dd>
                <dt className="text-muted">Тариф</dt><dd>{tariff ? tariff.name : "индивидуальные условия"}</dd>
                <dt className="text-muted">Объём</dt><dd>{CONTENT_KINDS.filter(([k]) => Number(s.composition[k] || 0) > 0).map(([k, l]) => `${l.toLowerCase()} ${s.composition[k]}`).join(", ") || "—"}</dd>
                {sum && <><dt className="text-muted">Стоимость</dt><dd className="font-semibold">{money(sum.price, s.currency)}</dd></>}
                {sum && sum.declared > 0 && <><dt className="text-muted">Заявлено</dt><dd>{money(sum.declared, s.currency)} · ждёт подтверждения</dd></>}
                {sum && <><dt className="text-muted">Подтверждено</dt><dd>{money(sum.confirmed, s.currency)} · остаток {money(sum.remainder, s.currency)}</dd></>}
                <dt className="text-muted">Команда</dt><dd>{[s.admin_id ? "администратор назначен" : "администратор — позже", s.team.filter((m) => m.user_id).length ? `исполнителей: ${s.team.filter((m) => m.user_id).length}` : null].filter(Boolean).join(" · ")}</dd>
              </dl>
            </div>
          </>
        )}

        {dup && (
          <div className="rounded-2xl border border-warn/50 bg-warn-soft p-4 text-sm" role="alert">
            <div className="font-semibold text-warn">Клиент с этим телефоном уже есть в базе: {dup.company_name}{dup.contact_name ? ` (${dup.contact_name})` : ""}.</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className={btn("primary")} onClick={() => { setS((x) => ({ ...x, mode: "existing", existing: { id: dup.id, company_name: dup.company_name, contact_name: dup.contact_name, phone: null, niche: null }, update_client: false })); setDup(null); }}>Использовать этого клиента</button>
              <button type="button" className={btn("secondary")} onClick={() => submit(true)}>Это другой клиент — создать</button>
            </div>
          </div>
        )}
        {error && <p role="alert" className="rounded-xl bg-bad-soft px-3 py-2 text-sm font-semibold text-bad">{error}</p>}
      </div>

      {/* навигация мастера */}
      <div className="sticky-actions mt-4 md:bottom-4">
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface p-2 shadow-sm">
          {step > 0 ? <button type="button" onClick={() => go(step - 1)} className={btn("secondary")}><ChevronLeft size={18} /> Назад</button> : <Link href="/app/projects" className={btn("secondary")}>Отмена</Link>}
          <button type="button" onClick={saveDraft} className="min-h-11 px-2 text-sm font-semibold text-muted hover:text-ink">Сохранить черновик</button>
          <span className="flex-1" />
          {step < 2 ? (
            <button type="button" onClick={() => go(step + 1)} className={btn("primary")}>Далее <ChevronRight size={18} /></button>
          ) : (
            <button type="button" onClick={() => submit(false)} disabled={pending} aria-busy={pending} className={btn("primary")}>{pending ? "Создаём…" : "Создать проект"}</button>
          )}
        </div>
        {savedNote && <p role="status" className="mt-2 text-center text-xs text-muted">{savedNote}</p>}
      </div>
    </div>
  );
}
