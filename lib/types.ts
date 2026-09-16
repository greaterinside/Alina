/**
 * Shared domain types for Alina.
 *
 * These mirror the data model described by the founder: a shared "master"
 * knowledge base (per workspace, in Supabase) plus a role that gates the
 * admin screens, plus a thin personalization layer per team member.
 */

/**
 * Matches public.roles' real check constraint, discovered live (see
 * supabase/migrations/0001_roles_and_prompts.sql's note) — NOT the
 * generic admin/senior/member hierarchy this rebuild originally assumed
 * before checking. "admin" has full control; "ai engineer" is the
 * technical/builder role (sees admin screens, same as old "senior");
 * "content" is a regular team member (Ask only, same as old "member").
 */
export type Role = "admin" | "ai engineer" | "content";

/** The four knowledge workspaces. Assistant is the cross-cutting one. */
export type WorkspaceId = "assistant" | "tech" | "social" | "support";

export interface WorkspaceMeta {
  id: WorkspaceId;
  name: string;
  tagline: string;
  /** Default tone shown next to the composer — admins can retune this later. */
  toneHint: string;
}

export const WORKSPACES: Record<WorkspaceId, WorkspaceMeta> = {
  assistant: {
    id: "assistant",
    name: "Assistant",
    tagline: "Searches everything, all at once",
    toneHint: "Clear & direct",
  },
  tech: {
    id: "tech",
    name: "Tech",
    tagline: "Code, architecture, technical calls",
    toneHint: "Precise & technical",
  },
  social: {
    id: "social",
    name: "Social",
    tagline: "Content, campaigns, call insights",
    toneHint: "Punchy & upbeat",
  },
  support: {
    id: "support",
    name: "Support",
    tagline: "Product, tickets, client history",
    toneHint: "Warm & reassuring",
  },
};

export const WORKSPACE_ORDER: WorkspaceId[] = ["assistant", "tech", "social", "support"];

/** Sections gated to admin/ai-engineer roles. Ask is deliberately not in this list. */
export const ADMIN_SECTIONS = ["sources", "routing", "team"] as const;
export type AdminSection = (typeof ADMIN_SECTIONS)[number];

export function canSeeAdminSections(role: Role): boolean {
  return role === "admin" || role === "ai engineer";
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: Role;
  workspaces: WorkspaceId[];
  avatarInitials: string;
}

/** A connector shown on the Sources screen. Only ever "connected" if it truly is. */
export interface SourceConnector {
  id: string;
  name: string;
  connected: boolean;
  description: string;
}

export type AskMode = "chat" | "typing" | "report";

export interface Citation {
  label: string;
  sourceId?: string;
}

export interface ProvenanceItem {
  source: string;
  title: string;
  meta: string;
}

/** A generated report — the chat message carries just the short summary; the full doc lives here. */
export interface ReportDoc {
  title: string;
  markdown: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  provenance?: ProvenanceItem[];
  report?: ReportDoc;
  createdAt: string;
}

/** The tone/prompt profile that shapes how Alina writes in a given workspace. */
export interface WorkspaceTone {
  workspace: WorkspaceId;
  label: string;
  description: string;
}
