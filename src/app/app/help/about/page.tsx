import Link from "next/link";
import Image from "next/image";
import { requireActive } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { AUTHOR_TEXT } from "@/lib/help-content";
import { APP_VERSION } from "@/lib/version";

export const metadata = { title: "О приложении" };

export default async function About() {
  await requireActive();
  return (
    <>
      <PageHeader back="/app/settings" title="О приложении" />
      <div className="mx-auto max-w-xl space-y-4">
        <div className="flex flex-col items-center pt-2 text-center">
          <Image src="/icons/icon-192.png" alt="" width={88} height={88} className="rounded-[22px]" />
          <h2 className="mt-3 font-display text-[22px] font-semibold">Цитадель</h2>
          <p className="text-sm text-muted">Система управления компанией SMM KADR</p>
          <p className="mt-1 text-xs text-muted">Версия {APP_VERSION}</p>
        </div>
        <Card title="Автор">
          <blockquote className="text-[15px] leading-relaxed">{AUTHOR_TEXT}</blockquote>
        </Card>
        <ul className="grouped">
          <li><Link href="/app/help" className="row"><span className="flex-1 font-medium">Инструкции · как пользоваться</span></Link></li>
          <li><Link href="/app/help/troubleshooting" className="row"><span className="flex-1 font-medium">Поддержка и устранение проблем</span></Link></li>
          <li><Link href="/privacy" className="row"><span className="flex-1 font-medium">Политика конфиденциальности</span></Link></li>
        </ul>
      </div>
    </>
  );
}
