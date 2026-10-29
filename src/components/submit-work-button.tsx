"use client";
import { Send } from "lucide-react";
import { btn } from "@/components/ui";
import { openPlus } from "@/components/shell";

export function SubmitWorkButton({ className }: { className?: string }) {
  return (
    <button type="button" onClick={() => openPlus("submit")} aria-haspopup="dialog" className={btn("brand", className)}>
      <Send size={17} /> Сдать работу
    </button>
  );
}
