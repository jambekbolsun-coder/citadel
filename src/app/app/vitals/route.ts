import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { routeTemplate, vitalsBatch } from "@/lib/vitals";

export const dynamic = "force-dynamic";

// Приём обезличенных замеров. Сессия нужна только для RLS (пишет активный сотрудник); id пользователя не сохраняется.
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = JSON.parse(await req.text());
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const parsed = vitalsBatch.safeParse(body);
  if (!parsed.success) return new NextResponse(null, { status: 400 });
  const rows = parsed.data.map((v) => ({
    name: v.name,
    value: Math.round(v.value * 1000) / 1000,
    rating: v.rating ?? null,
    route: routeTemplate(v.route),
    nav: v.nav ?? null,
    standalone: v.standalone ?? false,
    width: v.width ?? null,
    conn: v.conn ?? null,
  }));
  const supabase = await createClient();
  const { error } = await supabase.from("web_vitals").insert(rows);
  return new NextResponse(null, { status: error ? 403 : 204 });
}
