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
        <div className="max-w-[75%] rounded-3xl rounded-br-lg border border-white/20 bg-white/15 px-4 py-3 text-[14.5px] leading-relaxed text-white shadow-lg backdrop-blur-xl">
          {message.content}
        </div>
      </div>
    );
  }

  // No per-message avatar — the particle field behind everything already
  // is "her" presence; running a second particle sim per message (a
  // thread can hold dozens) would be wasteful. A plain identity line does
  // the same job the reference's message header did.
  return (
    <div className="flex flex-col gap-1.5">
      <p className="pl-1 text-[12px] font-semibold text-white/55">Alina</p>
      <div className="glass-panel min-w-0 max-w-[80%] px-4 py-3.5 shadow-lg">
        <MarkdownAnswer content={message.content} dark className="text-[14.5px] text-white/90" />

        {message.report && onPreviewReport && (
          <ReportCard report={message.report} onPreview={() => onPreviewReport(message.report!)} />
        )}

        {onSpeak && (
          <button
            onClick={() => onSpeak(message.content)}
            className="mt-2.5 inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-cyan-300 hover:text-cyan-200"
          >
            <Volume2 size={13} />
            Hear this
          </button>
        )}
      </div>
    </div>
  );
}
