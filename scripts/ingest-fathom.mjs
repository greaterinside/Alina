#!/usr/bin/env node
/**
 * Pulls call recordings' transcripts + AI summaries from Fathom
 * (fathom.video — the meeting notetaker, NOT usefathom.com's analytics
 * product, a different service with a confusingly similar name), embeds
 * them with OpenAI, and upserts them into social.fathom_calls so
 * match_knowledge can search real client/sales/internal call content —
 * see supabase/migrations/0004_fathom_calls.sql.
 *
 * Run:
 *   node scripts/ingest-fathom.mjs
 *
 * Needs FATHOM_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * and OPENAI_API_KEY — reads them from your shell env, or from .env.local
 * if present (that file is git-ignored; this script never touches the repo).
 *
 * IMPORTANT — unlike ingest-github.mjs, this one is NOT written against
 * official docs I could actually load (Fathom's docs domain is blocked in
 * my sandbox; this is built from search-engine summaries of their API).
 * The endpoint, auth header, and the general shape (meetings list with
 * include_transcript/include_summary) are sourced and reasonably solid.
 * The exact field NAMES inside each meeting object are my best guess at
 * common conventions (tried in priority order below) — the first run logs
 * the raw shape of the first meeting so a mismatch is easy to spot and fix
 * in five minutes rather than something to debug blind.
 *
 * A Fathom API key only sees meetings the key's owner recorded or that
 * were shared with them — not automatically every teammate's calls. See
 * the README for what that means for coverage.
 *
 * Safe to re-run: fetches every (meeting_id, chunk_index) already in the
 * database once at startup and skips exactly those.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";

if (existsSync(".env.local")) {
  for (const rawLine of readFileSync(".env.local", "utf8").split("\n")) {
    // Strip a trailing \r — Windows-written files (or the last line after a
    // tool appends a platform-default line ending) can leave one only on
    // some lines, which silently breaks just that line's match below.
    const line = rawLine.replace(/\r$/, "");
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const FATHOM_API_KEY = process.env.FATHOM_API_KEY;
// Set FORCE_REFRESH=1 to re-embed and overwrite every chunk's content, not
// just add new ones — needed the one time chunkMeeting()'s output format
// changes (e.g. adding the participants/link line below) and you want
// already-ingested calls to pick it up too, not just calls ingested from
// here on. Costs the same as a full fresh run — every chunk gets
// re-embedded — so it's opt-in, not automatic.
const FORCE_REFRESH = process.env.FORCE_REFRESH === "1";
const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1024;
const MAX_INPUT_CHARS = 8000;
const CHUNK_CHARS = 3000;
const EMBED_BATCH_CHAR_BUDGET = 20_000;
const PAGE_LIMIT = 50;

const missing = [
  ["NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL],
  ["SUPABASE_SERVICE_ROLE_KEY", SERVICE_KEY],
  ["OPENAI_API_KEY", OPENAI_API_KEY],
  ["FATHOM_API_KEY", FATHOM_API_KEY],
].filter(([, v]) => !v).map(([k]) => k);

if (missing.length > 0) {
  console.error(`Missing: ${missing.join(", ")} (set them in your shell, or in .env.local).`);
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

/** Picks the first present field from a list of plausible names. */
function pick(obj, ...names) {
  for (const name of names) {
    if (obj[name] !== undefined && obj[name] !== null && obj[name] !== "") return obj[name];
  }
  return undefined;
}

/**
 * Who was actually on the call — pulled primarily from the transcript's
 * own speaker labels (checked against real data: on an "Impromptu Zoom
 * Meeting" with an external client, calendar_invitees only listed the
 * internal host — the client's actual name, "TRADEWIZE TRAINING AND
 * DEVELOPMENT LLC", only ever showed up as a transcript speaker label,
 * never as a calendar invitee). calendar_invitees is used only to fill in
 * anyone the transcript speakers didn't already cover.
 */
