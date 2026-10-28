import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Экспорт CSV по правам пользователя: RLS ограничивает строки так же, как в интерфейсе
function csv(rows: (string | number | null)[][]) {
  return "﻿" + rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return new NextResponse("Unauthorized", { status: 401 });
  const sp = req.nextUrl.searchParams;
  const type = sp.get("type");
  const from = sp.get("from") ?? "1970-01-01";
  const to = sp.get("to") ?? "2999-12-31";
  let body = "";
  if (type === "ledger") {
    const { data, error } = await supabase.from("money_transactions").select("occurred_on,direction,amount_minor,currency,source_type,description,financial_accounts(name)").gte("occurred_on", from).lte("occurred_on", to).order("occurred_on");
    if (error) return new NextResponse("Forbidden", { status: 403 });
    body = csv([["Дата", "Счёт", "Направление", "Сумма", "Валюта", "Тип", "Описание"], ...((data ?? []) as unknown as { occurred_on: string; direction: string; amount_minor: number; currency: string; source_type: string; description: string; financial_accounts: { name: string } }[]).map((t) => [t.occurred_on, t.financial_accounts?.name, t.direction === "in" ? "приход" : "расход", (t.amount_minor / 100).toFixed(2), t.currency, t.source_type, t.description])]);
  } else if (type === "expenses") {
    const { data, error } = await supabase.from("expenses").select("purchased_on,amount_minor,currency,description,vendor,status,expense_categories(name),projects(name)").gte("purchased_on", from).lte("purchased_on", to).order("purchased_on");
    if (error) return new NextResponse("Forbidden", { status: 403 });
    body = csv([["Дата", "Сумма", "Валюта", "Описание", "Контрагент", "Категория", "Проект", "Статус"], ...((data ?? []) as unknown as { purchased_on: string; amount_minor: number; currency: string; description: string; vendor: string; status: string; expense_categories: { name: string }; projects: { name: string } | null }[]).map((e) => [e.purchased_on, (e.amount_minor / 100).toFixed(2), e.currency, e.description, e.vendor, e.expense_categories?.name, e.projects?.name ?? "", e.status])]);
  } else if (type === "planfact") {
    const [{ data, error }, { data: periods }] = await Promise.all([
      supabase.from("v_period_progress").select("period_id,kind,planned,prepared,published,verified,left_to_prepare,left_to_publish,overflow"),
      supabase.from("project_periods").select("id,label,projects(name)"),
    ]);
    if (error) return new NextResponse("Forbidden", { status: 403 });
    const per = new Map(((periods ?? []) as unknown as { id: string; label: string; projects: { name: string } | null }[]).map((p) => [p.id, p]));
    body = csv([["Проект", "Период", "Вид", "План", "Подготовлено", "Опубликовано", "Проверено", "Осталось подготовить", "Осталось опубликовать", "Сверх плана"], ...((data ?? []) as { period_id: string; kind: string; planned: number; prepared: number; published: number; verified: number; left_to_prepare: number; left_to_publish: number; overflow: number }[]).filter((r) => per.has(r.period_id)).map((r) => [per.get(r.period_id)?.projects?.name ?? "", per.get(r.period_id)?.label ?? "", r.kind, r.planned, r.prepared, r.published, r.verified, r.left_to_prepare, r.left_to_publish, r.overflow])]);
  } else return new NextResponse("Unknown export", { status: 400 });
  await supabase.from("export_history").insert({ user_id: u.user.id, kind: type, params: { from, to } });
  return new NextResponse(body, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="citadel-${type}-${from}_${to}.csv"`, "Cache-Control": "private, no-store" },
  });
}
