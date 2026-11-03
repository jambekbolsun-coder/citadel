"use client";
import { useEffect } from "react";
import { touchActivity } from "@/app/app/contests/actions";
import { bishkekDay } from "@/lib/mascot";

/** Одна отметка в день «сотрудник был в приложении» (показатель «Дни в приложении» в соревнованиях). Без деталей действий. */
export function ActivityPing({ userId }: { userId: string }) {
  useEffect(() => {
    const key = `kadr.active.${userId.slice(0, 8)}`;
    const day = bishkekDay();
    try {
      if (localStorage.getItem(key) === day) return;
      localStorage.setItem(key, day);
    } catch {}
    void touchActivity();
  }, [userId]);
  return null;
}
