/**
 * The same Notion ingestion pipeline as scripts/ingest-notion.mjs — pulls
 * every page/database shared with the integration (including database
 * rows, inline embedded databases, and NOTION_EXTRA_IDS — see that
 * script's header comment for why each of those exists), flattens to
 * text, embeds, and upserts into tech.notion_docs.
 *
 * Ported into the app itself (rather than shelling out to the .mjs
 * script) so app/api/cron/sync-notion/route.ts can call it directly as a
 * function — no child_process, no risk of the script file getting
 * dropped from Vercel's serverless bundle by output file tracing since
 * nothing statically imports it. scripts/ingest-notion.mjs stays as-is
 * for manual/local runs (FORCE_REFRESH, NOTION_DEBUG, verbose per-item
 * console output) — this is the automated/production path, always
 * incremental, with a compact summary instead of a line per item.
 *
 * Keep the actual ingestion logic (property parsing, block flattening,
 * row-date detection, etc.) in sync with scripts/ingest-notion.mjs by
 * hand if either one changes — genuinely two copies, not a shared import,
 * since one runs as a plain Node script and the other inside Next.js.
 */

const NOTION_VERSION = "2022-06-28";
const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1024;
const MAX_INPUT_CHARS = 8000;
const CHUNK_CHARS = 6000;
const MAX_BLOCK_DEPTH = 6;
const EMBED_BATCH_CHAR_BUDGET = 20_000;

async function notion(path: string, body?: unknown): Promise<any> {
  const apiKey = process.env.NOTION_API_KEY;
  if (!apiKey) throw new Error("NOTION_API_KEY is not configured");

  const res = await fetch(`https://api.notion.com${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Notion API ${path} failed: ${res.status} ${await res.text().catch(() => "")}`);
  return res.json();
}

async function searchAll(): Promise<any[]> {
  const results: any[] = [];
  let cursor: string | undefined;
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

/** See scripts/ingest-notion.mjs's header comment for why this exists — a real, confirmed Notion search API gap. */
async function fetchExtraObjects(): Promise<any[]> {
  const raw = (process.env.NOTION_EXTRA_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const objects: any[] = [];
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
      console.error(`NOTION_EXTRA_IDS: couldn't fetch ${id} as a database or page — ${err instanceof Error ? err.message : err}`);
    }
  }
  return objects;
}

async function queryDatabaseRows(databaseId: string): Promise<any[]> {
  const rows: any[] = [];
  let cursor: string | undefined;
  do {
    const data = await notion(`/v1/databases/${databaseId}/query`, { start_cursor: cursor, page_size: 100 });
    rows.push(...data.results);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return rows;
}

function plainTextFrom(richTextArray: any[] | undefined): string {
  return (richTextArray ?? []).map((t) => t.plain_text ?? "").join("");
}

function titleOf(obj: any): string {
  if (obj.object === "database") return plainTextFrom(obj.title) || "Untitled database";
  const titleProp = Object.values(obj.properties ?? {}).find((p: any) => p.type === "title") as any;
  return plainTextFrom(titleProp?.title) || "Untitled page";
}

function propertyValueText(prop: any): string {
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
      return (prop.multi_select ?? []).map((o: any) => o.name).join(", ");
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
      return (prop.people ?? []).map((p: any) => p.name ?? "someone").join(", ");
    case "files":
      return (prop.files ?? []).map((f: any) => f.name ?? "").filter(Boolean).join(", ");
    case "unique_id":
      return prop.unique_id ? `${prop.unique_id.prefix ?? ""}${prop.unique_id.number ?? ""}` : "";
    case "formula":
      return prop.formula ? String(prop.formula[prop.formula.type] ?? "") : "";
    default:
      return "";
  }
}

function formatProperties(properties: any): string {
  return Object.entries(properties ?? {})
    .map(([name, prop]) => {
      const value = propertyValueText(prop);
      return value ? `${name}: ${value}` : null;
    })
    .filter(Boolean)
    .join("\n");
}

function primaryRowDate(properties: any): string | null {
  const dateEntries = Object.entries(properties ?? {}).filter(([, prop]: [string, any]) => prop.type === "date" && prop.date?.start);
  if (dateEntries.length === 0) return null;
  const preferred = dateEntries.find(([name]) => /launch|date|start|when|due/i.test(name));
  return ((preferred ?? dateEntries[0])[1] as any).date.start;
}

function textOfBlock(block: any): { text: string; childDatabaseId?: string } {
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

async function fetchBlockChildren(blockId: string): Promise<any[]> {
  const blocks: any[] = [];
  let cursor: string | undefined;
  do {
    const data = await notion(`/v1/blocks/${blockId}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ""}`);
    blocks.push(...data.results);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return blocks;
}

async function flattenBlocks(blockId: string, depth = 0): Promise<{ text: string; childDatabaseIds: string[] }> {
  if (depth > MAX_BLOCK_DEPTH) return { text: "", childDatabaseIds: [] };
  const blocks = await fetchBlockChildren(blockId);
  const lines: string[] = [];
  const childDatabaseIds: string[] = [];
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

function chunkText(content: string): string[] {
  if (content.length <= CHUNK_CHARS) return [content];
  const chunks: string[] = [];
  for (let i = 0; i < content.length; i += CHUNK_CHARS) chunks.push(content.slice(i, i + CHUNK_CHARS));
  return chunks;
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ input: texts, model: EMBEDDING_MODEL, dimensions: EMBEDDING_DIMENSIONS }),
  });
  if (!res.ok) throw new Error(`OpenAI embeddings failed: ${res.status} ${await res.text().catch(() => "")}`);
  const data = await res.json();
  return data.data.map((d: { embedding: number[] }) => d.embedding);
}

