"use client";
import Link, { useLinkStatus } from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { Bell, ChevronLeft, ChevronRight, LoaderCircle, Plus, Search, X } from "lucide-react";
import { Avatar, cn, btn } from "@/components/ui";
import { iconOf } from "@/components/icons";
import { createClient } from "@/lib/supabase/client";
import { backFor, isActive, titleFor, type NavItem, type PlusAction } from "@/lib/nav";
import { dateTime, overdueText } from "@/lib/format";
import { loadMyWork, submitWork, type WorkItem } from "@/app/app/work-actions";

export const PLUS_EVENT = "citadel:plus";
export function openPlus(mode: "menu" | "submit" = "menu") {
  window.dispatchEvent(new CustomEvent(PLUS_EVENT, { detail: mode }));
}

function Pending() {
  const { pending } = useLinkStatus();
  return <span aria-hidden className={cn("nav-pending", pending && "is-pending")} />;
}

// ───────── desktop ─────────
export function Sidebar({ items, user }: { items: NavItem[]; user: { name: string; title: string | null; avatar: string | null } }) {
  const path = usePathname();
  const groups = [...new Set(items.map((i) => i.group))];
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line bg-surface md:flex">
      <Link href="/app" className="flex items-center gap-2.5 px-4 pt-4 pb-3">
        <Image src="/logo.webp" alt="" width={34} height={34} className="rounded-lg" />
        <div className="leading-tight">
          <div className="font-display text-[15px] font-semibold">Цитадель</div>
          <div className="text-[11px] text-muted">SMM KADR</div>
        </div>
      </Link>
      <div className="px-3 pb-2">
        <button type="button" onClick={() => openPlus()} aria-haspopup="dialog" className={btn("brand", "w-full")}>
          <Plus size={18} /> Создать
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 pb-4" aria-label="Основное меню">
        {groups.map((g) => (
          <div key={g} className="mt-3">
            <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{g}</div>
            {items.filter((i) => i.group === g).map((i) => {
              const Icon = iconOf(i.icon);
              const a = isActive(path, i.href) && !(i.href === "/app/settings" && path.startsWith("/app/settings/roles"));
              return (
                <Link key={i.href} href={i.href} aria-current={a ? "page" : undefined} className={cn("relative flex min-h-10 items-center gap-2.5 rounded-xl px-3 text-sm", a ? "bg-surface-2 font-semibold text-ink" : "text-muted hover:bg-surface-2 hover:text-ink")}>
                  <Icon size={18} className={a ? "text-brand" : ""} /> {i.label}
                  <Pending />
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <Link href="/app/settings" className="flex items-center gap-3 border-t border-line px-4 py-3 text-sm hover:bg-surface-2">
        <Avatar name={user.name} url={user.avatar} size={34} />
        <span className="min-w-0">
          <span className="block truncate font-semibold">{user.name}</span>
          <span className="block truncate text-xs text-muted">{user.title ?? ""}</span>
        </span>
      </Link>
    </aside>
  );
}

// ───────── верхняя панель ─────────
export function AppHeader({ userId, name, avatar, unread }: { userId: string; name: string; avatar: string | null; unread: number }) {
  const path = usePathname();
  const router = useRouter();
  const title = titleFor(path);
  const back = backFor(path);
  const depth = useRef(0);
  useEffect(() => {
    depth.current += 1;
  }, [path]);
  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-bg/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-1 px-2 md:px-4">
        <Link href="/app/settings/profile" aria-label="Мой профиль" className="tap shrink-0">
          <Avatar name={name} url={avatar} size={34} />
        </Link>
        {back && (
          <Link
            href={back}
            aria-label="Назад"
            className="tap shrink-0 text-muted"
            onClick={(e) => {
              if (depth.current > 1 && window.history.length > 1) {
                e.preventDefault();
                router.back();
              }
            }}
          >
            <ChevronLeft size={24} />
          </Link>
        )}
        <div className={cn("min-w-0 flex-1 truncate font-display text-[17px] font-semibold", !back && "pl-1")}>{title}</div>
        <Link href="/app/search" aria-label="Поиск" className={cn("tap shrink-0", path === "/app/search" ? "text-brand" : "text-ink")}>
          <Search size={22} />
        </Link>
        <BellButton userId={userId} initialUnread={unread} />
      </div>
    </header>
  );
}

/** Счётчик непрочитанных + realtime по своим уведомлениям (RLS фильтрует по user_id). Без перерисовки всей страницы. */
function BellButton({ userId, initialUnread }: { userId: string; initialUnread: number }) {
  const [unread, setUnread] = useState(initialUnread);
  const [toast, setToast] = useState<{ title: string; body: string | null } | null>(null);
  const [prevInitial, setPrevInitial] = useState(initialUnread);
  if (prevInitial !== initialUnread) {
    setPrevInitial(initialUnread);
    setUnread(initialUnread);
  }
  useEffect(() => {
    const supabase = createClient();
    let hide: ReturnType<typeof setTimeout> | undefined;
    const ch = supabase
      .channel(`notif-${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, (payload: { new: Record<string, unknown> }) => {
        const n = payload.new as { title: string; body: string | null };
        setUnread((u) => u + 1);
        setToast({ title: n.title, body: n.body });
        clearTimeout(hide);
        hide = setTimeout(() => setToast(null), 7000);
        if (document.hidden && "Notification" in window && Notification.permission === "granted") {
          navigator.serviceWorker?.ready.then((r) => r.showNotification(n.title, { body: n.body ?? "", icon: "/icons/icon-192.png", data: { url: "/app/notifications" } }));
        }
      })
      .subscribe();
    return () => {
      clearTimeout(hide);
      supabase.removeChannel(ch);
    };
  }, [userId]);
  return (
    <>
      <Link href="/app/notifications" className="tap relative shrink-0" aria-label={unread ? `Уведомления: ${unread} непрочитанных` : "Уведомления"}>
        <Bell size={22} />
        {unread > 0 && <span className="absolute right-1.5 top-1.5 min-w-[18px] rounded-full bg-brand px-1 text-center text-[10px] font-bold leading-[18px] text-white ring-2 ring-bg">{unread > 99 ? "99+" : unread}</span>}
      </Link>
      {toast && (
        <Link href="/app/notifications" onClick={() => setToast(null)} className="fixed inset-x-4 top-[calc(64px+env(safe-area-inset-top))] z-[60] mx-auto max-w-sm rounded-2xl border border-line bg-surface p-4 shadow-2xl" role="status">
          <div className="text-sm font-semibold">{toast.title}</div>
          {toast.body && <div className="mt-1 line-clamp-2 text-sm text-muted">{toast.body}</div>}
        </Link>
      )}
    </>
  );
}

// ───────── нижняя панель: строго 5 позиций ─────────
export function BottomNav({ tab }: { tab: { href: string; label: string; icon: string; match: string[] } }) {
  const path = usePathname();
  const items = [
    { href: "/app", label: "Главная", icon: "home", active: path === "/app" },
    { href: "/app/calendar", label: "Календарь", icon: "calendar", active: isActive(path, "/app/calendar") },
    null,
    { href: tab.href, label: tab.label, icon: tab.icon, active: tab.match.some((m) => isActive(path, m)) },
    { href: "/app/settings", label: "Настройки", icon: "settings", active: isActive(path, "/app/settings") },
  ];
  return (
    <nav className="bottom-nav fixed inset-x-0 bottom-0 z-40 border-t border-line/70 bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden" aria-label="Нижнее меню">
      <div className="mx-auto grid h-16 max-w-lg grid-cols-5 items-stretch px-1">
        {items.map((i) => {
          if (!i)
            return (
              <div key="plus" className="flex items-start justify-center">
                <button type="button" onClick={() => openPlus()} aria-haspopup="dialog" aria-controls="plus-sheet" aria-label="Создать или сдать работу" className="plus-btn -mt-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-white shadow-lg shadow-brand/30 ring-4 ring-bg active:scale-95">
                  <Plus size={28} strokeWidth={2.4} />
                </button>
              </div>
            );
          const Icon = iconOf(i.icon);
          return (
            <Link key={i.href} href={i.href} aria-current={i.active ? "page" : undefined} className={cn("relative flex flex-col items-center justify-center gap-1 text-[11px] font-medium active:opacity-70", i.active ? "text-brand" : "text-muted")}>
              <Icon size={23} strokeWidth={i.active ? 2.3 : 1.9} />
              <span className="max-w-full truncate px-0.5">{i.label}</span>
              <Pending />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

// ───────── меню «+» ─────────
export function PlusSheet({ actions }: { actions: PlusAction[] }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<"menu" | "submit">("menu");
  const [opened, setOpened] = useState(0);
  const path = usePathname();
  useEffect(() => {
    const open = (e: Event) => {
      setMode((e as CustomEvent).detail === "submit" ? "submit" : "menu");
      setOpened((n) => n + 1);
      if (!ref.current?.open) ref.current?.showModal();
    };
    window.addEventListener(PLUS_EVENT, open);
    return () => window.removeEventListener(PLUS_EVENT, open);
  }, []);
  useEffect(() => {
    ref.current?.close();
  }, [path]);
  const close = () => ref.current?.close();
  return (
    <dialog
      ref={ref}
      id="plus-sheet"
      className="sheet"
      aria-labelledby="plus-title"
      onClose={() => setMode("menu")}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
    >
      <div className="sheet-panel">
        <div className="sheet-grip" aria-hidden />
        <div className="mb-2 flex items-center gap-2">
          {mode === "submit" && (
            <button type="button" className="tap -ml-2 text-muted" onClick={() => setMode("menu")} aria-label="К списку действий">
              <ChevronLeft size={22} />
            </button>
          )}
          <h2 id="plus-title" className="flex-1 text-lg font-semibold">{mode === "submit" ? "Сдать работу" : "Что сделать?"}</h2>
          <button type="button" className="tap -mr-2 text-muted" onClick={close} aria-label="Закрыть">
            <X size={22} />
          </button>
        </div>
        {mode === "menu" ? (
          <ul className="grouped">
            {actions.map((a) => {
              const Icon = iconOf(a.icon);
              const body = (
                <>
                  <span className={cn("row-icon", a.key === "submit" && "bg-brand text-white")}><Icon size={19} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{a.label}</span>
                    <span className="block truncate text-[13px] text-muted">{a.hint}</span>
                  </span>
                  <ChevronRight size={18} className="shrink-0 text-muted" />
                </>
              );
              return (
                <li key={a.key}>
                  {a.href ? (
                    <Link href={a.href} onClick={close} className="row">{body}</Link>
                  ) : (
                    <button type="button" className="row w-full text-left" onClick={() => setMode("submit")}>{body}</button>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <SubmitPanel key={opened} onClose={close} />
        )}
      </div>
    </dialog>
  );
}

function SubmitPanel({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [items, setItems] = useState<WorkItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [sel, setSel] = useState<WorkItem | null>(null);
  const [state, act, pending] = useActionState(submitWork, null);
  useEffect(() => {
    let live = true;
    loadMyWork()
      .then((x) => live && setItems(x))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  if (state?.ok)
    return (
      <div className="py-6 text-center">
        <p role="status" className="font-semibold text-good">{state.ok}</p>
        <button type="button" className={btn("secondary", "mt-4")} onClick={onClose}>Готово</button>
      </div>
    );
  if (failed) return <p role="alert" className="py-6 text-center text-sm text-bad">Не удалось загрузить задачи. Проверьте сеть и попробуйте ещё раз.</p>;
  if (!items)
    return (
      <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted">
        <LoaderCircle size={18} className="animate-spin" /> Загружаем ваши задачи…
      </p>
    );
  if (!items.length)
    return (
      <div className="py-6 text-center">
        <p className="font-semibold">Сдавать нечего</p>
        <p className="mt-1 text-sm text-muted">Назначенных задач и материалов в работе нет. Материалы со статусом «Запланирован» или «Готов к съёмке» сначала переведите в работу в карточке материала.</p>
      </div>
    );
  if (!sel)
    return (
      <ul className="grouped max-h-[55dvh] overflow-y-auto">
        {items.map((w) => (
          <li key={w.kind + w.id}>
            <button type="button" className="row w-full text-left" onClick={() => setSel(w)}>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{w.title}</span>
                <span className="block truncate text-[13px] text-muted">
                  {w.kind === "content" ? "Материал" : "Задача"}
                  {w.project ? ` · ${w.project}` : ""}
                  {w.due ? ` · ${overdueText(w.due) ?? "до " + dateTime(w.due)}` : ""}
                </span>
              </span>
              <ChevronRight size={18} className="shrink-0 text-muted" />
            </button>
          </li>
        ))}
      </ul>
    );
  return (
    <form action={act} className="space-y-3">
      <input type="hidden" name="kind" value={sel.kind} />
      <input type="hidden" name="id" value={sel.id} />
      <div className="rounded-2xl bg-surface-2 p-3">
        <div className="font-semibold">{sel.title}</div>
        <div className="text-[13px] text-muted">{sel.target === "review" ? "Уйдёт на проверку: статус сменится, проверяющий получит уведомление" : "Проверяющего нет — задача будет закрыта"}</div>
      </div>
      <label className="block">
        <span className="label">{sel.needsUrl ? "Ссылка на файл результата *" : "Результат: ссылка или описание *"}</span>
        {sel.needsUrl ? (
          <input name="result" type="url" inputMode="url" required placeholder="https://drive.google.com/…" className="input" autoComplete="off" />
        ) : (
          <textarea name="result" required rows={3} placeholder="Что сделано, ссылка на файл или пост" className="input" />
        )}
      </label>
      <label className="block">
        <span className="label">Комментарий</span>
        <input name="note" className="input" placeholder="Необязательно" />
      </label>
      {state?.error && <p role="alert" className="rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">{state.error}</p>}
      <div className="flex gap-2">
        <button type="button" className={btn("secondary", "flex-1")} onClick={() => setSel(null)} disabled={pending}>Назад</button>
        <button type="submit" className={btn("brand", "flex-1")} disabled={pending}>
          {pending ? <LoaderCircle size={18} className="animate-spin" /> : null} {pending ? "Отправляем…" : "Сдать"}
        </button>
      </div>
      <p className="text-xs text-muted">Ссылку на файл (Google Drive, Яндекс Диск и т. п.) прикладывайте с доступом для проверяющего. Публикация засчитывается только после размещения и проверки.</p>
    </form>
  );
}
