import Link from "next/link";
import { BookOpen, ChevronRight, Search } from "lucide-react";
import { requireActive } from "@/lib/auth";
import { Empty, PageHeader } from "@/components/ui";
import { HELP_TOPICS, STATUS_GLOSSARY, searchHelp, type HelpTopic } from "@/lib/help-content";

export const metadata = { title: "Инструкции" };

const GROUPS: HelpTopic["group"][] = ["Начало", "Каждый день", "Производство", "Продажи и реклама", "Финансы", "Управление", "Помощь"];

export default async function Help({ searchParams }: PageProps<"/app/help">) {
  const sp = await searchParams;
  await requireActive();
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  const found = searchHelp(q);
  return (
    <>
      <PageHeader back="/app/settings" title="Как пользоваться Цитаделью" subtitle="Короткие пошаговые инструкции для каждой роли. Ссылки ведут только в разделы, открытые вам." />
      <form role="search" className="mb-5 flex gap-2">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Поиск по инструкциям</span>
          <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input name="q" defaultValue={q} placeholder="Например: сдать работу, PIN, CPL" className="input pl-10!" />
        </label>
        <button className="min-h-11 shrink-0 rounded-xl bg-surface-2 px-4 text-sm font-semibold ring-1 ring-line">Найти</button>
      </form>

      {q && found.length === 0 ? <Empty title="Ничего не найдено" text="Попробуйте другое слово или откройте тему из списка." action={<Link href="/app/help" className="font-semibold text-primary">Все темы</Link>} /> : null}

      {GROUPS.map((g) => {
        const list = found.filter((t) => t.group === g);
        if (!list.length) return null;
        return (
          <section key={g} className="mb-5">
            <h2 className="group-title">{g}</h2>
            <ul className="grouped">
              {list.map((t) => (
                <li key={t.id}>
                  <Link href={`/app/help/${t.id}`} className="row">
                    <span className="row-icon"><BookOpen size={18} aria-hidden /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{t.title}</span>
                      <span className="block truncate text-[13px] text-muted">{t.who}</span>
                    </span>
                    <ChevronRight size={18} className="shrink-0 text-muted" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {!q && (
        <section className="mb-5">
          <h2 className="group-title">Словарь статусов</h2>
          <dl className="grouped">
            {STATUS_GLOSSARY.map((g) => (
              <div key={g.term} className="px-4 py-3">
                <dt className="font-medium">{g.term}</dt>
                <dd className="mt-0.5 text-sm text-muted">{g.meaning}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <p className="px-1 text-sm text-muted">Всего тем: {HELP_TOPICS.length}. <Link href="/app/help/about" className="font-semibold text-primary">О приложении и авторе</Link></p>
    </>
  );
}
