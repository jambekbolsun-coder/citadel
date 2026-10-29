import { requireActive } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, Empty, Stat } from "@/components/ui";
import { SettingsPage } from "@/components/settings-list";
import { PAY_TYPE } from "@/lib/labels";
import { date, money } from "@/lib/format";

export const metadata = { title: "Мои выплаты" };

const KIND: Record<string, string> = { advance: "аванс", salary: "зарплата", bonus: "бонус", offset: "зачёт" };

export default async function MyPay() {
  const s = await requireActive();
  const supabase = await createClient();
  const [{ data: terms }, { data: accruals }, { data: pays }] = await Promise.all([
    supabase.from("salary_terms").select("id,pay_type,base_minor,pay_days,effective_from").eq("user_id", s.userId).order("effective_from", { ascending: false }),
    supabase.from("payroll_accruals").select("id,period_month,total_minor").eq("user_id", s.userId).eq("status", "approved").order("period_month", { ascending: false }),
    supabase.from("salary_payments").select("id,paid_on,kind,amount_minor").eq("user_id", s.userId).order("paid_on", { ascending: false }),
  ]);
  const t = (terms ?? []) as { id: string; pay_type: string; base_minor: number; pay_days: number[]; effective_from: string }[];
  const a = (accruals ?? []) as { id: string; period_month: string; total_minor: number }[];
  const p = (pays ?? []) as { id: string; paid_on: string; kind: string; amount_minor: number }[];
  const accrued = a.reduce((x, r) => x + Number(r.total_minor), 0);
  const paid = p.reduce((x, r) => x + Number(r.amount_minor), 0);
  if (!t.length && !a.length && !p.length)
    return <SettingsPage title="Мои выплаты"><Empty title="Условия оплаты не заданы" text="Когда руководитель внесёт условия, здесь появятся начисления и выплаты." /></SettingsPage>;
  return (
    <SettingsPage title="Мои выплаты" subtitle="Только утверждённые начисления и зарегистрированные выплаты">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Начислено" value={money(accrued)} />
          <Stat label="Выплачено" value={money(paid)} />
          <div className="col-span-2"><Stat label="К выплате" value={money(Math.max(0, accrued - paid))} tone={accrued > paid ? "warn" : undefined} /></div>
        </div>
        {t.length > 0 && (
          <Card title="Условия">
            <ul className="space-y-1 text-sm">{t.map((x) => <li key={x.id}>с {date(x.effective_from)}: {PAY_TYPE[x.pay_type]}, оклад {money(x.base_minor)}, выплаты {x.pay_days.join(" и ")}-го</li>)}</ul>
          </Card>
        )}
        <Card title="История">
          <ul className="divide-y divide-line text-sm">
            {a.map((x) => <li key={x.id} className="flex justify-between gap-2 py-2"><span>Начислено за {x.period_month.slice(0, 7)}</span><b>{money(x.total_minor)}</b></li>)}
            {p.map((x) => <li key={x.id} className="flex justify-between gap-2 py-2"><span>{date(x.paid_on)} — {KIND[x.kind] ?? x.kind}</span><b>{money(x.amount_minor)}</b></li>)}
          </ul>
        </Card>
      </div>
    </SettingsPage>
  );
}
