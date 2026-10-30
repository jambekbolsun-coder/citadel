"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { KeepForm } from "@/components/keep-form";
import { btn, cn } from "@/components/ui";
import { ANCHORS, ICONS, slidePrice, type PublicTariff, type Slide } from "@/lib/site-model";
import { dateTime } from "@/lib/format";
import { resetSlide, saveSlide } from "../actions";

function F({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}
function Check({ name, label, def }: { name: string; label: string; def?: boolean }) {
  return <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" name={name} defaultChecked={!!def} className="h-4 w-4" /> {label}</label>;
}
function Group({ title, children, open = true }: { title: string; children: ReactNode; open?: boolean }) {
  return (
    <details open={open} className="rounded-2xl border border-line bg-surface">
      <summary className="cursor-pointer list-none px-4 py-3 font-semibold">{title}</summary>
      <div className="grid gap-3 border-t border-line p-4 sm:grid-cols-2">{children}</div>
    </details>
  );
}

const CTA_ACTIONS: [string, string][] = [["lead", "Открыть форму заявки (тариф подставится)"], ["tariffs", "Перейти к тарифам"], ["link", "Своя ссылка"]];

// После сохранения страница перемонтирует редактор (key = updated_at): поля показывают сохранённый черновик, выбранный файл очищается.
export function SlideEditor({ blockKey, visible, slide: s, tariffs, hasDefault, changed, savedAt }: { blockKey: string; visible: boolean; slide: Slide; tariffs: PublicTariff[]; hasDefault: boolean; changed: boolean; savedAt: string }) {
  const { mismatch } = slidePrice(s, tariffs);
  const stats = (s.stats ?? []).map((x) => [x.value, x.label ?? "", x.note ?? "", [x.wide && "широко", x.plain && "белым"].filter(Boolean).join(" ")].join(" | ").replace(/( \| )+$/, "")).join("\n");
  const images = (s.images ?? []).map((x) => [x.src, x.alt, x.caption ?? "", x.sub ?? ""].join(" | ").replace(/( \| )+$/, "")).join("\n");
  const icons = (s.icons ?? []).map((x) => `${x.icon} | ${x.label}`).join("\n");

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/app/cms/preview${s.anchor ? `#${s.anchor}` : ""}`} target="_blank" className={btn("secondary")}>Предпросмотр черновика</Link>
        <Link href="/app/cms" className={btn("secondary")}>К списку и публикации</Link>
        <span className={cn("text-sm", changed ? "text-warn" : "text-muted")}>{changed ? "Черновик не опубликован" : "Опубликовано"} · сохранено {dateTime(savedAt)}</span>
      </div>

      <KeepForm action={saveSlide} className="space-y-3">
        {(pending) => (
          <>
            <input type="hidden" name="key" value={blockKey} />
            <Group title="Основное">
              <F label="Рубрика (подпись секции)"><input name="rubric" defaultValue={s.rubric} className="input" /></F>
              <F label="Плашка над заголовком"><input name="pill" defaultValue={s.pill} className="input" /></F>
              <F label="Заголовок (белый)" hint="Перенос строки — Enter" className="sm:col-span-2"><textarea name="title" defaultValue={s.title} rows={3} className="input" /></F>
              <F label="Вторая строка заголовка (бирюзовая)" className="sm:col-span-2"><input name="title_accent" defaultValue={s.title_accent} className="input" /></F>
              <F label="Подзаголовок" className="sm:col-span-2"><textarea name="lead" defaultValue={s.lead} rows={2} className="input" /></F>
              <Check name="lead_accent" label="Подзаголовок бирюзовым" def={s.lead_accent} />
              <Check name="visible" label="Показывать секцию на сайте" def={visible} />
              <F label="Шаблон секции">
                <select name="layout" defaultValue={s.layout ?? "default"} className="input">
                  <option value="hero">Первый экран</option><option value="default">Обычная секция</option><option value="contact">Контакты + форма заявки</option>
                </select>
              </F>
              <F label="Пункт меню (якорь)">
                <select name="anchor" defaultValue={s.anchor ?? ""} className="input">{ANCHORS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              </F>
            </Group>

            <Group title="Цена и тариф">
              <F label="Тариф из справочника" hint="Кнопка «Выбрать тариф» подставит его в заявку">
                <select name="tariff_code" defaultValue={s.tariff_code ?? ""} className="input">
                  <option value="">— не связан —</option>
                  {tariffs.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
                </select>
              </F>
              <F label="Цена (крупно)" hint="Пусто — цена текущей версии тарифа из справочника"><input name="price" defaultValue={s.price} className="input" /></F>
              <F label="Подпись цены"><input name="price_unit" defaultValue={s.price_unit} placeholder="СОМ / МЕСЯЦ" className="input" /></F>
              <div className="flex flex-col">
                <Check name="price_accent" label="Цена бирюзовым" def={s.price_accent} />
                <Check name="price_unit_large" label="Подпись цены крупно" def={s.price_unit_large} />
              </div>
              {mismatch && (
                <p className="rounded-xl bg-warn-soft p-3 text-sm text-warn sm:col-span-2">
                  Цена на сайте отличается от справочника: «{mismatch.name}» = {(mismatch.price_minor! / 100).toLocaleString("ru-RU")} {mismatch.currency}. Мастер проекта использует справочник — обновите <Link href="/app/tariffs" className="underline">тариф</Link> новой версией, чтобы цены совпадали.
                </p>
              )}
            </Group>

            <Group title="Цифры, список и команда">
              <F label="Цифры: «значение | подпись | примечание | широко/белым»" className="sm:col-span-2"><textarea name="stats" defaultValue={stats} rows={4} className="input font-mono text-sm" /></F>
              <F label="Вид цифр">
                <select name="stats_style" defaultValue={s.stats_style ?? "grid"} className="input">
                  <option value="grid">Сетка 2 колонки</option><option value="grid3">Сетка 3 колонки</option><option value="big">Одна крупная цифра + карточки</option><option value="team">Команда (номер + роль)</option>
                </select>
              </F>
              <F label="Список с маркерами (по строке)" className="sm:col-span-2"><textarea name="bullets" defaultValue={(s.bullets ?? []).join("\n")} rows={4} className="input" /></F>
              <F label="Заголовок блока команды"><input name="chips_title" defaultValue={s.chips_title} className="input" /></F>
              <F label="Команда (по строке)"><textarea name="chips" defaultValue={(s.chips ?? []).join("\n")} rows={4} className="input" /></F>
              <F label="Строка под списком" className="sm:col-span-2"><input name="note" defaultValue={s.note} className="input" /></F>
            </Group>

            <Group title="Акцентная карточка, плашка, сноска">
              <F label="Надзаголовок карточки"><input name="card_kicker" defaultValue={s.card?.kicker} className="input" /></F>
              <F label="Заголовок карточки"><input name="card_title" defaultValue={s.card?.title} className="input" /></F>
              <F label="Текст карточки" className="sm:col-span-2"><textarea name="card_text" defaultValue={s.card?.text} rows={2} className="input" /></F>
              <Check name="card_title_accent" label="Заголовок карточки бирюзовым" def={s.card?.title_accent} />
              <Check name="card_text_accent" label="Текст карточки бирюзовым" def={s.card?.text_accent} />
              <F label="Плашка (внизу секции)"><input name="badge" defaultValue={s.badge} className="input" /></F>
              <F label={`Иконки: «иконка | подпись» (${ICONS.join(", ")})`}><textarea name="icons" defaultValue={icons} rows={3} className="input font-mono text-sm" /></F>
              <F label="Сноска (условия, мелким шрифтом — всегда видна)" className="sm:col-span-2"><textarea name="footnote" defaultValue={s.footnote} rows={2} className="input" /></F>
            </Group>

            <Group title="Изображения">
              <F label="Вид">
                <select name="image_style" defaultValue={s.image_style ?? "panel"} className="input">
                  <option value="hero">Первый экран: оборудование + 2 телефона</option><option value="object">Предмет без фона (оборудование)</option>
                  <option value="phone">Телефон со скриншотом</option><option value="panel">Карточка-изображение (партнёры, отчёт)</option><option value="phones">Ряд телефонов с подписями (кейсы)</option>
                </select>
              </F>
              <F label="Описание для загружаемого файла (alt)"><input name="upload_alt" placeholder="Что изображено" className="input" /></F>
              <F label="Изображения: «адрес | описание | подпись | подпись 2» по строке" hint="Только реальные материалы компании: скриншоты профилей, логотипы партнёров — с их согласия." className="sm:col-span-2">
                <textarea name="images" defaultValue={images} rows={4} className="input font-mono text-sm" />
              </F>
              <F label="Загрузить новое изображение (WebP/PNG/JPEG/AVIF, до 5 МБ)" hint="Добавится в конец списка выше. Удалите строку старого изображения, чтобы заменить его." className="sm:col-span-2">
                <input type="file" name="upload" accept="image/webp,image/png,image/jpeg,image/avif" multiple className="input py-2" />
              </F>
            </Group>

            <Group title="Кнопки" open={false}>
              <F label="Кнопка 1: текст"><input name="cta_label" defaultValue={s.cta?.label} className="input" /></F>
              <F label="Кнопка 1: действие"><select name="cta_action" defaultValue={s.cta?.action ?? "lead"} className="input">{CTA_ACTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></F>
              <F label="Кнопка 1: ссылка (для «Своя ссылка»)" className="sm:col-span-2"><input name="cta_href" defaultValue={s.cta?.href} placeholder="https://… или #contacts" className="input" /></F>
              <F label="Кнопка 2: текст"><input name="cta2_label" defaultValue={s.cta2?.label} className="input" /></F>
              <F label="Кнопка 2: действие"><select name="cta2_action" defaultValue={s.cta2?.action ?? "tariffs"} className="input">{CTA_ACTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></F>
              <F label="Кнопка 2: ссылка" className="sm:col-span-2"><input name="cta2_href" defaultValue={s.cta2?.href} className="input" /></F>
            </Group>

            <div className="sticky bottom-[calc(var(--tabbar-h,0px)+12px)] z-10 flex flex-wrap gap-2 rounded-2xl border border-line bg-surface/95 p-3 backdrop-blur md:bottom-4">
              <button type="submit" disabled={pending} className={btn("primary", "flex-1 sm:flex-none")}>{pending ? "Сохранение…" : "Сохранить черновик"}</button>
              <Link href={`/app/cms/preview${s.anchor ? `#${s.anchor}` : ""}`} target="_blank" className={btn("secondary")}>Предпросмотр</Link>
            </div>
          </>
        )}
      </KeepForm>

      {hasDefault && (
        <KeepForm action={resetSlide} className="rounded-2xl border border-line p-4 text-sm">
          {(pending) => (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <input type="hidden" name="key" value={blockKey} />
              <span className="text-muted">Вернуть текст и изображения этой секции из презентации SMM KADR 2026 (только черновик).</span>
              <button type="submit" disabled={pending} className={btn("secondary")} onClick={(e) => { if (!window.confirm("Заменить черновик секции текстом презентации?")) e.preventDefault(); }}>
                {pending ? "…" : "Вернуть исходный текст"}
              </button>
            </div>
          )}
        </KeepForm>
      )}
    </div>
  );
}
