"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/** Обновляет серверный список при изменениях таблицы (Realtime учитывает RLS). */
export function RealtimeRefresh({ table, event = "*" }: { table: string; event?: "INSERT" | "UPDATE" | "*" }) {
  const router = useRouter();
  useEffect(() => {
    const supabase = createClient();
    const ch = supabase
      .channel(`rt-${table}`)
      .on("postgres_changes" as never, { event, schema: "public", table } as never, () => router.refresh())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [table, event, router]);
  return null;
}
