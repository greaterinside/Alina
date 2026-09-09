import type { WorkspaceId } from "@/lib/types";

/**
 * Starter prompts shown as chips. Chat-mode chips are exploratory
 * questions; typing-mode chips lean toward the drafting tasks from the
 * founder's voice note (e.g. support drafting a reply in-tone from a
 * Stripe sale lookup).
 */
export const SUGGESTED_PROMPTS: Record<WorkspaceId, { chat: string[]; typing: string[] }> = {
  assistant: {
    chat: ["What's waiting on me today?", "Catch me up on this week", "What did we promise, and to whom?"],
    typing: ["Summarize everything on this client", "Turn these notes into a clean recap"],
  },
  tech: {
    chat: ["Why did we make this call?", "What shipped this week?", "Explain this error to me"],
    typing: ["Draft release notes for this PR", "Write an architecture summary for this decision"],
  },
  social: {
    chat: ["What's worth turning into content this week?", "What performed best last quarter?"],
    typing: ["Draft a caption from this call", "Turn this insight into a carousel outline"],
  },
  support: {
    chat: ["What do I tell a client asking about X?", "What can I refund without asking?"],
    typing: ["Draft a reply to this client email", "Write a follow-up after today's call"],
  },
};
