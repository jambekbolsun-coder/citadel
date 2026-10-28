"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useContext, useState, useTransition, type ReactNode } from "react";
import { cn } from "@/components/ui";
import { moveCalendarItem } from "./actions";

const MIME = "application/x-citadel-event";
const MOVABLE = new Set(["task", "shoot", "content", "publish"]);
type Drag = { kind: string; id: string; day: string; title: string };
type Ctx = { enabled: boolean; dragging: Drag | null; setDragging: (d: Drag | null) => void; drop: (day: string) => void; pending: boolean };
const DndCtx = createContext<Ctx | null>(null);

/** Обёртка календаря: включает перенос перетаскиванием и показывает результат. */
export function CalendarDnd({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const router = useRouter();
  const [dragging, setDragging] = useState<Drag | null>(null);
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();

  function drop(day: string) {
    const d = dragging;
    setDragging(null);
    if (!d || d.day === day) return;
    const label = day.split("-").reverse().join(".");
    const note = d.kind === "shoot" ? "\n\nУчастники получат уведомление и должны будут подтвердить участие заново." : "";
    const reason = window.prompt(`Перенести «${d.title}» на ${label}?${note}\n\nПричина переноса:`, "Перенос в календаре");
    if (reason === null) return;
    if (!reason.trim()) return setMsg({ error: "Причина переноса обязательна" });
    const fd = new FormData();
    fd.set("kind", d.kind);
    fd.set("id", d.id);
    fd.set("day", day);
    fd.set("reason", reason.trim());
    start(async () => {
      const r = await moveCalendarItem(null, fd);
      setMsg(r ?? null);
      if (r?.ok) router.refresh();
    });
  }

  return (
    <DndCtx.Provider value={{ enabled, dragging, setDragging, drop, pending }}>
      {enabled && <p className="mb-2 hidden text-xs text-muted md:block">Перетащите задачу, съёмку или срок материала на другой день — время сохранится, перенос попадёт в историю.</p>}
      {children}
      {(msg || pending) && (
        <div role="status" className={cn("fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-xl px-4 py-2 text-sm shadow-lg ring-1 md:bottom-6", msg?.error ? "bg-bad-soft text-bad ring-bad/30" : "bg-surface text-ink ring-line")}>
          {pending ? "Переносим…" : msg?.error ?? msg?.ok}
          {!pending && <button type="button" onClick={() => setMsg(null)} className="ml-3 text-muted" aria-label="Закрыть">×</button>}
        </div>
      )}
    </DndCtx.Provider>
  );
}

export function DropDay({ day, className, children }: { day: string; className?: string; children: ReactNode }) {
  const ctx = useContext(DndCtx);
  const [over, setOver] = useState(false);
  if (!ctx?.enabled) return <div className={className}>{children}</div>;
  return (
    <div
      className={cn(className, over && ctx.dragging && ctx.dragging.day !== day && "bg-primary/10 ring-2 ring-inset ring-primary")}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(MIME)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (!over) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        ctx.drop(day);
      }}
    >
      {children}
    </div>
  );
}

export function DragItem({ kind, id, day, title, href, className, children }: { kind: string; id: string; day: string; title: string; href: string; className?: string; children: ReactNode }) {
  const ctx = useContext(DndCtx);
  const movable = !!ctx?.enabled && MOVABLE.has(kind);
  return (
    <Link
      href={href}
      title={movable ? `${title} — можно перетащить на другой день` : title}
      draggable={movable}
      onDragStart={movable ? (e) => {
        e.dataTransfer.setData(MIME, id);
        e.dataTransfer.effectAllowed = "move";
        ctx!.setDragging({ kind, id, day, title });
      } : undefined}
      onDragEnd={movable ? () => ctx!.setDragging(null) : undefined}
      className={cn(className, movable && "cursor-grab active:cursor-grabbing", ctx?.dragging?.id === id && ctx.dragging.kind === kind && "opacity-50")}
    >
      {children}
    </Link>
  );
}
