import Link from "next/link";
import { requireActive } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, Field, PageHeader } from "@/components/ui";
import { ActionForm, Submit } from "@/components/action-form";
import { dateTime } from "@/lib/format";
import { publish, restoreVersion, saveBlock, saveSettings } from "./actions";

export const metadata = { title: "Сайт / CMS" };
const TYPE: Record<string, string> = { hero: "Главный экран", benefits: "Преимущества", services: "Услуги", tariffs: "Тарифы", cases: "Кейсы", team: "О компании", faq: "Вопросы", contacts: "Контакты и форма", cta: "Призыв" };

type B = { key: string; type: string; sort: number; visible: boolean; draft: Record<string, unknown>; published: Record<string, unknown> | null; updated_at: string; published_at: string | null };

export default async function Cms() {
  await requireActive("cms.manage");
  const supabase = await createClient();
  const [{ data: blocks }, { data: settings }, { data: versions }] = await Promise.all([
    supabase.from("site_blocks").select("*").order("sort"),
    supabase.from("site_settings").select("*").eq("id", 1).single(),
    supabase.from("site_versions").select("id,note,created_at").order("created_at", { ascending: false }).limit(10),
  ]);
  const list = (blocks ?? []) as B[];
  const dirty = list.some((b) => JSON.stringify(b.draft) !== JSON.stringify(b.published));
  return (
    <>
      <PageHeader title="Публичный сайт" subtitle="Черновик → предпросмотр → публикация. Структура ограничена безопасными шаблонами блоков."
        actions={<><Link href="/app/cms/preview" target="_blank" className="rounded-xl bg-surface-2 px-4 py-2 text-sm font-semibold ring-1 ring-line">Предпросмотр</Link><Link href="/" target="_blank" className="rounded-xl bg-surface-2 px-4 py-2 text-sm font-semibold ring-1 ring-line">Открыть сайт</Link></>} />
      <Card className="mb-4" title={<span className="flex items-center gap-2">Публикация {dirty ? <Badge tone="warn">есть неопубликованные изменения</Badge> : <Badge tone="good">опубликовано</Badge>}</span>}>
        <ActionForm action={publish} className="flex flex-wrap gap-2">
          <input name="note" placeholder="Комментарий к версии" className="input max-w-sm" />
          <Submit>Опубликовать</Submit>
        </ActionForm>
        {(versions ?? []).length > 0 && (
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-muted">Версии и восстановление</summary>
            <ul className="mt-2 space-y-1">{(versions ?? []).map((v: { id: number; note: string | null; created_at: string }) => (
              <li key={v.id} className="flex items-center gap-2">{dateTime(v.created_at)} · {v.note ?? "без комментария"}
                <ActionForm action={restoreVersion}><input type="hidden" name="version_id" value={v.id} /><button className="text-xs text-primary">восстановить в черновик</button></ActionForm></li>
            ))}</ul>
          </details>
        )}
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        {list.map((b) => {
          const d = b.draft as Record<string, string | { title?: string; text?: string; q?: string; a?: string; metric?: string }[]>;
          const items = Array.isArray(d.items) ? d.items : null;
          return (
            <Card key={b.key} title={<span className="flex items-center gap-2">{TYPE[b.type]} {!b.visible && <Badge>скрыт</Badge>}</span>}>
              <ActionForm action={saveBlock} className="space-y-3">
                <input type="hidden" name="key" value={b.key} /><input type="hidden" name="type" value={b.type} />
                {b.type === "hero" && <Field label="Надзаголовок"><input name="eyebrow" defaultValue={String(d.eyebrow ?? "")} className="input" /></Field>}
                <Field label="Заголовок"><input name="title" defaultValue={String(d.title ?? "")} className="input" /></Field>
                {["hero", "tariffs"].includes(b.type) && <Field label="Подзаголовок"><textarea name="subtitle" defaultValue={String(d.subtitle ?? "")} className="input" /></Field>}
                {b.type === "hero" && <div className="grid grid-cols-2 gap-2"><Field label="Кнопка"><input name="cta" defaultValue={String(d.cta ?? "")} className="input" /></Field><Field label="Вторая кнопка"><input name="secondary" defaultValue={String(d.secondary ?? "")} className="input" /></Field></div>}
                {["team", "contacts"].includes(b.type) && <Field label="Текст"><textarea name="text" defaultValue={String(d.text ?? "")} className="input" /></Field>}
                {["benefits", "services", "faq", "cases"].includes(b.type) && (
                  <Field label={b.type === "faq" ? "Вопросы: «Вопрос | Ответ» по строке" : b.type === "cases" ? "Кейсы: «Название | Описание | Метрика» — только проверяемые данные" : "Пункты: «Заголовок | Текст» по строке"}>
                    <textarea name="items" defaultValue={(items ?? []).map((i) => (b.type === "faq" ? `${i.q} | ${i.a}` : b.type === "cases" ? `${i.title} | ${i.text} | ${i.metric ?? ""}` : `${i.title} | ${i.text}`)).join("\n")} className="input min-h-[140px]" />
                  </Field>
                )}
                {b.type === "tariffs" && <p className="text-xs text-muted">Карточки тарифов берутся из справочника «Тарифы» (только публичные и текущие версии).</p>}
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="visible" defaultChecked={b.visible} /> Показывать</label>
                  <label className="flex items-center gap-2 text-sm">Порядок <input name="sort" type="number" defaultValue={b.sort} className="input w-20" /></label>
                  <Submit variant="secondary">Сохранить черновик</Submit>
                </div>
              </ActionForm>
            </Card>
          );
        })}
        <Card title="Контакты и SEO">
          <ActionForm action={saveSettings} className="space-y-3">
            <Field label="SEO title"><input name="seo_title" defaultValue={settings?.seo_title ?? ""} className="input" /></Field>
            <Field label="SEO description"><textarea name="seo_description" defaultValue={settings?.seo_description ?? ""} className="input" /></Field>
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Телефон"><input name="phone" defaultValue={settings?.phone ?? ""} className="input" /></Field>
              <Field label="Email"><input name="email" defaultValue={settings?.email ?? ""} className="input" /></Field>
              <Field label="Адрес"><input name="address" defaultValue={settings?.address ?? ""} className="input" /></Field>
              <Field label="Instagram (ссылка)"><input name="instagram" defaultValue={settings?.instagram ?? ""} className="input" /></Field>
              <Field label="Telegram"><input name="telegram" defaultValue={settings?.telegram ?? ""} className="input" /></Field>
              <Field label="WhatsApp"><input name="whatsapp" defaultValue={settings?.whatsapp ?? ""} className="input" /></Field>
            </div>
            <Submit variant="secondary">Сохранить</Submit>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
