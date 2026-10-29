"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Обновляет серверный список при изменениях таблицы (Realtime учитывает RLS).
 * Серия событий сливается в одну перерисовку; в скрытой вкладке обновление откладывается до возврата.
 */
export function RealtimeRefresh({ table, event = "*", delay = 800 }: { table: string; event?: "INSERT" | "UPDATE" | "*"; delay?: number }) {
  const router = useRouter();
  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stale = false;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (document.hidden) stale = true;
        else router.refresh();
      }, delay);
    };
    const onVisible = () => {
      if (!document.hidden && stale) {
        stale = false;
        router.refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    const ch = supabase
      .channel(`rt-${table}`)
      .on("postgres_changes" as never, { event, schema: "public", table } as never, refresh)
      .subscribe();
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(ch);
    };
  }, [table, event, delay, router]);
  return null;
}
