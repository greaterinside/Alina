#!/usr/bin/env node
/**
 * Pulls every page and database shared with the Alina Notion integration
 * — INCLUDING every row inside a shared database, and every database
 * embedded inline inside a shared page — flattens each to plain text,
 * embeds with OpenAI, and upserts into tech.notion_docs so
 * match_knowledge can search them from the Tech workspace once its union
 * branch is updated (see README's Notion ingestion section). Needs
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
 * KNOWN NOTION QUIRK — a database whose parent is the workspace itself
 * (top-level, not nested under any page) can be fully accessible to the
 * integration (a direct GET by id works, real data comes back) while
 * never appearing in /v1/search results at all. Confirmed live: a real
 * campaign-tracker database the integration could fetch directly by id
 * simply never showed up among the ~262 search results. Search is
 * Notion's only discovery mechanism — there's no "list everything this
 * integration can see" endpoint — so NOTION_EXTRA_IDS (comma-separated
 * page/database ids) is the escape hatch: every id listed there is
 * fetched directly and ingested regardless of whether search ever
 * surfaces it.
 *
 * IMPORTANT — a database's rows are its actual content, not its title.
 * A content calendar / campaign tracker / client list is a database: its
 * title alone ("Campaigns & Launches") says almost nothing — the real
 * content (dates, statuses, owners) lives in each ROW's properties. This
 * script queries every shared database's rows AND every database found
 * embedded inline inside a shared page (a child_database block), and
 * ingests each row as its own doc, its column values turned into
 * "Property: value" lines so a question like "what campaigns this week"
 * can actually match against a row's real Date/Status columns.
 *
 * Incremental: re-run any time. A page/row is only re-fetched/re-embedded
 * when Notion's last_edited_time is newer than what's already stored, so
 * a normal re-run costs almost nothing once everything is caught up —
 * except the very first run after this fix, which will find every
 * database row "new" (never ingested before) and pull all of them.
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
// Same escape hatch ingest-fathom.mjs already has — the normal staleness
// check only catches content Notion says actually changed, which is no
// help the first time a *script* gains new capability (e.g. this file's
// database-row expansion): an unedited object looks "up to date" against
// its old timestamp even though it was ingested by an older, less-capable
// version of this script and never got the new treatment.
const FORCE_REFRESH = process.env.FORCE_REFRESH === "1";

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

/**
 * Fetches NOTION_EXTRA_IDS (comma-separated page/database ids, dashes
 * optional) directly by id — the escape hatch for content that's fully
 * accessible to the integration but never shows up in /v1/search (see the
 * file header comment). Tries database first since that's the more common
 * case for something search misses (a workspace-parented database), then
 * falls back to page. Silently normalizes ids like Notion URLs give them
 * (32 hex chars, no dashes) into the dashed form the API expects.
 */
