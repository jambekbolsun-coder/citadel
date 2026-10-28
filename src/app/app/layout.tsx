import Image from "next/image";
import Link from "next/link";
import { requireActive } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NAV, MOBILE_NAV } from "@/lib/nav";
import { Sidebar, MobileNav, Bell_ } from "@/components/shell";
import { PinLock } from "@/components/pin-lock";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const s = await requireActive();
  const supabase = await createClient();
  const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null).is("archived_at", null);
  const items = NAV.filter((i) => !i.perms || i.perms.some((p) => s.can(p)));
  return (
    <div className="flex min-h-screen">
      <Sidebar items={items} user={{ name: s.profile?.full_name || s.email || "", title: s.profile?.job_title ?? null }} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-bg/90 px-4 py-2 backdrop-blur md:px-6">
          <Link href="/app" className="flex items-center gap-2 md:hidden">
            <Image src="/logo.webp" alt="" width={28} height={28} className="rounded-md" />
            <span className="font-display font-semibold">Цитадель</span>
          </Link>
          <div className="hidden text-sm text-muted md:block">SMM KADR · Бишкек</div>
          <div className="flex items-center gap-1">
            <Bell_ userId={s.userId} initialUnread={count ?? 0} />
          </div>
        </header>
        <main className="safe-bottom mx-auto w-full max-w-7xl flex-1 px-4 py-5 md:px-6 md:py-6">{children}</main>
      </div>
      <MobileNav items={MOBILE_NAV} menu={items} />
      <PinLock userId={s.userId} />
    </div>
  );
}
