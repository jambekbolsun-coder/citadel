import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { requireActive } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { canOpen } from "@/lib/nav";
import { HELP_TOPICS } from "@/lib/help-content";

export function generateStaticParams() {
  return HELP_TOPICS.map((t) => ({ topic: t.id }));
}

export async function generateMetadata({ params }: PageProps<"/app/help/[topic]">) {
  const { topic } = await params;
  return { title: HELP_TOPICS.find((t) => t.id === topic)?.title ?? "Инструкции" };
}

export default async function HelpTopicPage({ params }: PageProps<"/app/help/[topic]">) {
  const { topic } = await params;
  const s = await requireActive();
  const t = HELP_TOPICS.find((x) => x.id === topic);
  if (!t) notFound();
  const links = t.links.filter((l) => canOpen(s, l.href));
  const i = HELP_TOPICS.indexOf(t);
  const next = HELP_TOPICS[i + 1];
  return (
    <>
      <PageHeader back="/app/help" title={t.title} subtitle={t.summary} />
      <div className="space-y-4">
        <p className="rounded-xl bg-surface-2 px-4 py-3 text-sm"><span className="font-semibold">Кому доступно:</span> {t.who}</p>
        <Card title="Пошагово">
          <ol className="space-y-3">
            {t.steps.map((step, n) => (
              <li key={n} className="flex gap-3 text-[15px] leading-relaxed">
                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand">{n + 1}</span>
                <span className="min-w-0">{step}</span>
              </li>
            ))}
          </ol>
        </Card>
        <Card title="Результат"><p className="text-[15px] leading-relaxed">{t.result}</p></Card>
        {t.mistakes.length > 0 && (
          <Card title="Частые ошибки">
            <ul className="list-disc space-y-2 pl-5 text-[15px] leading-relaxed">{t.mistakes.map((m) => <li key={m}>{m}</li>)}</ul>
          </Card>
        )}
        {t.faq && t.faq.length > 0 && (
          <Card title="Вопросы и ответы">
            <div className="divide-y divide-line">
              {t.faq.map((f) => (
                <details key={f.q} className="py-2">
                  <summary className="cursor-pointer py-1 font-medium">{f.q}</summary>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{f.a}</p>
                </details>
              ))}
            </div>
          </Card>
        )}
        {links.length > 0 && (
          <section>
            <h2 className="group-title">Перейти в раздел</h2>
            <ul className="grouped">
              {links.map((l) => (
                <li key={l.href}><Link href={l.href} className="row"><span className="min-w-0 flex-1 font-medium">{l.label}</span><ChevronRight size={18} className="shrink-0 text-muted" aria-hidden /></Link></li>
              ))}
            </ul>
          </section>
        )}
        {next && <Link href={`/app/help/${next.id}`} className="block rounded-2xl border border-line bg-surface p-4 text-sm"><span className="text-muted">Следующая тема</span><span className="mt-0.5 block font-semibold">{next.title} →</span></Link>}
      </div>
    </>
  );
}
