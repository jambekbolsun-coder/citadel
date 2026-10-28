import { requireActive } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Avatar, Card, Field, PageHeader, Tabs } from "@/components/ui";
import { ActionForm, Submit } from "@/components/action-form";
import { InstallButton } from "@/components/pwa";
import { logout } from "@/app/auth-actions";
import { PAY_TYPE } from "@/lib/labels";
import { date, money } from "@/lib/format";
import { PinSetup, PushToggle, SignOutEverywhere, ThemeSwitch } from "./device-panel";
import { removePin, saveAppSetting, saveCapacity, savePin, saveProfile } from "./actions";
import Link from "next/link";

export const metadata = { title: "Настройки" };

export default async function Settings({ searchParams }: PageProps<"/app/settings">) {
  const sp = await searchParams;
  const s = await requireActive();
  const supabase = await createClient();
  const tab = typeof sp.tab === "string" ? sp.tab : "profile";
  const p = s.profile!;
  const [{ data: devices }, { data: terms }, { data: accruals }, { data: pays }, { data: settings }, { data: caps }] = await Promise.all([
    supabase.from("device_pins").select("device_id,device_name,last_used_at").eq("user_id", s.userId),
    supabase.from("salary_terms").select("*").eq("user_id", s.userId).order("effective_from", { ascending: false }),
    supabase.from("payroll_accruals").select("*").eq("user_id", s.userId).eq("status", "approved").order("period_month", { ascending: false }),
    supabase.from("salary_payments").select("*").eq("user_id", s.userId).order("paid_on", { ascending: false }),
    s.isOwner ? supabase.from("app_settings").select("*").order("key") : Promise.resolve({ data: [] }),
    s.can("projects.manage") ? supabase.from("capacity_rules").select("*").order("key") : Promise.resolve({ data: [] }),
  ]);
  const accrued = (accruals ?? []).reduce((a: number, x: { total_minor: number }) => a + Number(x.total_minor), 0);
  const paid = (pays ?? []).reduce((a: number, x: { amount_minor: number }) => a + Number(x.amount_minor), 0);
  const tabs = [
    { key: "profile", label: "Профиль" },
    { key: "security", label: "Безопасность и устройства" },
    ...((terms ?? []).length ? [{ key: "pay", label: "Мои выплаты" }] : []),
    { key: "app", label: "Приложение" },
    ...(s.isOwner || s.can("projects.manage") ? [{ key: "company", label: "Компания и нормативы" }] : []),
  ].map((t) => ({ ...t, href: `/app/settings?tab=${t.key}` }));

  return (
    <>
      <PageHeader title="Настройки" subtitle={s.email ?? undefined} actions={s.can("roles.manage") ? <Link href="/app/settings/roles" className="rounded-xl bg-surface-2 px-4 py-2 text-sm font-semibold ring-1 ring-line">Роли и права</Link> : null} />
      <Tabs items={tabs} active={tab} />
      {tab === "profile" && (
        <Card>
          <ActionForm action={saveProfile} className="grid gap-4 md:grid-cols-[120px_1fr]">
            <div className="flex flex-col items-center gap-2"><Avatar name={p.full_name} url={p.avatar_url} size={96} /><label className="cursor-pointer text-xs text-primary">Сменить фото<input type="file" name="avatar" accept="image/*" className="sr-only" /></label></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Имя и фамилия"><input name="full_name" defaultValue={p.full_name} required className="input" /></Field>
              <Field label="Рабочий телефон"><input name="phone" defaultValue={p.phone ?? ""} className="input" /></Field>
              <Field label="Должность" hint="Меняет руководитель"><input value={p.job_title ?? ""} disabled className="input opacity-70" /></Field>
              <Field label="Email" hint="Меняется через поддержку владельца"><input value={s.email ?? ""} disabled className="input opacity-70" /></Field>
              <Field label="О себе" className="sm:col-span-2"><textarea name="about" defaultValue={p.about ?? ""} className="input" /></Field>
              <Field label="Утверждённые обязанности" className="sm:col-span-2"><textarea value={p.responsibilities ?? ""} disabled className="input opacity-70" /></Field>
              <input type="hidden" name="theme" value={p.theme} />
              <div className="sm:col-span-2"><Submit>Сохранить</Submit></div>
            </div>
          </ActionForm>
        </Card>
      )}
      {tab === "security" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="PIN для быстрой разблокировки"><PinSetup userId={s.userId} action={savePin} removeAction={removePin} devices={(devices ?? []) as { device_id: string; device_name: string | null; last_used_at: string | null }[]} /></Card>
          <Card title="Пароль и сеансы">
            <div className="space-y-3">
              <Link href="/auth/update-password" className="inline-block text-sm text-primary">Сменить пароль →</Link>
              <p className="text-sm text-muted">Смена пароля завершает другие сеансы. Выход на всех устройствах аннулирует все токены.</p>
              <div className="flex flex-wrap gap-2">
                <form action={logout}><button className="rounded-xl bg-surface-2 px-4 py-2 text-sm font-semibold ring-1 ring-line">Выйти на этом устройстве</button></form>
                <SignOutEverywhere />
              </div>
            </div>
          </Card>
        </div>
      )}
      {tab === "pay" && (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <Card title="Начислено (утверждено)"><p className="font-display text-2xl font-semibold">{money(accrued)}</p></Card>
            <Card title="Выплачено"><p className="font-display text-2xl font-semibold">{money(paid)}</p></Card>
            <Card title="К выплате"><p className="font-display text-2xl font-semibold text-warn">{money(Math.max(0, accrued - paid))}</p></Card>
          </div>
          <Card title="Условия">
            <ul className="space-y-1 text-sm">{(terms ?? []).map((t: { id: string; pay_type: string; base_minor: number; pay_days: number[]; effective_from: string }) => <li key={t.id}>с {date(t.effective_from)}: {PAY_TYPE[t.pay_type]}, оклад {money(t.base_minor)}, выплаты {t.pay_days.join(" и ")}-го</li>)}</ul>
          </Card>
          <Card title="История">
            <ul className="space-y-1 text-sm">
              {(accruals ?? []).map((a: { id: string; period_month: string; total_minor: number }) => <li key={a.id}>Начислено за {a.period_month.slice(0, 7)}: <b>{money(a.total_minor)}</b></li>)}
              {(pays ?? []).map((x: { id: string; paid_on: string; kind: string; amount_minor: number }) => <li key={x.id}>{date(x.paid_on)} — {{ advance: "аванс", salary: "зарплата", bonus: "бонус", offset: "зачёт" }[x.kind]}: <b>{money(x.amount_minor)}</b></li>)}
            </ul>
          </Card>
        </div>
      )}
      {tab === "app" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Установка"><InstallButton /><p className="mt-2 text-xs text-muted">Android: системное окно установки. iPhone: Safari → Поделиться → На экран «Домой».</p></Card>
          <Card title="Тема"><ThemeSwitch /></Card>
          <Card title="Системные уведомления"><PushToggle /></Card>
          <Card title="Язык и формат"><p className="text-sm">Русский · даты в часовом поясе Asia/Bishkek · неделя с понедельника. Кыргызский — подготовлен в планах.</p></Card>
        </div>
      )}
      {tab === "company" && (
        <div className="grid gap-4 lg:grid-cols-2">
          {s.isOwner && (
            <Card title="Параметры компании">
              <div className="space-y-2">{(settings ?? []).map((x: { key: string; value: string; label: string | null }) => (
                <ActionForm key={x.key} action={saveAppSetting} className="grid items-end gap-2 sm:grid-cols-[1fr_160px_auto]">
                  <input type="hidden" name="key" value={x.key} />
                  <span className="text-sm">{x.label ?? x.key}</span>
                  <input name="value" defaultValue={x.key === "work_days" ? (JSON.parse(x.value) as number[]).join(",") : x.value} className="input" />
                  <Submit variant="ghost" className="min-h-[38px] px-3 text-xs">OK</Submit>
                </ActionForm>
              ))}</div>
            </Card>
          )}
          {s.can("projects.manage") && (
            <Card title="Нормативы производства">
              <p className="mb-3 text-xs text-muted">Без утверждённых нормативов система не считает часы и показывает «ёмкость не рассчитана». Значения вводит владелец/управляющий.</p>
              <div className="space-y-2">{(caps ?? []).map((c: { key: string; label: string; value: number | null; unit: string }) => (
                <ActionForm key={c.key} action={saveCapacity} className="grid items-end gap-2 sm:grid-cols-[1fr_120px_auto]">
                  <input type="hidden" name="key" value={c.key} />
                  <span className="text-sm">{c.label} <span className="text-muted">({c.unit})</span></span>
                  <input name="value" defaultValue={c.value ?? ""} placeholder="не задано" inputMode="decimal" className="input" />
                  <Submit variant="ghost" className="min-h-[38px] px-3 text-xs">OK</Submit>
                </ActionForm>
              ))}</div>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
