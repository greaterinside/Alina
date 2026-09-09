import type { SourceConnector } from "@/lib/types";

/**
 * The connectors Sources should offer. None are marked connected here —
 * per the brief, only show "connected" once a connector is genuinely
 * wired up (a real OAuth grant stored server-side), never as placeholder
 * data. When a connector's integration ships, flip its `connected` check
 * to read real state (e.g. a row in a `connections` table) instead of
 * the hardcoded `false` below.
 */
export const CONNECTORS: Omit<SourceConnector, "connected">[] = [
  { id: "github", name: "GitHub", description: "READMEs, architecture decisions, merged PR descriptions." },
  { id: "notion", name: "Notion", description: "Project pages, client pages, SOPs — synced as they're edited." },
  { id: "zoom", name: "Zoom", description: "Cloud recordings and transcripts, pulled after processing." },
  { id: "fathom", name: "Fathom", description: "Call recordings, transcribed and speaker-tagged." },
  { id: "gmail", name: "Gmail", description: "Client threads, turned into searchable support history." },
  { id: "drive", name: "Google Drive", description: "Proposals, decks, and content calendars, read as text." },
  { id: "whatsapp", name: "WhatsApp Business", description: "Client chats and voice notes, transcribed." },
];

export function getConnectors(): SourceConnector[] {
  return CONNECTORS.map((c) => ({ ...c, connected: false }));
}