async function fetchExistingUpdatedAt(supabase: any): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .schema("tech")
      .from("notion_docs")
      .select("page_id, notion_updated_at")
      .range(from, from + pageSize - 1);
    if (error) {
      console.error(`[notion-sync] couldn't check existing docs — ${error.message}`);
      return map;
    }
    for (const row of data ?? []) map.set(row.page_id, row.notion_updated_at);
    if (!data || data.length < pageSize) break;
  }
  return map;
}

function batchDocs<T extends { content: string }>(docs: T[]): T[][] {
  const batches: T[][] = [];
  let current: T[] = [];
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

async function buildDoc(obj: any): Promise<{ docs: any[]; childDatabaseIds: string[] }> {
  const title = titleOf(obj);
  const isDatabase = obj.object === "database";
  const isRow = obj.object === "page" && obj.parent?.type === "database_id";

  let content: string;
  let childDatabaseIds: string[] = [];
  if (isDatabase) {
    content = [title, plainTextFrom(obj.description)].filter(Boolean).join("\n\n");
  } else {
    const propsText = isRow ? formatProperties(obj.properties) : "";
    const flattened = await flattenBlocks(obj.id);
    childDatabaseIds = flattened.childDatabaseIds;
    content = [title, propsText, flattened.text].filter(Boolean).join("\n\n");
  }

  if (!content.trim()) return { docs: [], childDatabaseIds };

  const rowDate = isRow ? primaryRowDate(obj.properties) : null;

  const docs = chunkText(content).map((text, i, all) => ({
    page_id: obj.id,
    doc_type: isDatabase ? "database" : "page",
    path: all.length > 1 ? `${obj.id}#chunk${i}` : obj.id,
    title,
    content: text,
    source_url: obj.url,
    notion_updated_at: obj.last_edited_time,
    row_date: rowDate,
  }));

  return { docs, childDatabaseIds };
}

export interface NotionSyncResult {
  itemsFound: number;
  itemsExpanded: number;
  itemsUpdated: number;
  chunksIngested: number;
  errors: string[];
}

/**
 * Runs one incremental sync — always incremental (no FORCE_REFRESH here;
 * that's a manual/local-only escape hatch in scripts/ingest-notion.mjs
 * for backfilling after a script upgrade). Meant to be called on a
 * schedule (see app/api/cron/sync-notion/route.ts) so nobody has to run
 * the script by hand after every Notion edit.
 */
export async function syncNotion(supabase: any): Promise<NotionSyncResult> {
  const errors: string[] = [];
  const searchResults = await searchAll();
  const extraObjects = await fetchExtraObjects();
  const seedObjects = [...searchResults, ...extraObjects];

  if (seedObjects.length === 0) {
    return { itemsFound: 0, itemsExpanded: 0, itemsUpdated: 0, chunksIngested: 0, errors };
  }

  const allObjects: any[] = [];
  const seenIds = new Set<string>();
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

  const existingUpdatedAt = await fetchExistingUpdatedAt(supabase);
  const stale = allObjects.filter((obj) => {
    const known = existingUpdatedAt.get(obj.id);
    return !known || new Date(obj.last_edited_time) > new Date(known);
  });

  let chunksIngested = 0;
  let itemsUpdated = 0;

  for (const obj of stale) {
    let docs: any[], childDatabaseIds: string[];
    try {
      ({ docs, childDatabaseIds } = await buildDoc(obj));
    } catch (err) {
      errors.push(`${titleOf(obj)}: fetch failed — ${err instanceof Error ? err.message : err}`);
      continue;
    }

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
        errors.push(`inline database ${dbId}: fetch failed — ${err instanceof Error ? err.message : err}`);
      }
    }

    if (docs.length === 0) continue;

    let itemChunks = 0;
    for (const batch of batchDocs(docs)) {
      const texts = batch.map((d) => d.content.slice(0, MAX_INPUT_CHARS));
      let embeddings: number[][];
      try {
        embeddings = await embedBatch(texts);
      } catch (err) {
        errors.push(`${titleOf(obj)}: embedding failed — ${err instanceof Error ? err.message : err}`);
        continue;
      }

      const rows = batch.map((d, i) => ({ ...d, embedding: embeddings[i] }));
      const { error } = await supabase.schema("tech").from("notion_docs").upsert(rows, { onConflict: "path" });
      if (error) {
        errors.push(`${titleOf(obj)}: upsert failed — ${error.message}`);
        continue;
      }
      itemChunks += rows.length;
    }

    if (itemChunks > 0) {
      chunksIngested += itemChunks;
      itemsUpdated += 1;
    }
    await new Promise((r) => setTimeout(r, 350)); // be polite to Notion's ~3req/s average rate limit
  }

  return {
    itemsFound: seedObjects.length,
    itemsExpanded: allObjects.length,
    itemsUpdated,
    chunksIngested,
    errors,
  };
}
