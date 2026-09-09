"use client";

import { useState } from "react";
import { Copy, Check, RotateCcw } from "lucide-react";
import type { ChatMessage } from "@/lib/types";

export function TypingAnswer({
  prompt,
  answer,
  onRegenerate,
}: {
  prompt: ChatMessage;
  answer: ChatMessage;
  onRegenerate: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(answer.content.replace(/\[cite:[^\]]+\]/g, ""));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard permission denied — no-op
    }
  }

  return (
    <div className="card-chunky p-5">
      <p className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-navy/40">
        {prompt.content}
      </p>
      <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-charcoal">
        {answer.content.replace(/\[cite:[^\]]+\]/g, "").trim()}
      </p>

      {answer.provenance && answer.provenance.length > 0 && (
        <div className="mt-4 rounded-2xl border border-navy/8 bg-offwhite px-3 py-2.5">
          <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-navy/45">
            Built from
          </p>
          {answer.provenance.map((p, i) => (
            <p key={i} className="py-0.5 text-[12px] text-navy/70">
              <span className="font-medium">{p.source}</span>{" "}
              <span className="text-navy/50">· {p.title}</span>
            </p>
          ))}
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <button
          onClick={copy}
          className="inline-flex items-center gap-1.5 rounded-xl border border-navy/10 px-3 py-1.5 text-[12.5px] font-semibold text-navy/70 transition-colors hover:border-navy/25 hover:text-navy"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? "Copied" : "Copy"}
        </button>
        <button
          onClick={onRegenerate}
          className="inline-flex items-center gap-1.5 rounded-xl border border-navy/10 px-3 py-1.5 text-[12.5px] font-semibold text-navy/70 transition-colors hover:border-navy/25 hover:text-navy"
        >
          <RotateCcw size={13} />
          Try again
        </button>
      </div>
    </div>
  );
}
