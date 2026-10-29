import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type Person = { id: string; full_name: string; job_title: string | null; avatar_url: string | null };

/** Активные сотрудники для выпадающих списков (RLS: активные видят активных). */
export const activePeople = cache(async (): Promise<Person[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("id,full_name,job_title,avatar_url").eq("status", "active").order("full_name");
  return (data ?? []) as Person[];
});

export const peopleByRole = cache(async (role: string): Promise<Person[]> => {
  const supabase = await createClient();
  const { data } = await supabase.from("user_roles").select("profiles!user_roles_user_id_fkey(id,full_name,job_title,avatar_url,status)").eq("role_code", role);
  return ((data ?? []) as unknown as { profiles: Person & { status: string } }[]).map((r) => r.profiles).filter((p) => p && p.status === "active");
});

export const accounts = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.from("financial_accounts").select("id,name,currency").is("archived_at", null).order("created_at");
  return (data ?? []) as { id: string; name: string; currency: string }[];
});

export function nameOf(people: Person[], id: string | null | undefined) {
  if (!id) return "—";
  return people.find((p) => p.id === id)?.full_name ?? "—";
}
