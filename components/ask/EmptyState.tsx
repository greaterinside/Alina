"use client";

import { Mascot } from "@/components/mascot/Mascot";
import type { AskMode, WorkspaceId } from "@/lib/types";
import { WORKSPACES } from "@/lib/types";
import { SUGGESTED_PROMPTS } from "@/lib/prompts";

const GREETINGS: Record<WorkspaceId, string> = {
  assistant: "Hey! I've read everything so you don't have to. What do you need?",
  tech: "Ready when you are — code, calls, decisions, all of it.",
  social: "Let's find something worth making today.",
  support: "Tell me what the client asked — I probably already know.",
};

export function EmptyState({
  workspace,
  mode,
  onPick,
}: {
  workspace: WorkspaceId;
  mode: AskMode;
  onPick: (text: string) => void;
}) {
  const chips = SUGGESTED_PROMPTS[workspace][mode];

  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-6 text-center">
      <Mascot state="idle" size="xl" />
      <div className="max-w-md">
        <p className="text-[19px] font-semibold leading-snug text-navy">{GREETINGS[workspace]}</p>
        <p className="mt-1.5 text-[13px] text-charcoal/55">
          {WORKSPACES[workspace].tagline} — ask in your own words, no need to get it exactly right.
        </p>
      </div>
      <div className="flex max-w-lg flex-wrap justify-center gap-2">
        {chips.map((chip) => (
          <button
            key={chip}
            onClick={() => onPick(chip)}
            className="rounded-full border-2 border-navy/10 bg-white px-4 py-2 text-[13px] font-medium text-navy/75 shadow-card transition-all duration-150 hover:-translate-y-0.5 hover:border-terracotta/40 hover:text-navy active:translate-y-0"
          >
            {chip}
          </button>
        ))}
      </div>
    </div>
  );
}
