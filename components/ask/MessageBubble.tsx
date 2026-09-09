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
        <div className="max-w-[75%] rounded-3xl rounded-br-lg bg-navy px-4 py-3 text-[14.5px] leading-relaxed text-white shadow-chunky-sm">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3">
      <Mascot state="happy" size="sm" className="mt-0.5" />
      <div className="min-w-0 max-w-[80%] rounded-3xl rounded-tl-lg border-2 border-navy/8 bg-white px-4 py-3.5 shadow-card">
        <p className="whitespace-pre-wrap text-[14.5px] leading-relaxed text-charcoal">
          {renderWithCitations(message.content)}
        </p>

        {message.provenance && message.provenance.length > 0 && (
          <div className="mt-3 rounded-2xl border border-navy/8 bg-offwhite px-3 py-2.5">
            <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-navy/45">
              Built from
            </p>
            {message.provenance.map((p, i) => (
              <p key={i} className="flex items-center gap-1.5 py-0.5 text-[12px] text-navy/70">
                <span className="font-medium">{p.source}</span>
                <span className="truncate text-navy/50">· {p.title}</span>
              </p>
            ))}
          </div>
        )}

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

function renderWithCitations(content: string) {
  const parts = content.split(/(\[cite:[^\]]+\])/g);
  return parts.map((part, i) => {
    const match = part.match(/^\[cite:([^\]]+)\]$/);
    if (!match) return <span key={i}>{part}</span>;
    return (
      <span
        key={i}
        className="mx-0.5 inline-flex items-center rounded-md bg-plum/10 px-1.5 py-0.5 align-middle text-[11px] font-medium text-plum"
      >
        {match[1]}
      </span>
    );
  });
}
