import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Profile = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  about: string | null;
  job_title: string | null;
  department_id: string | null;
  manager_id: string | null;
  responsibilities: string | null;
  status: "pending_approval" | "active" | "blocked";
  theme: string;
};

export type Session = {
  userId: string;
  email: string | null;
  profile: Profile | null;
  roles: string[];
  perms: Set<string>;
  isOwner: boolean;
  can: (perm: string) => boolean;
};

// Одна загрузка сессии на запрос: пользователь, профиль, роли, права (права вычисляются в БД)
export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const [{ data: profile }, { data: roles }, { data: perms }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", auth.user.id).maybeSingle(),
    supabase.from("user_roles").select("role_code").eq("user_id", auth.user.id),
    supabase.rpc("my_permissions"),
  ]);
  const roleCodes = (roles ?? []).map((r: { role_code: string }) => r.role_code);
  const permSet = new Set<string>((perms as string[] | null) ?? []);
  const isOwner = roleCodes.includes("owner") && profile?.status === "active";
  return {
    userId: auth.user.id,
    email: auth.user.email ?? null,
    profile: (profile as Profile) ?? null,
    roles: roleCodes,
    perms: permSet,
    isOwner,
    can: (p: string) => isOwner || permSet.has(p),
  };
});

/** Для страниц /app: требует активный профиль. */
export async function requireActive(perm?: string | string[]) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.profile?.status !== "active") redirect("/pending");
  if (perm) {
    const list = Array.isArray(perm) ? perm : [perm];
    if (!list.some((p) => s.can(p))) redirect("/app?denied=1");
  }
  return s;
}
