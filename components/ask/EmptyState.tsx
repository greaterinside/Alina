"use client";

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
    <div className="flex h-full flex-col items-center justify-center gap-7 px-6 text-center">
      <div className="max-w-lg">
        <p className="text-[30px] font-bold leading-[1.15] tracking-tight text-white sm:text-[36px]">
          {GREETINGS[workspace]}
        </p>
        <p className="mx-auto mt-3 max-w-sm text-[14px] leading-relaxed text-white/55">
          {WORKSPACES[workspace].tagline} — ask in your own words, no need to get it exactly right.
        </p>
      </div>
      <div className="flex max-w-lg flex-wrap justify-center gap-2">
        {chips.map((chip) => (
          <button
            key={chip}
            onClick={() => onPick(chip)}
            className="glass-pill px-4 py-2 text-[13px] font-medium text-white/75 transition-all duration-150 hover:-translate-y-0.5 hover:border-white/30 hover:text-white active:translate-y-0"
          >
            {chip}
          </button>
        ))}
      </div>
    </div>
  );
}
