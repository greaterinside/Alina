"use client";

import { Volume2 } from "lucide-react";
import { MarkdownAnswer } from "@/components/ask/MarkdownAnswer";
import { ReportCard } from "@/components/ask/ReportCard";
import type { ChatMessage, ReportDoc } from "@/lib/types";

export function MessageBubble({
  message,
  onSpeak,
  onPreviewReport,
}: {
  message: ChatMessage;
  onSpeak?: (text: string) => void;
  onPreviewReport?: (report: ReportDoc) => void;
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

  // No per-message avatar — the one live presence near the composer
  // already stands in for "her," and running a particle simulation per
  // message (a thread can hold dozens) would be wasteful. A plain
  // identity line does the same job the reference's message header did.
  return (
    <div className="flex flex-col gap-1.5">
      <p className="pl-1 text-[12px] font-semibold text-navy/60">Alina</p>
      <div className="min-w-0 max-w-[80%] rounded-3xl rounded-tl-lg border border-navy/[0.07] bg-white px-4 py-3.5 shadow-card">
        <MarkdownAnswer content={message.content} className="text-[14.5px] text-charcoal" />

        {message.report && onPreviewReport && (
          <ReportCard report={message.report} onPreview={() => onPreviewReport(message.report!)} />
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
