import { createHmac, timingSafeEqual } from "node:crypto";
import { embedQuery } from "@/lib/rag";

/**
 * Fathom's webhook signing follows the Svix convention (confirmed via
 * their docs' own header names — webhook-id/webhook-timestamp/
 * webhook-signature — which are Svix's, not a bespoke scheme): HMAC-SHA256
 * over "{id}.{timestamp}.{raw body}", keyed by the base64 payload after
 * the secret's "whsec_" prefix, compared against each "v1,<sig>" entry in
 * webhook-signature (space-delimited — multiple entries support secret
 * rotation), plus a timestamp window to reject replayed deliveries.
 *
 * Deliberately takes the RAW body string, not a parsed object — the
 * signature is computed over the exact bytes Fathom sent; re-serializing
 * parsed JSON can produce a different byte string (key order, spacing)
 * and silently break verification.
 */
export function verifyFathomSignature(opts: {
  rawBody: string;
  webhookId: string | null;
  webhookTimestamp: string | null;
  webhookSignature: string | null;
  secret: string;
}): boolean {
  const { rawBody, webhookId, webhookTimestamp, webhookSignature, secret } = opts;
  if (!webhookId || !webhookTimestamp || !webhookSignature) return false;

  const timestampSeconds = Number(webhookTimestamp);
  if (!Number.isFinite(timestampSeconds)) return false;
  const ageSeconds = Math.abs(Date.now() / 1000 - timestampSeconds);
  if (ageSeconds > 5 * 60) return false; // replay-attack window, per Fathom's own docs

  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signedContent = `${webhookId}.${webhookTimestamp}.${rawBody}`;
  const expected = createHmac("sha256", secretBytes).update(signedContent).digest("base64");
  const expectedBuf = Buffer.from(expected, "base64");

  return webhookSignature.split(" ").some((entry) => {
    const [, sig] = entry.split(",");
    if (!sig) return false;
    const candidate = Buffer.from(sig, "base64");
    return candidate.length === expectedBuf.length && timingSafeEqual(candidate, expectedBuf);
  });
}

/** Picks the first present field from a list of plausible names — same defensive approach as scripts/ingest-fathom.mjs, for the same reason (no loadable official docs to pin exact field names against). */
function pick(obj: any, ...names: string[]): any {
  for (const name of names) {
    if (obj?.[name] !== undefined && obj[name] !== null && obj[name] !== "") return obj[name];
  }
  return undefined;
}

function fieldToText(value: any): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    if (value.length > 0 && typeof value[0] === "object" && value[0] !== null && "text" in value[0]) {
      return value
        .map((turn: any) => {
          const speaker = turn?.speaker?.display_name ?? (typeof turn?.speaker === "string" ? turn.speaker : null);
          if (!turn.text) return "";
          return speaker ? `${speaker}: ${turn.text}` : turn.text;
        })
        .filter(Boolean)
        .join("\n");
    }
    return value.map(fieldToText).filter(Boolean).join("\n");
  }
  if (typeof value === "object") {
    return value.markdown_formatted ?? value.text ?? value.content ?? value.summary ?? JSON.stringify(value);
  }
  return String(value);
}

