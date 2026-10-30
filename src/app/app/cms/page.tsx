import Link from "next/link";
import { ArrowDown, ArrowUp, Eye, EyeOff, Pencil } from "lucide-react";
import { requireActive } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, Field, PageHeader } from "@/components/ui";
import { ActionForm, Submit } from "@/components/action-form";
import { dateTime } from "@/lib/format";
import { slidePrice, type PublicTariff, type Slide } from "@/lib/site-model";
import { moveBlock, publish, restoreVersion, saveBlock, saveSettings, toggleBlock } from "./actions";

export const metadata = { title: "Сайт / CMS" };
const TYPE: Record<string, string> = { hero: "Главный экран", benefits: "Преимущества", services: "Услуги", tariffs: "Тарифы", cases: "Кейсы", team: "О компании", faq: "Вопросы", contacts: "Контакты и форма", cta: "Призыв" };

type B = { key: string; type: string; sort: number; visible: boolean; draft: Record<string, unknown>; published: Record<string, unknown> | null; updated_at: string; published_at: string | null };

export default async function Cms() {
  await requireActive("cms.manage");
  const supabase = await createClient();
  const [{ data: blocks }, { data: settings }, { data: versions }, { data: tariffs }] = await Promise.all([
    supabase.from("site_blocks").select("*").order("sort"),
    supabase.from("site_settings").select("*").eq("id", 1).single(),
    supabase.from("site_versions").select("id,note,created_at").order("created_at", { ascending: false }).limit(10),
    supabase.rpc("public_tariffs"),
  ]);
  const list = (blocks ?? []) as B[];
  const slides = list.filter((b) => b.type === "slide");
  const legacy = list.filter((b) => b.type !== "slide");
  const dirty = list.filter((b) => JSON.stringify(b.draft) !== JSON.stringify(b.published));
  const pub = (tariffs ?? []) as PublicTariff[];

  return (
    <>
      <PageHeader
        title="Публичный сайт"
        subtitle="Секции = страницы коммерческого предложения. Правка → предпросмотр → публикация."
        actions={<><Link href="/app/cms/preview" target="_blank" className="rounded-xl bg-surface-2 px-4 py-2 text-sm font-semibold ring-1 ring-line">Предпросмотр</Link><Link href="/" target="_blank" className="rounded-xl bg-surface-2 px-4 py-2 text-sm font-semibold ring-1 ring-line">Открыть сайт</Link></>}
      />
      <Card className="mb-4" title={<span className="flex flex-wrap items-center gap-2">Публикация {dirty.length ? <Badge tone="warn">не опубликовано: {dirty.length}</Badge> : <Badge tone="good">всё опубликовано</Badge>}</span>}>
        <ActionForm action={publish} className="flex flex-wrap gap-2">
          <input name="note" placeholder="Что изменилось (для истории версий)" className="input max-w-sm" />
          <Submit>Опубликовать</Submit>
        </ActionForm>
        <p className="mt-2 text-xs text-muted">Тексты, цены на сайте, изображения и кнопки меняются в черновике и появляются у посетителей только после публикации. Порядок и видимость секций, контакты и SEO применяются сразу.</p>
        {(versions ?? []).length > 0 && (
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer text-muted">Версии и восстановление</summary>
            <ul className="mt-2 space-y-1">{(versions ?? []).map((v: { id: number; note: string | null; created_at: string }) => (
              <li key={v.id} className="flex flex-wrap items-center gap-2">{dateTime(v.created_at)} · {v.note ?? "без комментария"}
                <ActionForm action={restoreVersion}><input type="hidden" name="version_id" value={v.id} /><button className="min-h-9 text-xs text-primary">восстановить в черновик</button></ActionForm></li>
            ))}</ul>
          </details>
        )}
      </Card>

      <h2 className="group-title">Секции сайта · {slides.length}</h2>
      <ul className="grouped mb-6">
        {slides.map((b, i) => {
          const s = b.draft as Slide;
          const changed = JSON.stringify(b.draft) !== JSON.stringify(b.published);
          const { text, mismatch } = slidePrice(s, pub);
          return (
            <li key={b.key} className="row !items-start gap-3">
              <span className="mt-0.5 w-7 shrink-0 text-center font-display text-sm font-bold text-muted">{String(i + 1).padStart(2, "0")}</span>
              <Link href={`/app/cms/${b.key}`} className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 font-semibold">
                  {s.rubric || s.title || b.key}
                  {!b.visible && <Badge>скрыта</Badge>}
                  {changed && <Badge tone="warn">черновик</Badge>}
                  {mismatch && <Badge tone="bad">цена ≠ справочник</Badge>}
                </div>
                <div className="truncate text-sm text-muted">{[s.title?.replace(/\n/g, " "), s.title_accent, text && `${text} ${s.price_unit ?? ""}`].filter(Boolean).join(" · ")}</div>
              </Link>
              <div className="flex shrink-0 items-center gap-1">
                <ActionForm action={moveBlock}><input type="hidden" name="key" value={b.key} /><input type="hidden" name="dir" value="up" /><button aria-label="Выше" disabled={i === 0} className="flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:bg-surface-2 disabled:opacity-30"><ArrowUp size={18} /></button></ActionForm>
                <ActionForm action={moveBlock}><input type="hidden" name="key" value={b.key} /><input type="hidden" name="dir" value="down" /><button aria-label="Ниже" disabled={i === slides.length - 1} className="flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:bg-surface-2 disabled:opacity-30"><ArrowDown size={18} /></button></ActionForm>
                <ActionForm action={toggleBlock}><input type="hidden" name="key" value={b.key} /><input type="hidden" name="visible" value={b.visible ? "0" : "1"} /><button aria-label={b.visible ? "Скрыть" : "Показать"} className="flex h-10 w-10 items-center justify-center rounded-lg text-muted hover:bg-surface-2">{b.visible ? <Eye size={18} /> : <EyeOff size={18} />}</button></ActionForm>
                <Link href={`/app/cms/${b.key}`} aria-label="Редактировать" className="flex h-10 w-10 items-center justify-center rounded-lg text-primary hover:bg-surface-2"><Pencil size={18} /></Link>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Контакты и SEO">
          <ActionForm action={saveSettings} className="space-y-3">
            <Field label="SEO title"><input name="seo_title" defaultValue={settings?.seo_title ?? ""} className="input" /></Field>
            <Field label="SEO description"><textarea name="seo_description" defaultValue={settings?.seo_description ?? ""} className="input" /></Field>
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Instagram (ссылка или @имя)"><input name="instagram" defaultValue={settings?.instagram ?? ""} className="input" /></Field>
              <Field label="WhatsApp"><input name="whatsapp" defaultValue={settings?.whatsapp ?? ""} inputMode="tel" className="input" /></Field>
              <Field label="Телефон"><input name="phone" defaultValue={settings?.phone ?? ""} inputMode="tel" className="input" /></Field>
              <Field label="Email"><input name="email" defaultValue={settings?.email ?? ""} inputMode="email" className="input" /></Field>
              <Field label="Адрес"><input name="address" defaultValue={settings?.address ?? ""} className="input" /></Field>
              <Field label="Telegram"><input name="telegram" defaultValue={settings?.telegram ?? ""} className="input" /></Field>
            </div>
            <Submit variant="secondary">Сохранить</Submit>
          </ActionForm>
        </Card>
        <Card title="Цены на сайте и в договорах">
          <p className="text-sm text-muted">Цена в секции — маркетинговый текст сайта. Мастер «Добавить проект» берёт цену и состав из справочника <Link href="/app/tariffs" className="text-primary underline">«Тарифы»</Link>: при изменении цены создайте там новую версию тарифа — действующие договоры сохранят свой снимок условий.</p>
          <ul className="mt-3 space-y-1 text-sm">
            {pub.map((t) => <li key={t.id} className="flex justify-between gap-3"><span>{t.name}</span><span className="font-semibold">{t.price_minor !== null ? `${(t.price_minor / 100).toLocaleString("ru-RU")} ${t.currency}` : "по запросу"}</span></li>)}
          </ul>
        </Card>
      </div>

      {legacy.length > 0 && (
        <details className="mt-6">
          <summary className="cursor-pointer text-sm font-semibold text-muted">Прежние блоки сайта ({legacy.length}) — скрыты, сохранены для истории</summary>
          <div className="mt-3 grid gap-4 lg:grid-cols-2">
            {legacy.map((b) => {
              const d = b.draft as Record<string, string | { title?: string; text?: string; q?: string; a?: string; metric?: string }[]>;
              const items = Array.isArray(d.items) ? d.items : null;
              return (
                <Card key={b.key} title={<span className="flex items-center gap-2">{TYPE[b.type] ?? b.type} {!b.visible && <Badge>скрыт</Badge>}</span>}>
                  <ActionForm action={saveBlock} className="space-y-3">
                    <input type="hidden" name="key" value={b.key} /><input type="hidden" name="type" value={b.type} />
                    <Field label="Заголовок"><input name="title" defaultValue={String(d.title ?? "")} className="input" /></Field>
                    {["team", "contacts"].includes(b.type) && <Field label="Текст"><textarea name="text" defaultValue={String(d.text ?? "")} className="input" /></Field>}
                    {["benefits", "services", "faq", "cases"].includes(b.type) && (
                      <Field label={b.type === "faq" ? "Вопросы: «Вопрос | Ответ» по строке" : "Пункты: «Заголовок | Текст» по строке"}>
                        <textarea name="items" defaultValue={(items ?? []).map((i) => (b.type === "faq" ? `${i.q} | ${i.a}` : b.type === "cases" ? `${i.title} | ${i.text} | ${i.metric ?? ""}` : `${i.title} | ${i.text}`)).join("\n")} className="input min-h-[120px]" />
                      </Field>
                    )}
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="visible" defaultChecked={b.visible} /> Показывать</label>
                      <label className="flex items-center gap-2 text-sm">Порядок <input name="sort" type="number" defaultValue={b.sort} className="input w-24" /></label>
                      <Submit variant="secondary">Сохранить черновик</Submit>
                    </div>
                  </ActionForm>
                </Card>
              );
            })}
          </div>
        </details>
      )}
    </>
  );
}
