"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Пока сотрудник ждёт утверждения, страница сама перепроверяет статус: после одобрения сервер перенаправит в /app. */
export function AutoCheck({ every = 20_000 }: { every?: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const t = setInterval(tick, every);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router, every]);
  return null;
}