function extractParticipants(transcriptTurns: any, calendarInvitees: any, excludeName?: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  const add = (name?: string | null) => {
    if (name && name !== excludeName && !seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  };
  if (Array.isArray(transcriptTurns)) {
    for (const turn of transcriptTurns) {
      const speaker = turn?.speaker;
      add(speaker?.display_name ?? (typeof speaker === "string" ? speaker : null));
    }
  }
  if (Array.isArray(calendarInvitees)) {
    for (const invitee of calendarInvitees) add(invitee?.name);
  }
  return names.slice(0, 8);
}

function buildMetaLine(meeting: { title: string; participants: string[]; recordedAt?: string; url?: string }): string {
  const parts = [`Call: ${meeting.title}`];
  if (meeting.participants.length > 0) parts.push(`with ${meeting.participants.join(", ")}`);
  const date = meeting.recordedAt ? new Date(meeting.recordedAt) : null;
  if (date && !isNaN(date.getTime())) parts.push(`on ${date.toISOString().slice(0, 10)}`);
  if (meeting.url) parts.push(`— watch: ${meeting.url}`);
  return parts.join(" ");
}

interface ParsedMeeting {
  id: string;
  title: string;
  url?: string;
  recordedAt?: string;
  participants: string[];
  transcript: string;
  summary: string;
  actionItems: string;
  highlights: string;
}

function parseMeeting(raw: any): ParsedMeeting {
  const id = pick(raw, "id", "meeting_id", "recording_id");
  const rawTranscript = pick(raw, "transcript", "transcript_text");
  return {
    id: String(id),
    title: pick(raw, "title", "meeting_title", "name") ?? "Untitled call",
    url: pick(raw, "share_url", "url", "recording_url"),
    recordedAt: pick(raw, "recording_start_time", "recorded_at", "scheduled_start_time", "created_at"),
    participants: extractParticipants(rawTranscript, pick(raw, "calendar_invitees"), pick(raw, "recorded_by")?.name),
    transcript: fieldToText(rawTranscript),
    summary: fieldToText(pick(raw, "summary", "ai_summary", "default_summary")),
    actionItems: fieldToText(pick(raw, "action_items")),
    highlights: fieldToText(pick(raw, "highlights")),
  };
}

const CHUNK_CHARS = 3000;

function chunkMeeting(meeting: ParsedMeeting): string[] {
  const meta = buildMetaLine(meeting);
  const chunks: string[] = [];
  if (meeting.summary.trim()) chunks.push(`${meta}\n\nSummary:\n${meeting.summary.trim()}`);
  const transcript = meeting.transcript.trim();
  for (let i = 0; i < transcript.length; i += CHUNK_CHARS) {
    chunks.push(`${meta}\n\nTranscript:\n${transcript.slice(i, i + CHUNK_CHARS)}`);
  }
  if (meeting.actionItems.trim()) chunks.push(`${meta}\n\nAction items:\n${meeting.actionItems.trim()}`);
  if (meeting.highlights.trim()) chunks.push(`${meta}\n\nHighlights:\n${meeting.highlights.trim()}`);
  return chunks;
}

/**
 * The webhook payload's own field names are the least-confirmed part of
 * this whole integration (no loadable docs — see this file's header), so
 * this deliberately uses the webhook only to learn a meeting id fired,
 * then re-fetches that meeting through the same REST endpoint
 * scripts/ingest-fathom.mjs already uses successfully (GET
 * /external/v1/meetings/{id}) — the one place this codebase actually has
 * confirmed-against-real-data field names, rather than trusting a second,
 * unverified payload shape for the real content.
 */
export async function syncOneFathomMeeting(supabase: any, meetingId: string): Promise<{ chunksIngested: number }> {
  const apiKey = process.env.FATHOM_API_KEY;
  if (!apiKey) throw new Error("FATHOM_API_KEY is not configured");

  const url = new URL(`https://api.fathom.ai/external/v1/meetings/${encodeURIComponent(meetingId)}`);
  for (const [k, v] of Object.entries({
    include_transcript: "true",
    include_summary: "true",
    include_action_items: "true",
    include_highlights: "true",
  })) {
    url.searchParams.set(k, v);
  }
  const res = await fetch(url, { headers: { "X-Api-Key": apiKey } });
  if (!res.ok) throw new Error(`Fathom API GET /meetings/${meetingId} failed: ${res.status} ${await res.text().catch(() => "")}`);
  const meeting = parseMeeting(await res.json());

  const chunks = chunkMeeting(meeting);
  if (chunks.length === 0) return { chunksIngested: 0 };

  const dbRows = [];
  for (let i = 0; i < chunks.length; i++) {
    const embedding = await embedQuery(chunks[i].slice(0, 8000));
    dbRows.push({
      meeting_id: meeting.id,
      chunk_index: i,
      title: meeting.title,
      call_url: meeting.url,
      recorded_at: meeting.recordedAt,
      participants: meeting.participants,
      content: chunks[i],
      embedding,
    });
  }

  const { error } = await supabase
    .schema("social")
    .from("fathom_calls")
    .upsert(dbRows, { onConflict: "meeting_id,chunk_index" });
  if (error) throw new Error(`Supabase upsert failed — ${error.message}`);

  return { chunksIngested: dbRows.length };
}
