"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Home, Sun, CheckSquare, Calendar, Folder, Film, Camera, ShieldCheck, Megaphone, Inbox, Users, Tag, Globe, Wallet, Banknote,
  BarChart3, IdCard, KeyRound, List, Settings, Bell, Menu, X, type LucideIcon,
} from "lucide-react";
import { cn } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import type { NavItem } from "@/lib/nav";

const ICONS: Record<string, LucideIcon> = {
  home: Home, sun: Sun, check: CheckSquare, calendar: Calendar, folder: Folder, film: Film, camera: Camera, shield: ShieldCheck,
  megaphone: Megaphone, inbox: Inbox, users: Users, tag: Tag, globe: Globe, wallet: Wallet, banknote: Banknote, chart: BarChart3,
  idcard: IdCard, key: KeyRound, list: List, settings: Settings, bell: Bell,
};

function isActive(path: string, href: string) {
  return href === "/app" ? path === "/app" : path === href || path.startsWith(href + "/");
}

export function Sidebar({ items, user }: { items: NavItem[]; user: { name: string; title: string | null } }) {
  const path = usePathname();
  const groups = [...new Set(items.map((i) => i.group))];
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line bg-surface md:flex">
      <Link href="/app" className="flex items-center gap-2.5 px-4 py-4">
        <Image src="/logo.webp" alt="" width={34} height={34} className="rounded-lg" />
        <div className="leading-tight">
          <div className="font-display text-[15px] font-semibold">Р¦РёС‚Р°РґРµР»СЊ</div>
          <div className="text-[11px] text-muted">SMM KADR</div>
        </div>
      </Link>
      <nav className="flex-1 overflow-y-auto px-2 pb-4" aria-label="РћСЃРЅРѕРІРЅРѕРµ РјРµРЅСЋ">
        {groups.map((g) => (
          <div key={g} className="mt-3">
            <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{g}</div>
            {items.filter((i) => i.group === g).map((i) => {
              const Icon = ICONS[i.icon] ?? Home;
              const a = isActive(path, i.href) && !(i.href === "/app/settings" && path.startsWith("/app/settings/roles"));
              return (
                <Link key={i.href} href={i.href} className={cn("flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm", a ? "bg-surface-2 font-semibold text-ink" : "text-muted hover:bg-surface-2 hover:text-ink")}>
                  <Icon size={17} className={a ? "text-primary" : ""} /> {i.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <Link href="/app/settings" className="border-t border-line px-4 py-3 text-sm hover:bg-surface-2">
        <div className="truncate font-semibold">{user.name}</div>
        <div className="truncate text-xs text-muted">{user.title ?? ""}</div>
      </Link>
    </aside>
  );
}

export function MobileNav({ items, menu }: { items: { href: string; label: string; icon: string }[]; menu: NavItem[] }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden" aria-label="РќРёР¶РЅРµРµ РјРµРЅСЋ">
        <div className="grid grid-cols-6">
          {items.map((i) => {
            const Icon = ICONS[i.icon] ?? Home;
            const a = isActive(path, i.href);
            return (
              <Link key={i.href} href={i.href} className={cn("flex flex-col items-center gap-0.5 py-2 text-[10px]", a ? "text-primary" : "text-muted")}>
                <Icon size={20} /> {i.label}
              </Link>
            );
          })}
          <button onClick={() => setOpen(true)} className="flex flex-col items-center gap-0.5 py-2 text-[10px] text-muted" aria-label="Р’СЃРµ СЂР°Р·РґРµР»С‹">
            <Menu size={20} /> РњРµРЅСЋ
          </button>
        </div>
      </nav>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/50 md:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-3xl bg-surface p-4 pb-[calc(16px+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              <span className="font-semibold">Р Р°Р·РґРµР»С‹</span>
              <button onClick={() => setOpen(false)} aria-label="Р—Р°РєСЂС‹С‚СЊ"><X size={20} /></button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {menu.map((i) => {
                const Icon = ICONS[i.icon] ?? Home;
                return (
                  <Link key={i.href} href={i.href} onClick={() => setOpen(false)} className="flex flex-col items-center gap-1 rounded-xl bg-surface-2 p-3 text-center text-xs">
                    <Icon size={20} className="text-primary" /> {i.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** РљРѕР»РѕРєРѕР»СЊС‡РёРє: СЃС‡С‘С‚С‡РёРє РЅРµРїСЂРѕС‡РёС‚Р°РЅРЅС‹С… + realtime-РїРѕРґРїРёСЃРєР° РЅР° СЃРІРѕРё СѓРІРµРґРѕРјР»РµРЅРёСЏ (RLS С„РёР»СЊС‚СЂСѓРµС‚ РїРѕ user_id). */
export function Bell_({ userId, initialUnread }: { userId: string; initialUnread: number }) {
  const [unread, setUnread] = useState(initialUnread);
  const [toast, setToast] = useState<{ title: string; body: string | null } | null>(null);
  const router = useRouter();
  const [prevInitial, setPrevInitial] = useState(initialUnread);
  if (prevInitial !== initialUnread) {
    setPrevInitial(initialUnread);
    setUnread(initialUnread);
  }
  useEffect(() => {
    const supabase = createClient();
    const ch = supabase
      .channel(`notif-${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, (payload: { new: Record<string, unknown> }) => {
        const n = payload.new as { title: string; body: string | null; priority: string };
        setUnread((u) => u + 1);
        setToast({ title: n.title, body: n.body });
        setTimeout(() => setToast(null), 7000);
        router.refresh();
        if (document.hidden && "Notification" in window && Notification.permission === "granted") {
          navigator.serviceWorker?.ready.then((r) => r.showNotification(n.title, { body: n.body ?? "", icon: "/icons/icon-192.png", data: { url: "/app/notifications" } }));
        }
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [userId, router]);
  return (
    <>
      <Link href="/app/notifications" className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl hover:bg-surface-2" aria-label={`РЈРІРµРґРѕРјР»РµРЅРёСЏ: ${unread} РЅРµРїСЂРѕС‡РёС‚Р°РЅРЅС‹С…`}>
        <Bell size={20} />
        {unread > 0 && <span className="absolute right-1 top-1 min-w-[18px] rounded-full bg-brand px-1 text-center text-[10px] font-bold leading-[18px] text-white">{unread > 99 ? "99+" : unread}</span>}
      </Link>
      {toast && (
        <Link href="/app/notifications" className="fixed right-4 top-4 z-[60] w-[min(360px,calc(100vw-32px))] rounded-2xl border border-line bg-surface p-4 shadow-2xl" role="status">
          <div className="text-sm font-semibold">{toast.title}</div>
          {toast.body && <div className="mt-1 text-sm text-muted">{toast.body}</div>}
        </Link>
      )}
    </>
  );
}