function extractParticipants(transcriptTurns, calendarInvitees) {
  const names = [];
  const seen = new Set();
  const add = (name) => {
    if (name && !seen.has(name)) {
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
  return names.slice(0, 8); // enough to identify who's on the call, not a full roster dump
}

/**
 * Fathom's transcript field is an array of speaker turns
 * ({ speaker: { display_name }, text, timestamp }), not a plain string —
 * found out by actually running this against real data. summary's exact
 * shape is still unconfirmed, so this handles string/array/object forms
 * generically instead of assuming a second field turns out to be a plain
 * string too.
 */
function fieldToText(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    if (value.length > 0 && typeof value[0] === "object" && value[0] !== null && "text" in value[0]) {
      // Transcript turns have a speaker; action items/highlights (same
      // {text}-shaped array convention) likely won't — only prefix a
      // speaker name when one's actually there instead of always
      // printing "Unknown:" on items that were never speaker-attributed.
      return value
        .map((turn) => {
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

async function fathomFetch(path, params = {}, attempt = 1) {
  const url = new URL(`https://api.fathom.ai/external/v1${path}`);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, v);

  const res = await fetch(url, { headers: { "X-Api-Key": FATHOM_API_KEY } });

  if (res.status === 429 && attempt <= 5) {
    const retryAfter = res.headers.get("retry-after");
    const waitMs = retryAfter ? Number(retryAfter) * 1000 : attempt * 4000;
    console.log(`  rate limited — waiting ${Math.round(waitMs / 1000)}s before retry ${attempt}/5…`);
    await new Promise((r) => setTimeout(r, waitMs));
    return fathomFetch(path, params, attempt + 1);
  }
  if (!res.ok) {
    throw new Error(`Fathom API ${path} failed: ${res.status} ${await res.text().catch(() => "")}`);
  }
  return res.json();
}

let loggedSample = false;

/** Fetches every meeting, page by page, normalizing field names defensively. */
async function fetchAllMeetings() {
  const meetings = [];
  let cursor;
  for (;;) {
    const data = await fathomFetch("/meetings", {
      include_transcript: "true",
      include_summary: "true",
      include_action_items: "true",
      include_highlights: "true",
      limit: PAGE_LIMIT,
      cursor,
    });

    const page = pick(data, "items", "meetings", "data", "results") ?? [];
    if (!loggedSample && page.length > 0) {
      loggedSample = true;
      console.log("First meeting's raw shape (for verifying field names below):");
      console.log("  top-level keys:", Object.keys(page[0]).join(", "));
      for (const [k, v] of Object.entries(page[0])) {
        const preview = Array.isArray(v)
          ? v.length > 0
            ? `array(${v.length}), first item: ${JSON.stringify(v[0]).slice(0, 180)}`
            : "array(0), empty"
          : typeof v === "object" && v !== null
          ? JSON.stringify(v).slice(0, 180)
          : String(v).slice(0, 180);
        console.log(`  ${k}: ${preview}`);
      }
      console.log("---\n");
    }

    for (const raw of page) {
      const id = pick(raw, "id", "meeting_id", "recording_id");
      if (!id) continue; // can't dedupe/resume without a stable id — skip rather than guess
      const rawTranscript = pick(raw, "transcript", "transcript_text");
      meetings.push({
        id: String(id),
        title: pick(raw, "title", "meeting_title", "name") ?? "Untitled call",
        // share_url is the human-facing link (fathom.video/share/...); url
        // (fathom.video/calls/...) is more of an internal id-style link —
        // prefer share_url for anything a person might actually click.
        url: pick(raw, "share_url", "url", "recording_url"),
        recordedAt: pick(raw, "recording_start_time", "recorded_at", "scheduled_start_time", "created_at"),
        participants: extractParticipants(rawTranscript, pick(raw, "calendar_invitees")),
        transcript: fieldToText(rawTranscript),
        summary: fieldToText(pick(raw, "summary", "ai_summary", "default_summary")),
        actionItems: fieldToText(pick(raw, "action_items")),
        highlights: fieldToText(pick(raw, "highlights")),
      });
    }

    cursor = pick(data, "next_cursor", "cursor");
    const hasMore = pick(data, "has_more");
    if (!cursor || page.length === 0 || hasMore === false) break;
    await new Promise((r) => setTimeout(r, 1000)); // be polite between pages — this is what tripped the 429
  }
  return meetings;
}

async function embedBatch(texts) {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ input: texts, model: EMBEDDING_MODEL, dimensions: EMBEDDING_DIMENSIONS }),
  });
  if (!res.ok) throw new Error(`OpenAI embeddings failed: ${res.status} ${await res.text().catch(() => "")}`);
  const data = await res.json();
  return data.data.map((d) => d.embedding);
}

const keyOf = (meetingId, chunkIndex) => `${meetingId}#${chunkIndex}`;

async function fetchExistingKeys() {
  const keys = new Set();
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .schema("social")
      .from("fathom_calls")
      .select("meeting_id, chunk_index")
      .range(from, from + pageSize - 1);
    if (error) {
      console.error(`Couldn't check existing calls — ${error.message}`);
      return keys;
    }
    for (const row of data ?? []) keys.add(keyOf(row.meeting_id, row.chunk_index));
    if (!data || data.length < pageSize) break;
  }
  return keys;
}

/** Splits one meeting into embeddable chunks: a summary chunk (if any) plus transcript chunks. */
/**
 * "Call: <title> with <participants> on <date> — watch: <link>" — stamped
 * on the front of EVERY chunk below, not just the first one. Two reasons
 * this needs to be on every chunk, not one dedicated "info" chunk:
 *  1. match_knowledge only ever shows the first 300 chars of whichever
 *     chunk it retrieves — a separate metadata chunk could easily not be
 *     the one that matches a given question.
 *  2. Retrieval on "who did I talk to at Tradewize" needs the company
 *     name attached to the actual relevant content, not floating in an
 *     unrelated chunk elsewhere.
 */
