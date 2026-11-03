import "server-only";
import { createClient } from "@/lib/supabase/server";
import { bishkekDay, greetName, parsePhrases, pickEmotion, pickPhrase, actionFor, type AddressForm, type Emotion, type MoodStats } from "@/lib/mascot";

export type Mood = { emotion: Emotion; name: string; phrase: string; action: { label: string; href: string } | null; day: string };

/** Илбирс для текущего сотрудника: эмоция, имя для приветствия и фраза дня. Один запрос к БД + настройки фраз. */
export async function loadMood(profile: { full_name?: string | null; greet_name?: string | null; address_form?: string | null } | null): Promise<Mood> {
  const supabase = await createClient();
  const [{ data: stats }, { data: phrases }] = await Promise.all([
    supabase.rpc("my_mood"),
    supabase.from("app_settings").select("value").eq("key", "mascot_phrases").maybeSingle(),
  ]);
  const s = (stats ?? null) as MoodStats | null;
  const emotion = pickEmotion(s);
  const name = greetName(profile?.full_name, profile?.greet_name);
  const form = (["he", "she"].includes(profile?.address_form ?? "") ? profile!.address_form : "none") as AddressForm;
  const day = bishkekDay();
  return { emotion, name, day, action: actionFor(emotion), phrase: pickPhrase(emotion, s, { name, form, day, custom: parsePhrases(phrases?.value) }) };
}
