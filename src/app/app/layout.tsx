import { cookies } from "next/headers";
import { requireActive } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { plusActions, resolveWorkTab, visibleNav, WORK_TAB_COOKIE, WORK_TABS } from "@/lib/nav";
import { AppHeader, BottomNav, PlusSheet, Sidebar } from "@/components/shell";
import { PinLock } from "@/components/pin-lock";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const supabase = await createClient();
  // Счётчик запрашивается параллельно с сессией: RLS сама ограничивает его своими уведомлениями
  const [s, { count }, jar] = await Promise.all([
    requireActive(),
    supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null).is("archived_at", null),
    cookies(),
  ]);
  const tab = WORK_TABS[resolveWorkTab(s, jar.get(`${WORK_TAB_COOKIE}_${s.userId.slice(0, 8)}`)?.value)];
  const name = s.profile?.full_name || s.email || "";
  return (
    <div className="flex min-h-dvh">
      <a href="#main" className="skip-link">Перейти к содержимому</a>
      <Sidebar items={visibleNav(s)} user={{ name, title: s.profile?.job_title ?? null, avatar: s.profile?.avatar_url ?? null }} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader userId={s.userId} name={name} avatar={s.profile?.avatar_url ?? null} unread={count ?? 0} />
        <main id="main" className="app-main mx-auto w-full max-w-7xl flex-1 px-4 pt-4 md:px-6 md:py-6">{children}</main>
      </div>
      <BottomNav tab={{ href: tab.href, label: tab.label, icon: tab.icon, match: tab.match }} />
      <PlusSheet actions={plusActions(s)} />
      <PinLock userId={s.userId} />
    </div>
  );
}
