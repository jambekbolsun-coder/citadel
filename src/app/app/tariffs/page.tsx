import { requireActive } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, Field, PageHeader } from "@/components/ui";
import { ActionForm, Submit } from "@/components/action-form";
import { CONTENT_KIND } from "@/lib/labels";
import { date, minorToInput, money } from "@/lib/format";
import { createTariff, newVersion, updateTariffMeta } from "./actions";

export const metadata = { title: "Тарифы" };
const PERIOD: Record<string, string> = { one_time: "Разовый", monthly: "Месяц", yearly: "Год" };
type Version = { id: string; version: number; price_minor: number; currency: string; period_type: string; period_months: number; composition: Record<string, number>; stories_method: string | null; description: string | null; notes: string | null; is_current: boolean; created_at: string };

function VersionFields({ v }: { v?: Version }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Field label="Цена *"><input name="price" required inputMode="decimal" defaultValue={minorToInput(v?.price_minor)} className="input" /></Field>
      <Field label="Валюта"><select name="currency" defaultValue={v?.currency ?? "KGS"} className="input"><option>KGS</option><option>USD</option></select></Field>
      <Field label="Период">
        <select name="period_type" defaultValue={v?.period_type ?? "monthly"} className="input"><option value="one_time">Разовый</option><option value="monthly">Месяц</option><option value="yearly">Год</option></select>
      </Field>
      <Field label="Месяцев в договоре"><input name="period_months" type="number" min={1} defaultValue={v?.period_months ?? 1} className="input" /></Field>
      {(["video", "story", "post", "carousel", "ad_creative", "shoot"] as const).map((k) => (
        <Field key={k} label={`${CONTENT_KIND[k]} / период`}><input name={`c_${k}`} type="number" min={0} defaultValue={v?.composition?.[k] ?? ""} className="input" /></Field>
      ))}
      <Field label="Метод сторис" className="sm:col-span-2">
        <select name="stories_method" defaultValue={v?.stories_method ?? ""} className="input">
          <option value="">— не применяется —</option>
          <option value="fixed_per_period">Фиксированно за период (например, 120)</option>
          <option value="four_each_calendar_day">По 4 каждый календарный день (итог зависит от дней в месяце)</option>
        </select>
      </Field>
      <Field label="Описание для сайта" className="sm:col-span-3"><input name="description" defaultValue={v?.description ?? ""} className="input" /></Field>
      <Field label="Внутренние заметки (дрон, правки, допуслуги)" className="sm:col-span-3"><input name="notes" defaultValue={v?.notes ?? ""} className="input" /></Field>
    </div>
  );
}

export default async function Tariffs() {
  const s = await requireActive(["tariffs.manage", "prices.view"]);
  const supabase = await createClient();
  const { data } = await supabase.from("tariffs").select("*, tariff_versions(*)").order("sort");
  const tariffs = (data ?? []) as { id: string; name: string; is_public: boolean; price_on_request: boolean; sort: number; archived_at: string | null; tariff_versions: Version[] }[];
  const edit = s.can("tariffs.manage");
  return (
    <>
      <PageHeader title="Тарифы" subtitle="Стартовый справочник с версиями. Изменение тарифа создаёт новую версию и не меняет уже согласованные договоры." />
      <div className="space-y-4">
        {tariffs.map((t) => {
          const versions = [...t.tariff_versions].sort((a, b) => b.version - a.version);
          const cur = versions.find((v) => v.is_current);
          return (
            <Card key={t.id} title={<span className="flex flex-wrap items-center gap-2">{t.name} {!t.is_public && <Badge>скрыт с сайта</Badge>} {t.price_on_request && <Badge tone="warn">цена по запросу</Badge>} {t.archived_at && <Badge tone="bad">архив</Badge>}</span>}>
              {cur && (
                <div className="mb-3 text-sm">
                  <span className="font-display text-xl font-semibold">{money(cur.price_minor, cur.currency)}</span> · {PERIOD[cur.period_type]} · версия {cur.version}
                  <div className="mt-1 text-muted">{Object.entries(cur.composition).map(([k, n]) => `${CONTENT_KIND[k] ?? k}: ${n}`).join(" · ") || "Состав не задан"}{cur.stories_method ? ` · метод сторис: ${cur.stories_method === "fixed_per_period" ? "фикс. за период" : "4 в день"}` : ""}</div>
                  {cur.description && <div className="mt-1">{cur.description}</div>}
                  {cur.notes && <div className="mt-1 text-warn">{cur.notes}</div>}
                </div>
              )}
              {edit && (
                <details className="rounded-xl bg-surface-2 p-3">
                  <summary className="cursor-pointer text-sm font-semibold">Новая версия / настройки</summary>
                  <ActionForm action={newVersion} className="mt-3 space-y-3">
                    <input type="hidden" name="tariff_id" value={t.id} />
                    <VersionFields v={cur} />
                    <Submit>Сохранить как новую версию</Submit>
                  </ActionForm>
                  <ActionForm action={updateTariffMeta} className="mt-4 grid gap-3 border-t border-line pt-3 sm:grid-cols-4">
                    <input type="hidden" name="tariff_id" value={t.id} />
                    <Field label="Название"><input name="name" defaultValue={t.name} className="input" /></Field>
                    <Field label="Порядок"><input name="sort" type="number" defaultValue={t.sort} className="input" /></Field>
                    <div className="flex flex-col justify-end gap-1 text-sm">
                      <label className="flex gap-2"><input type="checkbox" name="is_public" defaultChecked={t.is_public} /> На сайте</label>
                      <label className="flex gap-2"><input type="checkbox" name="price_on_request" defaultChecked={t.price_on_request} /> Цена индивидуальная</label>
                      <label className="flex gap-2"><input type="checkbox" name="archived" defaultChecked={!!t.archived_at} /> В архиве</label>
                    </div>
                    <div className="flex items-end"><Submit variant="secondary">Сохранить</Submit></div>
                  </ActionForm>
                  {versions.length > 1 && (
                    <div className="mt-3 text-xs text-muted">
                      История: {versions.map((v) => `v${v.version} — ${money(v.price_minor, v.currency)} (${date(v.created_at)})`).join("; ")}
                    </div>
                  )}
                </details>
              )}
            </Card>
          );
        })}
        {edit && (
          <Card title="Новый тариф">
            <ActionForm action={createTariff} reset className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Название *"><input name="name" required className="input" /></Field>
                <Field label="Порядок"><input name="sort" type="number" defaultValue={100} className="input" /></Field>
                <div className="flex flex-col justify-end gap-1 text-sm">
                  <label className="flex gap-2"><input type="checkbox" name="is_public" defaultChecked /> Показывать на сайте</label>
                  <label className="flex gap-2"><input type="checkbox" name="price_on_request" /> Цена индивидуальная</label>
                </div>
              </div>
              <VersionFields />
              <Submit>Создать тариф</Submit>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
