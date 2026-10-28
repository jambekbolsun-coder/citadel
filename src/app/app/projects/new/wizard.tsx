"use client";
import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { createProject } from "../actions";
import { btn, cn } from "@/components/ui";

type Tariff = { id: string; name: string; version_id: string; price_minor: number; currency: string; period_type: string; period_months: number; composition: Record<string, number>; stories_method: string | null; notes: string | null };
type P = { id: string; full_name: string; job_title: string | null };
const KINDS: [string, string][] = [["video", "Видео"], ["story", "Сторис"], ["post", "Посты"], ["carousel", "Карусели"], ["ad_creative", "Рекламные креативы"], ["shoot", "Съёмки"]];
const STEPS = ["Клиент", "Тип и условия", "Оплаты", "Организация"];

function F({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return <label className={cn("block", className)}><span className="label">{label}</span>{children}</label>;
}
function PSel({ name, people, required, def }: { name: string; people: P[]; required?: boolean; def?: string }) {
  return (
    <select name={name} required={required} defaultValue={def ?? ""} className="input">
      <option value="">{required ? "— выберите —" : "— не назначен —"}</option>
      {people.map((p) => <option key={p.id} value={p.id}>{p.full_name}{p.job_title ? ` · ${p.job_title}` : ""}</option>)}
    </select>
  );
}
function Save() {
  const { pending } = useFormStatus();
  return <button disabled={pending} className={btn("primary")}>{pending ? "Создание…" : "Создать проект"}</button>;
}

export function ProjectWizard({ clients, tariffs, people, defaults }: { clients: { id: string; company_name: string }[]; tariffs: Tariff[]; people: P[]; defaults: { client?: string; lead?: string; me: string } }) {
  const [state, act] = useActionState(createProject, null);
  const [step, setStep] = useState(0);
  const [tv, setTv] = useState<Tariff | null>(null);
  const [kind, setKind] = useState("monthly");
  const [comp, setComp] = useState<Record<string, string>>({});
  const [price, setPrice] = useState("");
  const [sm, setSm] = useState("");

  function pickTariff(id: string) {
    const t = tariffs.find((x) => x.version_id === id) ?? null;
    setTv(t);
    if (t) {
      setPrice(String(t.price_minor / 100));
      setComp(Object.fromEntries(Object.entries(t.composition).map(([k, v]) => [k, String(v)])));
      setSm(t.stories_method ?? "");
      setKind(t.period_type === "one_time" ? "one_time" : t.period_type === "yearly" ? "yearly" : "monthly");
    }
  }

  return (
    <form action={act} className="space-y-4">
      <input type="hidden" name="lead_id" value={defaults.lead ?? ""} />
      <div className="scroll-x">
        <ol className="flex gap-2">
          {STEPS.map((s, i) => (
            <li key={s}>
              <button type="button" onClick={() => setStep(i)} className={cn("whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold", i === step ? "bg-primary text-primary-ink" : "bg-surface-2 text-muted")}>
                {i + 1}. {s}
              </button>
            </li>
          ))}
        </ol>
      </div>

      <fieldset className={cn("grid gap-3 rounded-2xl border border-line bg-surface p-4 sm:grid-cols-2", step !== 0 && "hidden")}>
        <F label="Клиент *">
          <select name="client_id" defaultValue={defaults.client ?? ""} className="input">
            <option value="">— выберите клиента —</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
          </select>
        </F>
        <F label="Название проекта *"><input name="name" className="input" placeholder="Например: Кафе «Ала-Тоо» — SMM" /></F>
        <F label="Instagram клиента"><input name="instagram" className="input" /></F>
        <F label="TikTok"><input name="tiktok" className="input" /></F>
        <F label="Facebook"><input name="facebook" className="input" /></F>
        <F label="Пожелания клиента" className="sm:col-span-2"><textarea name="wishes" className="input" /></F>
        <p className="text-xs text-muted sm:col-span-2">Новый клиент? Создайте его в разделе «Клиенты» или конвертируйте заявку — так не будет дублей.</p>
      </fieldset>

      <fieldset className={cn("grid gap-3 rounded-2xl border border-line bg-surface p-4 sm:grid-cols-3", step !== 1 && "hidden")}>
        <F label="Тариф (конкретная версия)" className="sm:col-span-2">
          <select name="tariff_version_id" className="input" defaultValue="" onChange={(e) => pickTariff(e.target.value)}>
            <option value="">Индивидуальные условия</option>
            {tariffs.map((t) => <option key={t.version_id} value={t.version_id}>{t.name} — {(t.price_minor / 100).toLocaleString("ru-RU")} {t.currency}</option>)}
          </select>
        </F>
        <F label="Тип проекта">
          <select name="kind" value={kind} onChange={(e) => setKind(e.target.value)} className="input">
            <option value="one_time">Разовый</option><option value="monthly">Месячный</option><option value="yearly">Годовой</option>
            <option value="custom">Индивидуальный</option><option value="one_time_shoot">Разовая съёмка</option>
          </select>
        </F>
        {tv?.notes && <p className="rounded-xl bg-warn-soft p-3 text-sm text-warn sm:col-span-3">{tv.notes}</p>}
        <F label="Стоимость за период *"><input name="price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className="input" /></F>
        <F label="Валюта"><select name="currency" className="input"><option>KGS</option><option>USD</option></select></F>
        <F label="Метод сторис">
          <select name="stories_method" value={sm} onChange={(e) => setSm(e.target.value)} className="input">
            <option value="">—</option><option value="fixed_per_period">Фиксированно за период</option><option value="four_each_calendar_day">По 4 каждый день</option>
          </select>
        </F>
        {KINDS.map(([k, l]) => (
          <F key={k} label={`${l} за период`}><input name={`c_${k}`} type="number" min={0} value={comp[k] ?? ""} onChange={(e) => setComp({ ...comp, [k]: e.target.value })} className="input" /></F>
        ))}
        {sm === "four_each_calendar_day" && <p className="text-xs text-muted sm:col-span-3">Итог сторис будет зависеть от числа дней месяца (28–31 × 4). Система покажет разницу с 120.</p>}
        <F label="Дата договора"><input name="contract_start" type="date" className="input" /></F>
        <F label="Окончание договора"><input name="contract_end" type="date" className="input" /></F>
        <F label="Начало работ"><input name="work_start" type="date" className="input" /></F>
        <F label="Продление"><input name="renewal_date" type="date" className="input" /></F>
        <F label="Количество правок"><input name="revisions_allowed" type="number" min={0} className="input" /></F>
        <div className="sm:col-span-3">
          <span className="label">Площадки публикации</span>
          <div className="flex flex-wrap gap-3 text-sm">
            {["instagram", "tiktok", "facebook", "youtube", "telegram"].map((p) => (
              <label key={p} className="flex items-center gap-1.5"><input type="checkbox" name="platforms" value={p} defaultChecked={p === "instagram"} /> {p}</label>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm sm:col-span-3"><input type="checkbox" name="requires_publication" defaultChecked /> Публикация входит в договор (снимите для заказа «снять и передать файл»)</label>
        <F label="Порядок согласования" className="sm:col-span-3"><input name="approval_flow" className="input" placeholder="Кто и как согласует материалы со стороны клиента" /></F>
        <F label="Дополнительные услуги" className="sm:col-span-3"><input name="extra_services" className="input" /></F>
      </fieldset>

      <fieldset className={cn("grid gap-3 rounded-2xl border border-line bg-surface p-4 sm:grid-cols-3", step !== 2 && "hidden")}>
        <p className="text-sm text-muted sm:col-span-3">Счета формируют график оплат. «Оплачено» считается только из подтверждённых платежей. Годовая предоплата — один счёт, без ежемесячных долгов.</p>
        <F label="Счёт 1: назначение"><input name="inv1_title" defaultValue="Оплата по договору" className="input" /></F>
        <F label="Сумма"><input name="inv1_amount" inputMode="decimal" defaultValue={price} key={price} className="input" /></F>
        <F label="Срок оплаты"><input name="inv1_due" type="date" className="input" /></F>
        <F label="Счёт 2 (необязательно)"><input name="inv2_title" className="input" /></F>
        <F label="Сумма"><input name="inv2_amount" inputMode="decimal" className="input" /></F>
        <F label="Срок оплаты"><input name="inv2_due" type="date" className="input" /></F>
        <F label="Условия оплаты / комментарий" className="sm:col-span-3"><textarea name="payment_terms" className="input" /></F>
      </fieldset>

      <fieldset className={cn("grid gap-3 rounded-2xl border border-line bg-surface p-4 sm:grid-cols-2", step !== 3 && "hidden")}>
        <F label="Администратор проекта *"><PSel name="admin_id" people={people} required={false} /></F>
        <F label="Менеджер"><PSel name="manager_id" people={people} def={defaults.me} /></F>
        <F label="Директор по планированию"><PSel name="planning_director_id" people={people} /></F>
        <F label="Креативный директор"><PSel name="creative_director_id" people={people} /></F>
        <F label="Команда (Ctrl/⌘ для нескольких)" className="sm:col-span-2">
          <select name="team" multiple className="input min-h-[120px]">
            {people.map((p) => <option key={p.id} value={p.id}>{p.full_name}{p.job_title ? ` · ${p.job_title}` : ""}</option>)}
          </select>
        </F>
        <F label="Референсы" className="sm:col-span-2"><textarea name="references_text" className="input" /></F>
        <p className="text-xs text-muted sm:col-span-2">Логины и пароли соцсетей не вводятся здесь — их можно добавить после создания во вкладке «Доступы» (зашифрованное хранилище, просмотр по праву и с журналом).</p>
      </fieldset>

      {state?.error && <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{state.error}</p>}
      <div className="flex flex-wrap gap-2">
        {step > 0 && <button type="button" onClick={() => setStep(step - 1)} className={btn("secondary")}>← Назад</button>}
        {step < 3 ? <button type="button" onClick={() => setStep(step + 1)} className={btn("primary")}>Далее →</button> : <Save />}
      </div>
    </form>
  );
}
