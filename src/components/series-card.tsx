import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, cn } from "@/components/ui";
import { ActionForm, Submit } from "@/components/action-form";
import { dateTime } from "@/lib/format";
import { cancelSeries } from "@/app/app/tasks/actions";

/** Блок повторяющейся серии на карточке задачи или съёмки. */
export async function SeriesCard({ entity, id, seriesId, from, canManage }: { entity: "task" | "shoot"; id: string; seriesId: string; from: string; canManage: boolean }) {
  const supabase = await createClient();
  const table = entity === "task" ? "tasks" : "shoots";
  const at = entity === "task" ? "due_at" : "starts_at";
  const [{ data: ser }, { data: items }] = await Promise.all([
    supabase.from("recurrence_series").select("summary").eq("id", seriesId).maybeSingle(),
    supabase.from(table).select(`id,status,${at}`).eq("series_id", seriesId).order(at).limit(100),
  ]);
  const list = (items ?? []) as unknown as ({ id: string; status: string } & Record<string, string>)[];
  const idx = list.findIndex((x) => x.id === id);
  const active = list.filter((x) => !["done", "cancelled"].includes(x.status)).length;
  const base = entity === "task" ? "/app/tasks" : "/app/shoots";
  return (
    <Card title="Повторяющаяся серия">
      <p className="text-sm"><b>{ser?.summary ?? "Серия"}</b></p>
      <p className="mt-1 text-xs text-muted">Это повтор {idx + 1} из {list.length} · активных: {active}</p>
      <ol className="mt-3 max-h-48 space-y-0.5 overflow-auto text-xs">
        {list.map((x, i) => (
          <li key={x.id}>
            <Link href={`${base}/${x.id}`} className={cn("flex justify-between rounded px-2 py-1 hover:bg-surface-2", x.id === id && "bg-surface-2 font-semibold", x.status === "cancelled" && "text-muted line-through")}>
              <span>{i + 1}. {dateTime(x[at])}</span>
              <span className="text-muted">{x.status === "done" ? "✓" : x.status === "cancelled" ? "отменено" : ""}</span>
            </Link>
          </li>
        ))}
      </ol>
      {canManage && active > 0 && (
        <ActionForm action={cancelSeries} confirm="Отменить этот и все следующие повторы серии?" className="mt-3 space-y-2 border-t border-line pt-3">
          <input type="hidden" name="series_id" value={seriesId} />
          <input type="hidden" name="from" value={from} />
          <input type="hidden" name="entity" value={entity} />
          <input type="hidden" name="id" value={id} />
          <input name="reason" required placeholder="Причина остановки серии *" className="input" />
          <Submit variant="danger" className="w-full">Отменить этот и следующие повторы</Submit>
        </ActionForm>
      )}
    </Card>
  );
}