async function fetchExtraObjects() {
  const raw = (process.env.NOTION_EXTRA_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const objects = [];
  for (const rawId of raw) {
    const id =
      rawId.length === 32 && !rawId.includes("-")
        ? `${rawId.slice(0, 8)}-${rawId.slice(8, 12)}-${rawId.slice(12, 16)}-${rawId.slice(16, 20)}-${rawId.slice(20)}`
        : rawId;
    try {
      objects.push(await notion(`/v1/databases/${id}`));
      continue;
    } catch {
      // not a database — fall through and try as a page
    }
    try {
      objects.push(await notion(`/v1/pages/${id}`));
    } catch (err) {
      console.error(`NOTION_EXTRA_IDS: couldn't fetch ${id} as a database or page — ${err.message}`);
    }
  }
  return objects;
}

/** Every row (a "page" object) inside one database, paginated. */
async function queryDatabaseRows(databaseId) {
  const rows = [];
  let cursor;
  do {
    const data = await notion(`/v1/databases/${databaseId}/query`, { start_cursor: cursor, page_size: 100 });
    rows.push(...data.results);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return rows;
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

/** One property value as plain text — covers the column types an actual tracker/calendar database uses. */
function propertyValueText(prop) {
  switch (prop.type) {
    case "title":
      return plainTextFrom(prop.title);
    case "rich_text":
      return plainTextFrom(prop.rich_text);
    case "select":
      return prop.select?.name ?? "";
    case "status":
      return prop.status?.name ?? "";
    case "multi_select":
      return (prop.multi_select ?? []).map((o) => o.name).join(", ");
    case "date":
      if (!prop.date) return "";
      return prop.date.end ? `${prop.date.start} → ${prop.date.end}` : prop.date.start;
    case "number":
      return prop.number != null ? String(prop.number) : "";
    case "checkbox":
      return prop.checkbox ? "yes" : "no";
    case "url":
      return prop.url ?? "";
    case "email":
      return prop.email ?? "";
    case "phone_number":
      return prop.phone_number ?? "";
    case "people":
      return (prop.people ?? []).map((p) => p.name ?? "someone").join(", ");
    case "files":
      return (prop.files ?? []).map((f) => f.name ?? "").filter(Boolean).join(", ");
    case "formula":
      return prop.formula ? String(prop.formula[prop.formula.type] ?? "") : "";
    default:
      return ""; // relation/rollup/created_by/etc. — not worth another API round trip per row
  }
}

/** A database row's columns as "Name: value" lines — this is usually where a row's actual content lives, not its body blocks. */
function formatProperties(properties) {
  return Object.entries(properties ?? {})
    .map(([name, prop]) => {
      const value = propertyValueText(prop);
      return value ? `${name}: ${value}` : null;
    })
    .filter(Boolean)
    .join("\n");
}

/** Flattens one block's own text content — not its children, callers handle recursion. Also reports any inline database found, so the caller can queue its rows too. */
function textOfBlock(block) {
  if (block.type === "child_database") return { text: "", childDatabaseId: block.id };
  const data = block[block.type];
  if (!data) return { text: "" };
  if (Array.isArray(data.rich_text)) {
    const text = plainTextFrom(data.rich_text);
    if (block.type === "to_do") return { text: `[${data.checked ? "x" : " "}] ${text}` };
    if (block.type === "code") return { text: `\`\`\`\n${text}\n\`\`\`` };
    return { text };
  }
  return { text: "" };
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

/** Returns { text, childDatabaseIds } — childDatabaseIds are inline databases found while walking this page's blocks, for the caller to expand into rows too. */
async function flattenBlocks(blockId, depth = 0) {
  if (depth > MAX_BLOCK_DEPTH) return { text: "", childDatabaseIds: [] };
  const blocks = await fetchBlockChildren(blockId);
  const lines = [];
  const childDatabaseIds = [];
  for (const block of blocks) {
    const { text, childDatabaseId } = textOfBlock(block);
    if (text) lines.push(text);
    if (childDatabaseId) childDatabaseIds.push(childDatabaseId);
    if (block.has_children && block.type !== "child_database") {
      const nested = await flattenBlocks(block.id, depth + 1);
      if (nested.text) lines.push(nested.text);
      childDatabaseIds.push(...nested.childDatabaseIds);
    }
  }
  return { text: lines.join("\n"), childDatabaseIds };
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

/** page_id -> newest notion_updated_at already stored, so unchanged pages/rows can be skipped without re-fetching. */
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

/**
 * Builds the doc(s) for one page/database/row AND returns any inline
 * database ids discovered inside it, so the caller can queue those too —
 * this is how a database embedded inside a shared page (never separately
 * "shared" itself) still gets its rows ingested.
 */
async function buildDoc(obj) {
  const title = titleOf(obj);
  const isDatabase = obj.object === "database";
  const isRow = obj.object === "page" && obj.parent?.type === "database_id";

  let content;
  let childDatabaseIds = [];
  if (isDatabase) {
    content = [title, plainTextFrom(obj.description)].filter(Boolean).join("\n\n");
  } else {
    const propsText = isRow ? formatProperties(obj.properties) : "";
    const flattened = await flattenBlocks(obj.id);
    childDatabaseIds = flattened.childDatabaseIds;
    content = [title, propsText, flattened.text].filter(Boolean).join("\n\n");
  }

  if (!content.trim()) return { docs: [], childDatabaseIds };

  const docs = chunk(content).map((text, i, all) => ({
    page_id: obj.id,
    doc_type: isDatabase ? "database" : "page",
    path: all.length > 1 ? `${obj.id}#chunk${i}` : obj.id,
    title,
    content: text,
    source_url: obj.url,
    notion_updated_at: obj.last_edited_time,
  }));

  return { docs, childDatabaseIds };
}

async function main() {
  console.log("Searching everything shared with the Alina integration...\n");
  const searchResults = await searchAll();
  console.log(`Found ${searchResults.length} page(s)/database(s) shared with the integration.\n`);

  const extraObjects = await fetchExtraObjects();
  if (extraObjects.length > 0) {
    console.log(`Also fetched ${extraObjects.length} item(s) from NOTION_EXTRA_IDS directly (search doesn't list these).\n`);
  }

  const seedObjects = [...searchResults, ...extraObjects];
  if (seedObjects.length === 0) {
    console.log("Nothing shared yet — in Notion, open a page and use Share -> invite the integration by name.");
    return;
  }

  // Expands every database (shared directly, found embedded inside a
  // shared page, or listed in NOTION_EXTRA_IDS) into its actual rows — a
  // database's title alone says almost nothing; each row's properties are
  // where the real content is.
  console.log("Expanding databases into rows...\n");
  const allObjects = [];
  const seenIds = new Set();
  const expandQueue = [...seedObjects];
  while (expandQueue.length > 0) {
    const obj = expandQueue.shift();
    if (seenIds.has(obj.id)) continue;
    seenIds.add(obj.id);
    allObjects.push(obj);
    if (obj.object === "database") {
      const rows = await queryDatabaseRows(obj.id);
      expandQueue.push(...rows);
    }
  }
  console.log(`${allObjects.length} item(s) total once expanded (was ${seedObjects.length}).\n`);

  const existingUpdatedAt = await fetchExistingUpdatedAt();

  const stale = FORCE_REFRESH
    ? allObjects
    : allObjects.filter((obj) => {
        const known = existingUpdatedAt.get(obj.id);
        return !known || new Date(obj.last_edited_time) > new Date(known);
      });

  console.log(
    FORCE_REFRESH
      ? `FORCE_REFRESH=1 — re-ingesting all ${stale.length} item(s) regardless of staleness.\n`
      : `${allObjects.length - stale.length} up to date, ${stale.length} new or edited since last run.\n`
  );
  if (stale.length === 0) return;

  let grandTotal = 0;
  for (const obj of stale) {
    const title = titleOf(obj);
    process.stdout.write(`${title}... `);
    let docs, childDatabaseIds;
    try {
      ({ docs, childDatabaseIds } = await buildDoc(obj));
    } catch (err) {
      console.log(`fetch failed — ${err.message}`);
      continue;
    }

    // An inline database found just now (inside a page that was already
    // being processed) — queue its rows for this same run too, rather
    // than needing a second run to pick them up.
    for (const dbId of childDatabaseIds) {
      if (seenIds.has(dbId)) continue;
      seenIds.add(dbId);
      try {
        const db = await notion(`/v1/databases/${dbId}`);
        const rows = await queryDatabaseRows(dbId);
        for (const row of [db, ...rows]) {
          if (!seenIds.has(row.id)) {
            seenIds.add(row.id);
            stale.push(row);
          }
        }
      } catch (err) {
        console.log(`(inline database ${dbId} fetch failed — ${err.message}) `);
      }
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

  console.log(`\nFinished. ${grandTotal} chunk(s) ingested/updated across ${stale.length} item(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
