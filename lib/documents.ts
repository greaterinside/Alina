import type { WorkspaceId } from "@/lib/types";

// Matches the embedding model/dimensions the rest of the app is pinned to
// (see lib/rag.ts) — vectors from a different model aren't comparable.
const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1024;
const CHUNK_CHARS = 6000;
const MAX_INPUT_CHARS = 8000;

// Vercel's serverless function request body limit (Hobby/Pro) is 4.5MB —
// this stays under that with room for the multipart envelope around it,
// and doubles as a sane cap on how much one upload should cost to embed.
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export const ACCEPTED_UPLOAD_TYPES = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "text/plain": "txt",
  "text/markdown": "txt",
} as const;

/** Extracts plain text from a PDF, DOCX, or plain-text file buffer. */
export async function extractText(buffer: Buffer, kind: "pdf" | "docx" | "txt"): Promise<string> {
  if (kind === "txt") return buffer.toString("utf8");

  if (kind === "pdf") {
    // pdf-parse v2's API is class-based (not the classic pdfParse(buffer)
    // function of v1) — load, extract, then release the parser's resources.
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return result.text;
    } finally {
      await parser.destroy();
    }
  }

  // docx
  const mammoth = await import("mammoth");
  const { value } = await mammoth.extractRawText({ buffer });
  return value;
}

function chunkText(text: string): string[] {
  const trimmed = text.trim();
  if (trimmed.length <= CHUNK_CHARS) return [trimmed];
  const chunks: string[] = [];
  for (let i = 0; i < trimmed.length; i += CHUNK_CHARS) chunks.push(trimmed.slice(i, i + CHUNK_CHARS));
  return chunks;
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      input: texts.map((t) => t.slice(0, MAX_INPUT_CHARS)),
      model: EMBEDDING_MODEL,
      dimensions: EMBEDDING_DIMENSIONS,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI embeddings failed: ${res.status}`);
  const data = await res.json();
  return data.data.map((d: { embedding: number[] }) => d.embedding);
}

/**
 * Parses, chunks, embeds, and stores one uploaded file into
 * public.uploaded_docs, immediately searchable by match_knowledge from
 * then on (once its union branch includes this table — see README). One
 * upload always fits in a single OpenAI embeddings call: MAX_UPLOAD_BYTES
 * bounds how many chunks a single file can ever produce.
 */
export async function ingestUpload(opts: {
  supabase: any;
  buffer: Buffer;
  filename: string;
  kind: "pdf" | "docx" | "txt";
  workspace: WorkspaceId;
  uploadedBy: string | null;
}): Promise<{ chunkCount: number; charCount: number; docId: string }> {
  const text = await extractText(opts.buffer, opts.kind);
  if (!text.trim()) {
    throw new Error("Couldn't find any readable text in that file — is it a scanned image rather than real text?");
  }

  const chunks = chunkText(text);
  const embeddings = await embedBatch(chunks);
  const docId = crypto.randomUUID();

  const rows = chunks.map((content, i) => ({
    doc_id: docId,
    workspace: opts.workspace,
    filename: opts.filename,
    chunk_index: i,
    content,
    embedding: embeddings[i],
    uploaded_by: opts.uploadedBy,
  }));

  const { error } = await opts.supabase.from("uploaded_docs").insert(rows);
  if (error) throw new Error(`Couldn't save that document: ${error.message}`);

  return { chunkCount: rows.length, charCount: text.length, docId };
}

/**
 * The full content of one upload's chunks, in order — used to guarantee a
 * just-attached document is actually available to the very next question,
 * instead of leaving it to match_knowledge's similarity search. A vague
 * follow-up like "what's in this" or "summarize it" shares almost no
 * vocabulary with the document's own content, so it can legitimately score
 * below the relevance floor and get silently dropped otherwise — this
 * bypasses that entirely for a document the person just uploaded.
 */
export async function getUploadContent(
  supabase: any,
  docId: string
): Promise<{ filename: string; content: string } | null> {
  const { data, error } = await supabase
    .from("uploaded_docs")
    .select("filename, content, chunk_index")
    .eq("doc_id", docId)
    .order("chunk_index", { ascending: true });

  if (error || !data || data.length === 0) return null;
  return { filename: data[0].filename, content: data.map((r: { content: string }) => r.content).join("\n\n") };
}
