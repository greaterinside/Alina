import type { SourceConnector } from "@/lib/types";

/**
 * The connectors Sources should offer. `connected` is computed below from
 * real server-side credentials, per the brief's "only show connected once
 * a connector is genuinely wired up" — never hardcoded true. A connector
 * with no ingestion path yet (zoom/drive/whatsapp) has no entry in
 * CONNECTOR_ENV_VARS, so it's always false until one exists.
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

/** Every env var a connector's ingestion script needs — see scripts/ingest-*.mjs. */
const CONNECTOR_ENV_VARS: Partial<Record<string, string[]>> = {
  github: ["GITHUB_APP_ID", "GITHUB_APP_PRIVATE_KEY", "GITHUB_INSTALLATION_ID"],
  fathom: ["FATHOM_API_KEY"],
  notion: ["NOTION_API_KEY"],
  gmail: ["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN"],
};

export function getConnectors(): SourceConnector[] {
  return CONNECTORS.map((c) => {
    const requiredVars = CONNECTOR_ENV_VARS[c.id];
    return {
      ...c,
      // requiredVars undefined (no ingestion built yet) must NOT read as
      // "connected" — [].every(...) is vacuously true on an empty array,
      // which is exactly the bug that had zoom/drive/whatsapp showing
      // "Connected" with zero real integration behind them.
      connected: Boolean(requiredVars?.length) && (requiredVars ?? []).every((v) => Boolean(process.env[v])),
    };
  });
}
