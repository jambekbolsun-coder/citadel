"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useActionState, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { CalendarClock, LoaderCircle, X } from "lucide-react";
import { btn, cn } from "@/components/ui";
import { moveCalendarItem } from "./actions";

const MIME = "application/x-citadel-event";
export const MOVABLE = new Set(["task", "shoot", "content", "publish"]);
type Drag = { kind: string; id: string; day: string; title: string };
type Ctx = { enabled: boolean; dragging: Drag | null; setDragging: (d: Drag | null) => void; request: (d: Drag, target?: string) => void };
const DndCtx = createContext<Ctx | null>(null);

/** Обёртка календаря: перенос перетаскиванием (десктоп) и кнопкой «Перенести» (телефон) через один диалог. */
export function CalendarDnd({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [dragging, setDragging] = useState<Drag | null>(null);
  const [req, setReq] = useState<{ d: Drag; target: string; n: number } | null>(null);
  const request = (d: Drag, target?: string) => setReq((r) => ({ d, target: target ?? d.day, n: (r?.n ?? 0) + 1 }));
  return (
    <DndCtx.Provider value={{ enabled, dragging, setDragging, request }}>
      {enabled && <p className="mb-2 hidden text-xs text-muted md:block">Перетащите задачу, съёмку или срок материала на другой день — время сохранится, перенос попадёт в историю.</p>}
      {children}
      {req && <MoveDialog key={req.n} item={req.d} target={req.target} onClose={() => setReq(null)} />}
    </DndCtx.Provider>
  );
}

function MoveDialog({ item, target, onClose }: { item: Drag; target: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [state, act, pending] = useActionState(moveCalendarItem, null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  useEffect(() => {
    if (state?.ok) {
      router.refresh();
      const t = setTimeout(() => ref.current?.close(), 900);
      return () => clearTimeout(t);
    }
  }, [state, router]);
  return (
    <dialog ref={ref} className="sheet" aria-labelledby="move-title" onClose={onClose} onClick={(e) => e.target === ref.current && ref.current?.close()}>
      <div className="sheet-panel">
        <div className="sheet-grip" aria-hidden />
        <div className="mb-3 flex items-center gap-2">
          <CalendarClock size={20} className="text-brand" />
          <h2 id="move-title" className="flex-1 text-lg font-semibold">Перенести</h2>
          <button type="button" className="tap -mr-2 text-muted" onClick={() => ref.current?.close()} aria-label="Закрыть"><X size={22} /></button>
        </div>
        <p className="mb-3 text-sm [overflow-wrap:anywhere]">{item.title}</p>
        {state?.ok ? (
          <p role="status" className="rounded-xl bg-good-soft px-3 py-2 text-sm text-good">{state.ok}</p>
        ) : (
          <form action={act} className="space-y-3">
            <input type="hidden" name="kind" value={item.kind} />
            <input type="hidden" name="id" value={item.id} />
            <label className="block">
              <span className="label">Новая дата (время суток сохранится)</span>
              <input name="day" type="date" required defaultValue={target} className="input" />
            </label>
            <label className="block">
              <span className="label">Причина переноса *</span>
              <input name="reason" required autoFocus className="input" placeholder="Например: клиент перенёс съёмку" />
            </label>
            {item.kind === "shoot" && <p className="text-xs text-muted">Участники получат уведомление и должны будут подтвердить участие заново.</p>}
            {state?.error && <p role="alert" className="rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">{state.error}</p>}
            <button type="submit" disabled={pending} className={btn("brand", "w-full")}>
              {pending && <LoaderCircle size={18} className="animate-spin" />} {pending ? "Переносим…" : "Перенести"}
            </button>
          </form>
        )}
      </div>
    </dialog>
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
        const d = ctx.dragging;
        ctx.setDragging(null);
        if (d && d.day !== day) ctx.request(d, day);
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

/** Кнопка переноса для сенсорных экранов. */
export function MoveButton({ kind, id, day, title }: Drag) {
  const ctx = useContext(DndCtx);
  if (!ctx?.enabled || !MOVABLE.has(kind) || !id) return null;
  return (
    <button type="button" onClick={() => ctx.request({ kind, id, day, title })} className="tap shrink-0 text-muted" aria-label={`Перенести: ${title}`}>
      <CalendarClock size={18} />
    </button>
  );
}
