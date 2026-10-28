"use server";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { humanError, type ActionState } from "@/lib/actions";

// Публичная заявка: валидация, антиспам и запись выполняются атомарно в БД (submit_lead).
export async function submitLead(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const h = await headers();
    const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "unknown";
    const ipHash = createHash("sha256").update(`${process.env.LEAD_IP_SALT ?? "citadel"}:${ip}`).digest("hex");
    let utm: Record<string, string> = {};
    try {
      utm = JSON.parse(String(fd.get("utm") ?? "{}"));
    } catch {}
    const payload = {
      name: String(fd.get("name") ?? ""),
      phone: String(fd.get("phone") ?? ""),
      email: String(fd.get("email") ?? ""),
      business: String(fd.get("business") ?? ""),
      service: String(fd.get("service") ?? ""),
      comment: String(fd.get("comment") ?? ""),
      preferred_time: String(fd.get("preferred_time") ?? ""),
      consent: fd.get("consent") === "on",
      website: String(fd.get("website") ?? ""), // honeypot
      idempotency_key: String(fd.get("idempotency_key") ?? ""),
      source: "site",
      utm,
      ip_hash: ipHash,
    };
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("submit_lead", { p: payload });
    if (error) return { error: humanError(error) };
    if (!(data as { ok?: boolean })?.ok) return { error: "Не удалось сохранить заявку" };
    return { ok: "Заявка принята. Менеджер свяжется с вами в ближайшее рабочее время." };
  } catch (e) {
    return { error: humanError(e) };
  }
}
