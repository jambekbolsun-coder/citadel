"use server";
import { getSession } from "@/lib/auth";
import { loadMood, type Mood } from "@/lib/mood";

/** Для заставки-приветствия: вызывается с устройства один раз в день, только при первом открытии. */
export async function getMood(): Promise<Mood | null> {
  const s = await getSession();
  if (!s?.profile || s.profile.status !== "active") return null;
  return loadMood(s.profile as { full_name?: string | null; greet_name?: string | null; address_form?: string | null });
}
