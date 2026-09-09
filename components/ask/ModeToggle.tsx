"use client";

import clsx from "clsx";
import { MessagesSquare, Keyboard } from "lucide-react";
import type { AskMode } from "@/lib/types";

const OPTIONS: { id: AskMode; label: string; icon: typeof MessagesSquare }[] = [
  { id: "chat", label: "Chat", icon: MessagesSquare },
  { id: "typing", label: "Typing", icon: Keyboard },
];

export function ModeToggle({
  mode,
  onChange,
}: {
  mode: AskMode;
  onChange: (mode: AskMode) => void;
}) {
  return (
    <div className="flex flex-none items-center gap-0.5 rounded-full border border-navy/10 bg-white p-1">
      {OPTIONS.map(({ id, label, icon: Icon }) => {
        const isActive = mode === id;
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            className={clsx(
              "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition-all duration-150",
              isActive ? "bg-navy text-white" : "text-navy/50 hover:text-navy"
            )}
          >
            <Icon size={14} />
            {label}
          </button>
        );
      })}
    </div>
  );
}
