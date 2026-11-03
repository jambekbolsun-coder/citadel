import { redirect } from "next/navigation";
import { requireActive } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ActionForm, Submit } from "@/components/action-form";
import { SettingsPage } from "@/components/settings-list";
import { DEFAULT_PHRASES, EMOTIONS, EMOTION_LABEL, EMOTION_RULE, mascotSrc, parsePhrases } from "@/lib/mascot";
import { saveMascotPhrases } from "../actions";

export const metadata = { title: "Илбирс и приветствие" };

export default async function MascotSettings() {
  const s = await requireActive();
  if (!s.isOwner) redirect("/app/settings");
  const supabase = await createClient();
  const { data } = await supabase.from("app_settings").select("value").eq("key", "mascot_phrases").maybeSingle();
  const custom = parsePhrases(data?.value) ?? {};
  return (
    <SettingsPage title="Илбирс и приветствие" subtitle="Раз в день при входе илбирс здоровается и говорит одну фразу по делам сотрудника">
      <p className="mb-3 rounded-xl bg-surface-2 p-3 text-sm text-muted">
        По строке на вариант — илбирс выбирает один на день. Подстановки: <b className="text-ink">{"{name}"}</b> — имя, <b className="text-ink">{"{n}"}</b> — число задач («3 задачи»),{" "}
        <b className="text-ink">{"{praise}"}</b> — «молодец / умница / на высоте» по обращению, которое сотрудник выбрал в профиле. Пустое поле — фразы по умолчанию.
      </p>
      <ActionForm action={saveMascotPhrases} className="space-y-3">
        {EMOTIONS.map((e) => (
          <div key={e} className="flex gap-3 rounded-2xl border border-line bg-surface p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={mascotSrc(e, "sm")} alt="" width={72} height={72} loading="lazy" className="h-[72px] w-[72px] flex-none object-contain" />
            <label className="block min-w-0 flex-1">
              <span className="font-semibold">{EMOTION_LABEL[e]}</span>
              <span className="block text-xs text-muted">Когда: {EMOTION_RULE[e]}</span>
              <textarea name={e} rows={3} defaultValue={(custom[e] ?? []).join("\n")} placeholder={DEFAULT_PHRASES[e].join("\n")} className="input mt-2 text-sm" />
            </label>
          </div>
        ))}
        <div className="sticky-actions"><Submit className="w-full">Сохранить фразы</Submit></div>
      </ActionForm>
    </SettingsPage>
  );
}
