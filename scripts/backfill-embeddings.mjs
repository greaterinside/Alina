#!/usr/bin/env node
/**
 * One-time (but safe to re-run — idempotent) backfill: embeds every row
 * across the six tables public.match_knowledge reads from, wherever
 * `embedding` is still null.
 *
 * Run:
 *   node scripts/backfill-embeddings.mjs
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and
 * OPENAI_API_KEY — reads them from your shell env, or from .env.local if
 * present (that file is git-ignored; this script never touches the repo).
 *
 * A word of caution before running this against production: it's a write
 * job — every row missing an embedding gets one via a live OpenAI API
 * call, table by table, with no dry-run mode. Skim the SOURCES list below
 * against your actual schema first.
 *
 * IMPORTANT: this uses text-embedding-3-small at 1024 dimensions. If the
 * `embedding` columns were created with a different vector dimension, the
 * UPDATE calls below will fail with a Postgres dimension-mismatch error —
 * change EMBEDDING_DIMENSIONS to match instead of the column type.
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
const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1024;
const BATCH_SIZE = 50;
const MAX_INPUT_CHARS = 8000; // rough guard against the model's per-input token cap

if (!SUPABASE_URL || !SERVICE_KEY || !OPENAI_API_KEY) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or OPENAI_API_KEY " +
      "(set them in your shell, or in .env.local)."
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// Keep this in sync with match_knowledge's own UNION list and
// lib/rag.ts#SOURCE_LABELS — all three enumerate the same six tables.
const SOURCES = [
  { schema: "tech", table: "notes", column: "body" },
  { schema: "tech", table: "meeting_notes", column: "transcript" },
  { schema: "social", table: "recordings", column: "transcript" },
  { schema: "social", table: "testimonials", column: "quote" },
  { schema: "social", table: "content_prompts", column: "prompt_text" },
  { schema: "support", table: "tickets", column: "question" },
];

async function embedBatch(texts) {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ input: texts, model: EMBEDDING_MODEL, dimensions: EMBEDDING_DIMENSIONS }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenAI embeddings failed: ${res.status} ${body}`);
  }
  const data = await res.json();
  return data.data.map((d) => d.embedding);
}

async function backfillSource({ schema, table, column }) {
  let total = 0;
  for (;;) {
    const { data: rows, error } = await supabase
      .schema(schema)
      .from(table)
      .select(`id, ${column}`)
      .is("embedding", null)
      .not(column, "is", null)
      .limit(BATCH_SIZE);

    if (error) {
      console.error(`  query failed — ${error.message}`);
      return total;
    }
    if (!rows || rows.length === 0) break;

    const texts = rows.map((r) => String(r[column]).slice(0, MAX_INPUT_CHARS));
    let embeddings;
    try {
      embeddings = await embedBatch(texts);
    } catch (err) {
      console.error(`  embedding batch failed — ${err.message}`);
      break;
    }

    for (let i = 0; i < rows.length; i++) {
      const { error: updateError } = await supabase
        .schema(schema)
        .from(table)
        .update({ embedding: embeddings[i] })
        .eq("id", rows[i].id);
      if (updateError) {
        console.error(`  id=${rows[i].id}: update failed — ${updateError.message}`);
      } else {
        total++;
      }
    }

    console.log(`  embedded ${total} so far…`);
    await new Promise((r) => setTimeout(r, 250)); // be polite to Voyage's rate limit
  }
  return total;
}

async function main() {
  console.log("Backfilling embeddings for match_knowledge's source tables...\n");
  let grandTotal = 0;
  for (const source of SOURCES) {
    console.log(`${source.schema}.${source.table}`);
    const count = await backfillSource(source);
    console.log(`  done — ${count} row(s) embedded this run.\n`);
    grandTotal += count;
  }
  console.log(`Finished. ${grandTotal} row(s) embedded across all six tables.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
