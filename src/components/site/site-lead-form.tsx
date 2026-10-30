"use client";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { submitLead } from "@/app/lead-action";
import { TARIFF_EVENT } from "./lead-cta";

function SubmitBtn() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className="k-btn k-btn-primary w-full disabled:opacity-60">
      {pending ? "Отправляем…" : "Отправить заявку"}
    </button>
  );
}

/** Форма заявки сайта: запись в CRM (submit_lead) + мгновенное уведомление ответственным. */
export function SiteLeadForm({ tariffs }: { tariffs: { code: string; name: string }[] }) {
  const [state, action] = useActionState(submitLead, null);
  const [key, setKey] = useState("");
  const [utm, setUtm] = useState("{}");
  const [tariff, setTariff] = useState("");

  useEffect(() => {
    setKey(crypto.randomUUID());
    const p = new URLSearchParams(location.search);
    const u: Record<string, string> = {};
    ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].forEach((k) => {
      const v = p.get(k);
      if (v) u[k] = v.slice(0, 120);
    });
    if (document.referrer) u.referrer = document.referrer.slice(0, 200);
    setUtm(JSON.stringify(u));
    const t = p.get("tariff");
    if (t && tariffs.some((x) => x.code === t)) setTariff(t);
    const on = (e: Event) => {
      const code = (e as CustomEvent<string>).detail;
      setTariff(tariffs.some((x) => x.code === code) ? code : "");
    };
    window.addEventListener(TARIFF_EVENT, on);
    return () => window.removeEventListener(TARIFF_EVENT, on);
  }, [tariffs]);

  if (state?.ok) {
    return (
      <div className="k-card k-card-pad text-center" role="status">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--k-cyan)] text-2xl font-bold text-[#04112e]">✓</div>
        <h3 className="k-display text-xl">Заявка принята</h3>
        <p className="mt-2 text-[15px] text-[var(--k-muted)]">{state.ok}</p>
      </div>
    );
  }

  return (
    <form action={action} className="k-card k-card-pad grid gap-4 sm:grid-cols-2" aria-label="Заявка на консультацию">
      <input type="hidden" name="idempotency_key" value={key} />
      <input type="hidden" name="utm" value={utm} />
      {/* honeypot: поле скрыто от людей, боты его заполняют */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>Сайт<input name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>
      <h3 className="k-display text-xl sm:col-span-2">Обсудить проект</h3>
      <label className="k-field">
        <span>Имя и фамилия *</span>
        <input id="lead-name" name="name" required minLength={2} maxLength={120} autoComplete="name" className="k-input" />
      </label>
      <label className="k-field">
        <span>Телефон / WhatsApp *</span>
        <input name="phone" required type="tel" inputMode="tel" autoComplete="tel" placeholder="+996 ___ ___ ___" className="k-input" />
      </label>
      <label className="k-field">
        <span>Компания / ниша</span>
        <input name="business" maxLength={200} placeholder="например, строительство" className="k-input" />
      </label>
      <label className="k-field">
        <span>Тариф</span>
        <select name="tariff_code" value={tariff} onChange={(e) => setTariff(e.target.value)} className="k-input">
          <option value="">Нужна консультация</option>
          {tariffs.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
        </select>
      </label>
      <label className="k-field sm:col-span-2">
        <span>Комментарий</span>
        <textarea name="comment" maxLength={2000} rows={3} className="k-input" placeholder="Что хотите получить от рекламы и контента?" />
      </label>
      <label className="flex items-start gap-3 text-sm text-[var(--k-muted)] sm:col-span-2">
        <input type="checkbox" name="consent" required className="mt-0.5 h-5 w-5 flex-none accent-[#4de5ff]" />
        <span>
          Согласен(на) на обработку персональных данных по{" "}
          <Link href="/privacy" className="font-semibold text-white underline">политике конфиденциальности</Link> *
        </span>
      </label>
      {state?.error && <p role="alert" className="rounded-xl bg-[#ff5470]/15 px-3 py-2 text-sm font-semibold text-[#ffb3c0] sm:col-span-2">{state.error}</p>}
      <div className="sm:col-span-2"><SubmitBtn /></div>
    </form>
  );
}
