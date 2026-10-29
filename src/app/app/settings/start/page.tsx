import { cookies } from "next/headers";
import { requireActive } from "@/lib/auth";
import { iconOf } from "@/components/icons";
import { SettingsPage } from "@/components/settings-list";
import { availableWorkTabs, defaultWorkTab, resolveWorkTab, WORK_TAB_COOKIE, WORK_TABS } from "@/lib/nav";
import { setWorkTab } from "../actions";
import { TabButton } from "./tab-button";

export const metadata = { title: "Раздел в нижней панели" };

export default async function StartTab() {
  const s = await requireActive();
  const jar = await cookies();
  const current = resolveWorkTab(s, jar.get(`${WORK_TAB_COOKIE}_${s.userId.slice(0, 8)}`)?.value);
  const def = defaultWorkTab(s);
  return (
    <SettingsPage title="Раздел в нижней панели" subtitle="Четвёртая кнопка внизу. По умолчанию выбирается по вашей роли; можно закрепить другой доступный раздел на этом устройстве.">
      <form action={setWorkTab}>
        <ul className="grouped">
          {availableWorkTabs(s).map((k) => {
            const t = WORK_TABS[k];
            const Icon = iconOf(t.icon);
            return (
              <li key={k}>
                <TabButton value={k} current={k === current}>
                  <span className="row-icon"><Icon size={18} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">
                      {t.label}
                      {k === def && <span className="font-normal text-muted"> · по роли</span>}
                    </span>
                    <span className="block text-[13px] text-muted">{t.hint}</span>
                  </span>
                </TabButton>
              </li>
            );
          })}
        </ul>
      </form>
    </SettingsPage>
  );
}
