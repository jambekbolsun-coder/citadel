import { requireActive } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";

export const metadata = { title: "Скорость приложения" };

// Пороги «хорошо» по web.dev; для переходов — цель ТЗ: каркас ≤ 100 мс, данные ≤ 500 мс
const GOOD: Record<string, number> = { TTFB: 800, FCP: 1800, LCP: 2500, INP: 200, CLS: 0.1, "route-shell": 100, "route-ready": 500 };
const LABEL: Record<string, string> = { "route-shell": "Переход: каркас", "route-ready": "Переход: данные", TTFB: "TTFB", FCP: "FCP", LCP: "LCP", INP: "INP", CLS: "CLS" };
const ORDER = ["route-ready", "route-shell", "TTFB", "FCP", "LCP", "INP", "CLS"];

type Row = { route: string; name: string; n: number; p75: number; poor_share: number };

function fmt(name: string, v: number) {
  return name === "CLS" ? v.toFixed(3) : `${Math.round(v)} мс`;
}

export default async function Speed() {
  await requireActive("reports.view");
  const supabase = await createClient();
  const { data } = await supabase.rpc("web_vitals_summary", { p_days: 30 });
  const all = ((data ?? []) as Row[]).map((r) => ({ ...r, n: Number(r.n) }));
  const rows = all.filter((r) => r.route !== "*");
  const total = (route: string) => rows.filter((x) => x.route === route).reduce((s, x) => s + x.n, 0);
  const routes = [...new Set(rows.map((r) => r.route))].sort((a, b) => total(b) - total(a));
  const overall = ORDER.map((name) => all.find((r) => r.route === "*" && r.name === name)).filter((r): r is Row => !!r);
  return (
    <>
      <PageHeader title="Скорость приложения" subtitle="Реальные замеры с устройств сотрудников за 30 дней, 75-й перцентиль. Обезличено: без людей, записей и параметров адреса." back="/app/reports" />
      {!rows.length ? (
        <Empty title="Замеров пока нет" text="Они появятся, как только сотрудники начнут открывать экраны в новой версии." />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {overall.map((o) => (
              <div key={o.name} className="rounded-2xl border border-line bg-surface p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted">{LABEL[o.name]}</div>
                <div className={o.p75 <= GOOD[o.name] ? "mt-1 font-display text-2xl font-semibold text-good" : "mt-1 font-display text-2xl font-semibold text-warn"}>{fmt(o.name, o.p75)}</div>
                <div className="mt-1 text-xs text-muted">замеров: {o.n} · цель ≤ {fmt(o.name, GOOD[o.name])}</div>
              </div>
            ))}
          </div>
          {routes.map((route) => (
            <Card key={route} title={<span className="font-mono text-sm">{route}</span>}>
              <ul className="divide-y divide-line text-sm">
                {ORDER.map((name) => rows.find((r) => r.route === route && r.name === name)).filter((r): r is Row & { n: number } => !!r).map((r) => (
                  <li key={r.name} className="flex items-center justify-between gap-3 py-2">
                    <span>{LABEL[r.name]} <span className="text-xs text-muted">· {r.n}</span></span>
                    <Badge tone={r.p75 <= GOOD[r.name] ? "good" : r.poor_share > 0.25 ? "bad" : "warn"}>{fmt(r.name, r.p75)}</Badge>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
