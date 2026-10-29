"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronRight, LoaderCircle, Search, X } from "lucide-react";
import { MIN_QUERY, type SearchGroup } from "@/lib/search";

type State = { status: "idle" | "loading" | "done" | "error"; groups: SearchGroup[] };

export function SearchBox({ initial }: { initial: string }) {
  const [q, setQ] = useState(initial);
  const [st, setSt] = useState<State>({ status: "idle", groups: [] });
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
  }, []);

  useEffect(() => {
    const term = q.trim();
    const url = new URL(window.location.href);
    if (term) url.searchParams.set("q", term);
    else url.searchParams.delete("q");
    window.history.replaceState(window.history.state, "", url);
    if (term.length < MIN_QUERY) return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setSt((s) => ({ ...s, status: "loading" }));
      try {
        const res = await fetch(`/app/search/api?q=${encodeURIComponent(term)}`, { signal: ctrl.signal, cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { groups: SearchGroup[] };
        setSt({ status: "done", groups: body.groups });
      } catch (e) {
        if ((e as Error).name !== "AbortError") setSt({ status: "error", groups: [] });
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q]);

  const short = q.trim().length < MIN_QUERY;
  const status = short ? "idle" : st.status === "idle" ? "loading" : st.status;
  return (
    <div>
      <div className="sticky top-[calc(56px+env(safe-area-inset-top))] z-20 -mx-4 bg-bg px-4 pb-3 pt-1 md:static md:mx-0 md:px-0">
        <label className="relative block">
          <span className="sr-only">Поиск</span>
          <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            ref={input}
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Проекты, задачи, клиенты, люди…"
            className="input rounded-2xl pl-10 pr-10"
          />
          {q && (
            <button type="button" onClick={() => { setQ(""); input.current?.focus(); }} aria-label="Очистить" className="tap absolute right-0 top-1/2 -translate-y-1/2 text-muted">
              <X size={18} />
            </button>
          )}
        </label>
      </div>
      <div aria-live="polite">
        {status === "loading" && (
          <p className="flex items-center gap-2 py-6 text-sm text-muted"><LoaderCircle size={16} className="animate-spin" /> Ищем…</p>
        )}
        {status === "error" && <p role="alert" className="py-6 text-sm text-bad">Поиск не удался. Проверьте сеть и попробуйте ещё раз.</p>}
        {status === "idle" && <p className="py-6 text-sm text-muted">Введите хотя бы {MIN_QUERY} символа. Ищем только в том, что вам доступно; финансовые записи в поиск не попадают.</p>}
        {status === "done" && st.groups.length === 0 && <p className="py-6 text-sm text-muted">Ничего не найдено по запросу «{q.trim()}».</p>}
        {status === "done" &&
          st.groups.map((g) => (
            <section key={g.key} className="mb-5">
              <h2 className="group-title">{g.label}</h2>
              <ul className="grouped">
                {g.items.map((i) => (
                  <li key={i.id}>
                    <Link href={i.href} className="row">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{i.title}</span>
                        {i.sub && <span className="block truncate text-[13px] text-muted">{i.sub}</span>}
                      </span>
                      <ChevronRight size={18} className="shrink-0 text-muted" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
      </div>
    </div>
  );
}
