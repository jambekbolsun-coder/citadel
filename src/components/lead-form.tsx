"use client";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { submitLead } from "@/app/lead-action";
import { btn } from "@/components/ui";

function SubmitBtn() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={btn("brand", "w-full min-h-[48px] text-base")}>
      {pending ? "Отправляем…" : "Отправить заявку"}
    </button>
  );
}

export function LeadForm({ services }: { services: string[] }) {
  const [state, action] = useActionState(submitLead, null);
  const [key, setKey] = useState("");
  const [utm, setUtm] = useState("{}");

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
  }, []);

  if (state?.ok) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-6 text-center" role="status">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-good-soft text-2xl text-good">✓</div>
        <h3 className="text-lg font-semibold">Спасибо!</h3>
        <p className="mt-1 text-sm text-muted">{state.ok}</p>
      </div>
    );
  }

  return (
    <form action={action} className="grid gap-3 rounded-2xl border border-line bg-surface p-5 md:grid-cols-2 md:p-6">
      <input type="hidden" name="idempotency_key" value={key} />
      <input type="hidden" name="utm" value={utm} />
      {/* honeypot: скрыто от людей */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>Сайт<input name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>
      <label className="block">
        <span className="label">Имя и фамилия *</span>
        <input name="name" required minLength={2} maxLength={120} autoComplete="name" className="input" />
      </label>
      <label className="block">
        <span className="label">Телефон *</span>
        <input name="phone" required type="tel" inputMode="tel" autoComplete="tel" placeholder="+996 ___ ___ ___" className="input" />
      </label>
      <label className="block">
        <span className="label">Бизнес / ниша</span>
        <input name="business" maxLength={200} className="input" />
      </label>
      <label className="block">
        <span className="label">Услуга</span>
        <select name="service" className="input" defaultValue="">
          <option value="">Пока не знаю</option>
          {services.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="label">Email</span>
        <input name="email" type="email" autoComplete="email" className="input" />
      </label>
      <label className="block">
        <span className="label">Удобное время для связи</span>
        <input name="preferred_time" maxLength={120} placeholder="например, после 14:00" className="input" />
      </label>
      <label className="block md:col-span-2">
        <span className="label">Комментарий</span>
        <textarea name="comment" maxLength={2000} className="input" />
      </label>
      <label className="flex items-start gap-2 text-sm md:col-span-2">
        <input type="checkbox" name="consent" required className="mt-1 h-4 w-4" />
        <span>
          Согласен(на) на обработку персональных данных в соответствии с{" "}
          <Link href="/privacy" className="underline">политикой конфиденциальности</Link> *
        </span>
      </label>
      {state?.error && <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad md:col-span-2">{state.error}</p>}
      <div className="md:col-span-2">
        <SubmitBtn />
      </div>
    </form>
  );
}
