"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { action, check, opt, str } from "@/lib/actions";
import { normalizePhone, phoneKey } from "@/lib/phone";

function payload(fd: FormData) {
  const contact = opt(fd, "contact_name");
  const company = str(fd, "company_name") || contact;
  if (!company) throw new Error("Укажите компанию или ФИО контактного лица");
  return {
    company_name: company,
    contact_name: contact,
    phone: normalizePhone(str(fd, "phone")),
    whatsapp: normalizePhone(str(fd, "whatsapp")),
    email: opt(fd, "email"),
    niche: opt(fd, "niche"),
    address: opt(fd, "address"),
    source: opt(fd, "source"),
    notes: opt(fd, "notes"),
    socials: { instagram: str(fd, "instagram"), tiktok: str(fd, "tiktok"), facebook: str(fd, "facebook") },
  };
}

/** Дубли по телефону запрещены: один клиент — одна карточка, проектов может быть сколько угодно. */
async function assertUniquePhone(phone: string | null, exceptId?: string) {
  if (!phone) return;
  const supabase = await createClient();
  let q = supabase.from("clients").select("id,company_name").eq("phone_key", phoneKey(phone)!).is("archived_at", null).limit(1);
  if (exceptId) q = q.neq("id", exceptId);
  const { data } = await q;
  const dup = (data ?? [])[0] as { id: string; company_name: string } | undefined;
  if (dup) throw new Error(`Клиент с этим телефоном уже есть в базе: «${dup.company_name}». Откройте его карточку вместо создания новой.`);
}

export const createClientAction = action(async (fd) => {
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  const row = payload(fd);
  await assertUniquePhone(row.phone);
  const created = check(await supabase.from("clients").insert({ ...row, created_by: u.user!.id, manager_id: u.user!.id }).select("id").single()) as { id: string };
  redirect(`/app/clients/${created.id}`);
});

export const updateClientAction = action(async (fd) => {
  const supabase = await createClient();
  const id = str(fd, "id");
  const row = payload(fd);
  await assertUniquePhone(row.phone, id);
  const rows = check(await supabase.from("clients").update(row).eq("id", id).select("id")) as { id: string }[];
  if (rows.length !== 1) throw new Error("Нет права изменять карточку клиента");
  revalidatePath(`/app/clients/${id}`);
  revalidatePath("/app/clients");
  return "Сохранено";
});
