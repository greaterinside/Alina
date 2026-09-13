#!/usr/bin/env node
/**
 * Pulls every page (and database container) shared with the Alina Notion
 * integration, flattens each page's blocks to plain text, embeds them with
 * OpenAI, and upserts them into tech.notion_docs so match_knowledge can
 * search them from the Tech workspace once its union branch is updated
 * (see README's Notion ingestion section). Needs
 * supabase/migrations/0012_notion_docs.sql applied first.
 *
 * Run:
 *   node scripts/ingest-notion.mjs
 *
 * Needs NOTION_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * and OPENAI_API_KEY — reads them from your shell env, or from .env.local
 * if present (that file is git-ignored; this script never touches the repo).
 *
 * NOTION_API_KEY comes from an *internal* integration (notion.so/my-
 * integrations) — no OAuth review needed, but it only sees pages/databases
 * explicitly shared with it (Share -> search the integration's name ->
 * Invite). Sharing a top-level page shares everything nested under it.
 *
 * Incremental: re-run any time. A page is only re-fetched/re-embedded when
 * Notion's last_edited_time is newer than what's already stored, so a
 * normal re-run costs almost nothing once everything is caught up.
 *
 * Uses text-embedding-3-small at 1024 dimensions, same as the rest of this
 * schema — see supabase/migrations/0012_notion_docs.sql.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";

if (existsSync(".env.local")) {
  for (const rawLine of readFileSync(".env.local", "utf8").split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const NOTION_API_KEY = process.env.NOTION_API_KEY;
const NOTION_VERSION = "2022-06-28";
const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1024;
const MAX_INPUT_CHARS = 8000;
const CHUNK_CHARS = 6000;
// Nested toggles/columns/sub-pages-as-blocks can go arbitrarily deep;
// bounded so one pathological page can't hang the whole run.
const MAX_BLOCK_DEPTH = 6;
const EMBED_BATCH_CHAR_BUDGET = 20_000;

const missing = [
  ["NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL],
  ["SUPABASE_SERVICE_ROLE_KEY", SERVICE_KEY],
  ["OPENAI_API_KEY", OPENAI_API_KEY],
  ["NOTION_API_KEY", NOTION_API_KEY],
].filter(([, v]) => !v).map(([k]) => k);

if (missing.length > 0) {
  console.error(`Missing: ${missing.join(", ")} (set them in your shell, or in .env.local).`);
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

async function notion(path, body) {
  const res = await fetch(`https://api.notion.com${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${NOTION_API_KEY}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Notion API ${path} failed: ${res.status} ${await res.text().catch(() => "")}`);
  return res.json();
}

/** Every page/database object shared with the integration — search covers both, paginated. */
async function searchAll() {
  const results = [];
  let cursor;
  do {
    const data = await notion("/v1/search", {
      start_cursor: cursor,
      page_size: 100,
      sort: { direction: "descending", timestamp: "last_edited_time" },
    });
    results.push(...data.results);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return results;
}

function plainTextFrom(richTextArray) {
  return (richTextArray ?? []).map((t) => t.plain_text ?? "").join("");
}

/** Pulls the title out of a page's properties (the one property with type "title") or a database's own title array. */
function titleOf(obj) {
  if (obj.object === "database") return plainTextFrom(obj.title) || "Untitled database";
  const titleProp = Object.values(obj.properties ?? {}).find((p) => p.type === "title");
  return plainTextFrom(titleProp?.title) || "Untitled page";
}

/** Flattens one block's own text content — not its children, callers handle recursion. */
function textOfBlock(block) {
  const data = block[block.type];
  if (!data) return "";
  if (Array.isArray(data.rich_text)) {
    const text = plainTextFrom(data.rich_text);
    if (block.type === "to_do") return `[${data.checked ? "x" : " "}] ${text}`;
    if (block.type === "code") return `\`\`\`\n${text}\n\`\`\``;
    return text;
  }
  return "";
}

async function fetchBlockChildren(blockId) {
  const blocks = [];
  let cursor;
  do {
    const data = await notion(`/v1/blocks/${blockId}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ""}`);
    blocks.push(...data.results);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return blocks;
}

async function flattenBlocks(blockId, depth = 0) {
  if (depth > MAX_BLOCK_DEPTH) return "";
  const blocks = await fetchBlockChildren(blockId);
  const lines = [];
  for (const block of blocks) {
    const text = textOfBlock(block);
    if (text) lines.push(text);
    if (block.has_children) {
      const nested = await flattenBlocks(block.id, depth + 1);
      if (nested) lines.push(nested);
    }
  }
  return lines.join("\n");
}

function chunk(content) {
  if (content.length <= CHUNK_CHARS) return [content];
  const chunks = [];
  for (let i = 0; i < content.length; i += CHUNK_CHARS) chunks.push(content.slice(i, i + CHUNK_CHARS));
  return chunks;
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

/** page_id -> newest notion_updated_at already stored, so unchanged pages can be skipped without re-fetching their blocks. */
async function fetchExistingUpdatedAt() {
  const map = new Map();
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .schema("tech")
      .from("notion_docs")
      .select("page_id, notion_updated_at")
      .range(from, from + pageSize - 1);
    if (error) {
      console.error(`  couldn't check existing docs — ${error.message}`);
      return map;
    }
    for (const row of data ?? []) map.set(row.page_id, row.notion_updated_at);
    if (!data || data.length < pageSize) break;
  }
  return map;
}

/** Greedily groups docs into batches under EMBED_BATCH_CHAR_BUDGET chars each, same approach as ingest-github.mjs. */
function batchDocs(docs) {
  const batches = [];
  let current = [];
  let currentChars = 0;
  for (const doc of docs) {
    const size = Math.min(doc.content.length, MAX_INPUT_CHARS);
    if (current.length > 0 && currentChars + size > EMBED_BATCH_CHAR_BUDGET) {
      batches.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(doc);
    currentChars += size;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

async function buildDoc(obj) {
  const title = titleOf(obj);
  const isDatabase = obj.object === "database";
  const content = isDatabase
    ? [title, plainTextFrom(obj.description)].filter(Boolean).join("\n\n")
    : [title, await flattenBlocks(obj.id)].filter(Boolean).join("\n\n");

  if (!content.trim()) return [];

  return chunk(content).map((text, i, all) => ({
    page_id: obj.id,
    doc_type: isDatabase ? "database" : "page",
    path: all.length > 1 ? `${obj.id}#chunk${i}` : obj.id,
    title,
    content: text,
    source_url: obj.url,
    notion_updated_at: obj.last_edited_time,
  }));
}

async function main() {
  console.log("Searching everything shared with the Alina integration...\n");
  const objects = await searchAll();
  console.log(`Found ${objects.length} page(s)/database(s) shared with the integration.\n`);

  if (objects.length === 0) {
    console.log("Nothing shared yet — in Notion, open a page and use Share -> invite the integration by name.");
    return;
  }

  const existingUpdatedAt = await fetchExistingUpdatedAt();

  const stale = objects.filter((obj) => {
    const known = existingUpdatedAt.get(obj.id);
    return !known || new Date(obj.last_edited_time) > new Date(known);
  });

  console.log(`${objects.length - stale.length} up to date, ${stale.length} new or edited since last run.\n`);
  if (stale.length === 0) return;

  let grandTotal = 0;
  for (const obj of stale) {
    const title = titleOf(obj);
    process.stdout.write(`${title}... `);
    let docs;
    try {
      docs = await buildDoc(obj);
    } catch (err) {
      console.log(`fetch failed — ${err.message}`);
      continue;
    }
    if (docs.length === 0) {
      console.log("empty, skipped");
      continue;
    }

    let total = 0;
    for (const batch of batchDocs(docs)) {
      const texts = batch.map((d) => d.content.slice(0, MAX_INPUT_CHARS));
      let embeddings;
      try {
        embeddings = await embedBatch(texts);
      } catch (err) {
        console.log(`embedding failed — ${err.message}`);
        continue;
      }

      const rows = batch.map((d, i) => ({ ...d, embedding: embeddings[i] }));
      const { error } = await supabase.schema("tech").from("notion_docs").upsert(rows, { onConflict: "path" });
      if (error) {
        console.log(`upsert failed — ${error.message}`);
        continue;
      }
      total += rows.length;
    }
    console.log(`${total} chunk(s)`);
    grandTotal += total;
    await new Promise((r) => setTimeout(r, 350)); // be polite to Notion's ~3req/s average rate limit
  }

  console.log(`\nFinished. ${grandTotal} chunk(s) ingested/updated across ${stale.length} page(s)/database(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
