"use client";

import { Volume2 } from "lucide-react";
import { Mascot } from "@/components/mascot/Mascot";
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

  return (
    <div className="flex items-start gap-3">
      <Mascot state="happy" size="sm" className="mt-0.5" />
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