function buildMetaLine(meeting) {
  const parts = [`Call: ${meeting.title}`];
  if (meeting.participants.length > 0) parts.push(`with ${meeting.participants.join(", ")}`);
  const date = meeting.recordedAt ? new Date(meeting.recordedAt) : null;
  if (date && !isNaN(date.getTime())) parts.push(`on ${date.toISOString().slice(0, 10)}`);
  if (meeting.url) parts.push(`— watch: ${meeting.url}`);
  return parts.join(" ");
}

function chunkMeeting(meeting) {
  const meta = buildMetaLine(meeting);
  const chunks = [];
  if (meeting.summary.trim()) {
    chunks.push(`${meta}\n\nSummary:\n${meeting.summary.trim()}`);
  }
  const transcript = meeting.transcript.trim();
  for (let i = 0; i < transcript.length; i += CHUNK_CHARS) {
    const piece = transcript.slice(i, i + CHUNK_CHARS);
    chunks.push(`${meta}\n\nTranscript:\n${piece}`);
  }
  // Fathom's own AI-extracted action items/highlights, when present — more
  // reliable than asking Claude to re-derive them from the raw transcript
  // every time. Appended AFTER the transcript pieces (not interleaved
  // earlier) on purpose: a meeting's transcript length — and so its chunk
  // count — never changes between runs, so these two always land at fixed
  // new index positions past the end for a given meeting. Putting them
  // anywhere earlier would shift every later chunk_index on a re-run and
  // duplicate rows instead of cleanly adding these two. (The content at an
  // existing index CAN safely change on re-run — e.g. this meta line being
  // added to already-chunked meetings — since that's an update via upsert,
  // not a new row; it just won't happen automatically without
  // FORCE_REFRESH=1, since normal runs skip indices that already exist.)
  if (meeting.actionItems.trim()) {
    chunks.push(`${meta}\n\nAction items:\n${meeting.actionItems.trim()}`);
  }
  if (meeting.highlights.trim()) {
    chunks.push(`${meta}\n\nHighlights:\n${meeting.highlights.trim()}`);
  }
  return chunks;
}

/** Greedily groups (meeting, chunkIndex, text) rows under EMBED_BATCH_CHAR_BUDGET chars each. */
function batchRows(rows) {
  const batches = [];
  let current = [];
  let currentChars = 0;
  for (const row of rows) {
    const size = Math.min(row.text.length, MAX_INPUT_CHARS);
    if (current.length > 0 && currentChars + size > EMBED_BATCH_CHAR_BUDGET) {
      batches.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(row);
    currentChars += size;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

async function main() {
  console.log("Fetching meetings from Fathom...\n");
  const meetings = await fetchAllMeetings();
  console.log(`Found ${meetings.length} meeting(s) this key can see.\n`);

  if (FORCE_REFRESH) {
    console.log("FORCE_REFRESH=1 — re-embedding and overwriting every chunk, not just new ones.\n");
  }
  const existingKeys = FORCE_REFRESH ? new Set() : await fetchExistingKeys();

  const rows = [];
  for (const meeting of meetings) {
    chunkMeeting(meeting).forEach((text, i) => {
      if (existingKeys.has(keyOf(meeting.id, i))) return;
      rows.push({ meeting, chunkIndex: i, text });
    });
  }

  if (rows.length === 0) {
    console.log("Nothing new to ingest — already up to date.");
    return;
  }

  let total = 0;
  for (const batch of batchRows(rows)) {
    const texts = batch.map((r) => r.text.slice(0, MAX_INPUT_CHARS));
    let embeddings;
    try {
      embeddings = await embedBatch(texts);
    } catch (err) {
      console.error(`  embedding batch failed — ${err.message}`);
      continue; // this batch didn't go through; later batches still might
    }

    const dbRows = batch.map((r, i) => ({
      meeting_id: r.meeting.id,
      chunk_index: r.chunkIndex,
      title: r.meeting.title,
      call_url: r.meeting.url,
      recorded_at: r.meeting.recordedAt,
      content: r.text,
      embedding: embeddings[i],
    }));

    const { error } = await supabase
      .schema("social")
      .from("fathom_calls")
      .upsert(dbRows, { onConflict: "meeting_id,chunk_index" });
    if (error) {
      console.error(`  upsert failed — ${error.message}`);
      continue;
    }

    total += dbRows.length;
    console.log(`  ingested ${total}/${rows.length} new chunk(s) so far…`);
    await new Promise((r) => setTimeout(r, 250));
  }

  console.log(`\nFinished. ${total} new chunk(s) ingested across ${meetings.length} meeting(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
