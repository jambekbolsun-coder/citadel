"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { action, check, opt, str } from "@/lib/actions";
import { getSession } from "@/lib/auth";
import { availableWorkTabs, WORK_TAB_COOKIE } from "@/lib/nav";

export const saveProfile = action(async (fd) => {
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  let avatar: string | undefined;
  const file = fd.get("avatar");
  if (file instanceof File && file.size > 0) {
    if (!file.type.startsWith("image/")) throw new Error("Аватар — только изображение");
    if (file.size > 3 * 1024 * 1024) throw new Error("Аватар — не больше 3 МБ");
    const path = `${u.user!.id}/${Date.now()}.${(file.name.split(".").pop() ?? "jpg").replace(/[^a-z0-9]/gi, "")}`;
    check(await supabase.storage.from("avatars").upload(path, file, { contentType: file.type, upsert: true }));
    avatar = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
  }
  check(
    await supabase
      .from("profiles")
      .update({ full_name: str(fd, "full_name"), phone: opt(fd, "phone"), about: opt(fd, "about"), theme: str(fd, "theme") || "system", ...(avatar ? { avatar_url: avatar } : {}) })
      .eq("id", u.user!.id),
  );
  revalidatePath("/app", "layout");
  return "Профиль сохранён";
});

export const savePin = action(async (fd) => {
  const supabase = await createClient();
  const pin = str(fd, "pin");
  if (pin !== str(fd, "pin2")) throw new Error("PIN не совпадает");
  check(await supabase.rpc("set_device_pin", { p_device: str(fd, "device_id"), p_pin: pin, p_name: str(fd, "device_name") }));
  revalidatePath("/app/settings/devices");
  return { ok: "PIN установлен для этого устройства", data: { pin: "set" } };
});

export const removePin = action(async (fd) => {
  const supabase = await createClient();
  check(await supabase.from("device_pins").delete().eq("device_id", str(fd, "device_id")));
  revalidatePath("/app/settings/devices");
  return "Устройство удалено из доверенных";
});

export const saveAppSetting = action(async (fd) => {
  const supabase = await createClient();
  const key = str(fd, "key");
  let value = str(fd, "value");
  if (key === "work_days") {
    const days = value.split(/[,\s]+/).map(Number).filter((n) => n >= 1 && n <= 7);
    if (!days.length) throw new Error("Укажите дни 1–7");
    value = JSON.stringify(days);
  } else if (!/^\S.{0,200}$/.test(value)) throw new Error("Некорректное значение");
  check(await supabase.from("app_settings").update({ value, updated_at: new Date().toISOString() }).eq("key", key));
  revalidatePath("/app/settings/company");
  return "Сохранено";
});

export const saveCapacity = action(async (fd) => {
  const supabase = await createClient();
  const raw = str(fd, "value").replace(",", ".");
  const value = raw === "" ? null : Number(raw);
  if (value !== null && (Number.isNaN(value) || value < 0)) throw new Error("Некорректное число");
  check(await supabase.from("capacity_rules").update({ value, updated_at: new Date().toISOString() }).eq("key", str(fd, "key")));
  revalidatePath("/app/settings/capacity");
  return "Норматив сохранён";
});

/** Закрепить 4-ю кнопку нижней панели — только среди доступных сотруднику разделов. */
export async function setWorkTab(fd: FormData) {
  const s = await getSession();
  if (!s) return;
  const tab = str(fd, "tab");
  if (!(availableWorkTabs(s) as string[]).includes(tab)) return;
  const jar = await cookies();
  jar.set(`${WORK_TAB_COOKIE}_${s.userId.slice(0, 8)}`, tab, { path: "/app", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production" });
  revalidatePath("/app", "layout");
}
