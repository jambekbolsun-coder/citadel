import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check, ChevronRight } from "lucide-react";
import { ButtonLink, PageHeader } from "@/components/ui";
import { Scene } from "@/components/learn/scenes";
import type { Lesson } from "@/lib/learn";
import { mascotSrc } from "@/lib/mascot";
import { plural } from "@/lib/format";

/** Список уроков сотрудника. */
export function LearnIndex({ lessons, leader }: { lessons: Lesson[]; leader: boolean }) {
  return (
    <>
      <PageHeader back="/app/settings" title="Обучение" />
      <div className="mx-auto max-w-2xl space-y-4">
        <section className="flex items-center gap-3 rounded-2xl bg-brand-soft p-4">
          <Image src={mascotSrc("kind", "sm")} alt="" width={76} height={76} className="shrink-0" />
          <div className="min-w-0">
            <h2 className="font-display text-lg font-bold leading-tight">{leader ? "Как вести работу в приложении" : "Как работать в приложении"}</h2>
            <p className="mt-1 text-sm text-muted">Идите по порядку, сверху вниз. Здесь только то, что нужно именно вам.</p>
          </div>
        </section>
        <ol className="space-y-3">
          {lessons.map((l, i) => (
            <li key={l.id}>
              <Link href={`/app/learn/${l.id}`} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-2 pr-3 transition-colors hover:border-muted">
                <span className="w-24 shrink-0 overflow-hidden rounded-xl bg-surface-2 sm:w-32"><Scene name={l.steps[0].scene} /></span>
                <span className="min-w-0 flex-1">
                  <span className="text-xs font-semibold text-primary">Урок {i + 1} · {l.steps.length} {plural(l.steps.length, ["шаг", "шага", "шагов"])}</span>
                  <span className="mt-0.5 block font-semibold leading-snug">{l.title}</span>
                  <span className="mt-0.5 block text-xs text-muted">{l.hint}</span>
                </span>
                <ChevronRight size={20} className="shrink-0 text-muted" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}

/** Урок: шаги с картинками и переход к следующему. */
export function LessonView({ lesson, index, total, next }: { lesson: Lesson; index: number; total: number; next: Lesson | null }) {
  return (
    <>
      <PageHeader back="/app/learn" title={lesson.title} subtitle={`Урок ${index + 1} из ${total}`} />
      <div className="mx-auto max-w-xl space-y-4">
        <ol className="space-y-4">
          {lesson.steps.map((step, n) => (
            <li key={step.scene} className="overflow-hidden rounded-2xl border border-line bg-surface">
              <div className="bg-surface-2 px-3 pt-3"><Scene name={step.scene} /></div>
              <div className="flex gap-3 p-4">
                <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-ink">{n + 1}</span>
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold leading-snug">{step.title}</h2>
                  <p className="mt-1 text-[15px] leading-relaxed text-muted">{step.text}</p>
                  {step.link && <ButtonLink href={step.link.href} variant="secondary" className="mt-3">{step.link.label}</ButtonLink>}
                </div>
              </div>
            </li>
          ))}
        </ol>
        {next ? (
          <Link href={`/app/learn/${next.id}`} className="flex items-center gap-3 rounded-2xl bg-primary p-4 text-primary-ink">
            <span className="min-w-0 flex-1">
              <span className="block text-xs opacity-90">Следующий урок</span>
              <span className="block font-semibold leading-snug">{next.title}</span>
            </span>
            <ArrowRight size={22} className="shrink-0" aria-hidden="true" />
          </Link>
        ) : (
          <div className="flex items-center gap-3 rounded-2xl bg-good-soft p-4 text-good">
            <Check size={22} className="shrink-0" aria-hidden="true" />
            <p className="min-w-0 flex-1 font-semibold">Обучение пройдено. Можно начинать работу!</p>
          </div>
        )}
        <div className="text-center"><ButtonLink href="/app/learn" variant="ghost">Все уроки</ButtonLink></div>
      </div>
    </>
  );
}
