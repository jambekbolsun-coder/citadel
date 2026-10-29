import { requireActive } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, Empty, Stat } from "@/components/ui";
import { SettingsPage } from "@/components/settings-list";
import { PAY_TYPE } from "@/lib/labels";
import { date, money, moneyMulti } from "@/lib/format";

export const metadata = { title: "Мои выплаты" };

const KIND: Record<string, string> = { advance: "аванс", salary: "зарплата", bonus: "бонус", offset: "зачёт" };

export default async function MyPay() {
  const s = await requireActive();
  const supabase = await createClient();
  const [{ data: terms }, { data: accruals }, { data: pays }] = await Promise.all([
    supabase.from("salary_terms").select("id,pay_type,base_minor,pay_days,effective_from,currency").eq("user_id", s.userId).order("effective_from", { ascending: false }),
    supabase.from("payroll_accruals").select("id,period_month,total_minor,currency").eq("user_id", s.userId).eq("status", "approved").order("period_month", { ascending: false }),
    supabase.from("salary_payments").select("id,paid_on,kind,amount_minor,currency").eq("user_id", s.userId).order("paid_on", { ascending: false }),
  ]);
  const t = (terms ?? []) as { id: string; pay_type: string; base_minor: number; pay_days: number[]; effective_from: string; currency: string }[];
  const a = (accruals ?? []) as { id: string; period_month: string; total_minor: number; currency: string }[];
  const p = (pays ?? []) as { id: string; paid_on: string; kind: string; amount_minor: number; currency: string }[];
  // по валютам раздельно; корректировки к утверждённым начислениям видны в истории у бухгалтера
  const accrued: Record<string, number> = {};
  const paid: Record<string, number> = {};
  for (const r of a) accrued[r.currency] = (accrued[r.currency] ?? 0) + Number(r.total_minor);
  for (const r of p) paid[r.currency] = (paid[r.currency] ?? 0) + Number(r.amount_minor);
  const left: Record<string, number> = {};
  for (const c of new Set([...Object.keys(accrued), ...Object.keys(paid)])) if ((accrued[c] ?? 0) > (paid[c] ?? 0)) left[c] = (accrued[c] ?? 0) - (paid[c] ?? 0);
  if (!t.length && !a.length && !p.length)
    return <SettingsPage title="Мои выплаты"><Empty title="Условия оплаты не заданы" text="Когда руководитель внесёт условия, здесь появятся начисления и выплаты." /></SettingsPage>;
  return (
    <SettingsPage title="Мои выплаты" subtitle="Только утверждённые начисления и зарегистрированные выплаты">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Начислено" value={<span className="block break-words text-xl">{moneyMulti(accrued, "0")}</span>} />
          <Stat label="Выплачено" value={<span className="block break-words text-xl">{moneyMulti(paid, "0")}</span>} />
          <div className="col-span-2"><Stat label="К выплате" value={<span className="block break-words text-xl">{moneyMulti(left, "0")}</span>} tone={Object.keys(left).length ? "warn" : undefined} hint="без учёта корректировок к начислениям" /></div>
        </div>
        {t.length > 0 && (
          <Card title="Условия">
            <ul className="space-y-1 text-sm">{t.map((x) => <li key={x.id}>с {date(x.effective_from)}: {PAY_TYPE[x.pay_type]}, оклад {money(x.base_minor, x.currency)}, выплаты {x.pay_days.join(" и ")}-го</li>)}</ul>
          </Card>
        )}
        <Card title="История">
          <ul className="divide-y divide-line text-sm">
            {a.map((x) => <li key={x.id} className="flex justify-between gap-2 py-2"><span>Начислено за {x.period_month.slice(0, 7)}</span><b>{money(x.total_minor, x.currency)}</b></li>)}
            {p.map((x) => <li key={x.id} className="flex justify-between gap-2 py-2"><span>{date(x.paid_on)} — {KIND[x.kind] ?? x.kind}</span><b>{money(x.amount_minor, x.currency)}</b></li>)}
          </ul>
        </Card>
      </div>
    </SettingsPage>
  );
}
