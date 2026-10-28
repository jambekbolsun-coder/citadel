"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { action, check, opt, str } from "@/lib/actions";

function payload(fd: FormData) {
  const company = str(fd, "company_name");
  if (!company) throw new Error("Укажите название компании");
  return {
    company_name: company,
    contact_name: opt(fd, "contact_name"),
    phone: opt(fd, "phone"),
    email: opt(fd, "email"),
    niche: opt(fd, "niche"),
    address: opt(fd, "address"),
    source: opt(fd, "source"),
    notes: opt(fd, "notes"),
    socials: { instagram: str(fd, "instagram"), tiktok: str(fd, "tiktok"), facebook: str(fd, "facebook") },
  };
}

export const createClientAction = action(async (fd) => {
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  const row = check(await supabase.from("clients").insert({ ...payload(fd), created_by: u.user!.id, manager_id: u.user!.id }).select("id").single()) as { id: string };
  redirect(`/app/clients/${row.id}`);
});

export const updateClientAction = action(async (fd) => {
  const supabase = await createClient();
  check(await supabase.from("clients").update(payload(fd)).eq("id", str(fd, "id")));
  revalidatePath(`/app/clients/${str(fd, "id")}`);
  return "Сохранено";
});
