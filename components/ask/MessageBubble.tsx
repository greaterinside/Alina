"use client";

import { Volume2 } from "lucide-react";
import { Mascot } from "@/components/mascot/Mascot";
import type { ChatMessage } from "@/lib/types";

export function MessageBubble({
  message,
  onSpeak,
}: {
  message: ChatMessage;
  onSpeak?: (text: string) => void;
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] rounded-3xl rounded-br-lg bg-navy px-4 py-3 text-[14.5px] leading-relaxed text-white shadow-soft">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3">
      <Mascot state="happy" size="sm" className="mt-0.5" />
      <div className="min-w-0 max-w-[80%] rounded-3xl rounded-tl-lg border border-navy/[0.07] bg-white px-4 py-3.5 shadow-card">
        <p className="whitespace-pre-wrap text-[14.5px] leading-relaxed text-charcoal">
          {message.content}
        </p>

        {onSpeak && (
          <button
            onClick={() => onSpeak(message.content)}
            className="mt-2.5 inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-plum hover:text-plum/80"
          >
            <Volume2 size={13} />
            Hear this
          </button>
        )}
      </div>
    </div>
  );
}
