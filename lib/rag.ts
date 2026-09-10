import type { WorkspaceId } from "@/lib/types";

// Switched from Voyage AI after persistent account-access problems.
// text-embedding-3-small's `dimensions` param is pinned to 1024 to match
// the existing vector(1024) columns — no schema migration needed.
const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1024;
const ANSWER_MODEL = process.env.ALINA_MODEL || "claude-sonnet-5";

/**
 * Human-readable labels for match_knowledge's `source_table` values. Keep
 * this in sync with scripts/backfill-embeddings.mjs's SOURCES list — both
 * enumerate the same six tables.
 */
export const SOURCE_LABELS: Record<string, string> = {
  "tech.notes": "Tech note",
  "tech.meeting_notes": "Meeting notes",
  "tech.github_docs": "GitHub doc",
  "social.recordings": "Recording",
  "social.testimonials": "Testimonial",
  "social.content_prompts": "Content prompt",
  "support.tickets": "Support ticket",
};

/** Row shape returned by the real public.match_knowledge Postgres function. */
export interface KnowledgeMatch {
  source_table: string;
  source_id: string;
  content_snippet: string;
  similarity: number;
}

/**
 * Embeds a query with OpenAI. Unlike Voyage, OpenAI's embedding models
 * don't have a separate query/document mode — the same call shape embeds
 * both sides, which is also what scripts/backfill-embeddings.mjs and
 * scripts/ingest-github.mjs use for the stored rows.
 */
export async function embedQuery(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ input: [text], model: EMBEDDING_MODEL, dimensions: EMBEDDING_DIMENSIONS }),
  });

  if (!res.ok) throw new Error(`OpenAI embedding request failed: ${res.status}`);
  const data = await res.json();
  return data.data[0].embedding;
}

/**
 * match_knowledge itself has no relevance floor — it always returns its
 * top match_count rows by similarity, even when the best one is barely
 * related to the question (e.g. a repo that hasn't been ingested yet).
 * Filtering here, rather than in the SQL function, means this can be
 * tuned without another manual migration.
 */
const MIN_SIMILARITY = 0.3;

/**
 * Calls the real public.match_knowledge(query_embedding, match_count,
 * workspace_filter) — returns RETURNS TABLE(source_table, source_id,
 * content_snippet, similarity). workspace_filter is 'tech' | 'social' |
 * 'support' | null; Assistant (cross-cutting) passes null to search
 * everything, matching the function's own "no filter" behavior.
 */
export async function matchKnowledge(
  supabase: any,
  workspace: WorkspaceId,
  embedding: number[],
  matchCount = 6
): Promise<KnowledgeMatch[]> {
  const { data, error } = await supabase.rpc("match_knowledge", {
    query_embedding: embedding,
    match_count: matchCount,
    workspace_filter: workspace === "assistant" ? null : workspace,
  });
  if (error) throw error;
  return (data ?? []).filter((m: KnowledgeMatch) => m.similarity >= MIN_SIMILARITY);
}

export async function getWorkspaceTone(supabase: any, workspace: WorkspaceId) {
  const { data } = await supabase
    .from("workspace_prompts")
    .select("system_prompt, label")
    .eq("workspace", workspace)
    .maybeSingle();
  return data as { system_prompt: string; label: string } | null;
}

export async function getUserPersonalization(supabase: any, userId: string, workspace: WorkspaceId) {
  const { data } = await supabase
    .from("user_preferences")
    .select("personal_notes")
    .eq("user_id", userId)
    .eq("workspace", workspace)
    .maybeSingle();
  return data?.personal_notes as string | undefined;
}

export function buildSystemPrompt(opts: {
  workspaceLabel: string;
  masterTone?: string;
  personalNotes?: string;
}) {
  const lines = [
    `You are Alina, the internal knowledge assistant for Greater Inside, answering inside the ${opts.workspaceLabel} workspace.`,
    "Answer only from the provided context. If the context doesn't cover it, say so plainly instead of guessing.",
    "Answer directly and plainly — no inline citation markers or source tags, just the answer itself.",
    "Be warm, direct, and useful — never corporate or vague.",
  ];
  if (opts.masterTone) {
    lines.push(`House tone for this workspace: ${opts.masterTone}`);
  }
  if (opts.personalNotes) {
    lines.push(`This teammate's personal preferences (layered on top of the house tone, never overriding facts): ${opts.personalNotes}`);
  }
  return lines.join("\n");
}

export async function composeAnswer(opts: {
  systemPrompt: string;
  context: KnowledgeMatch[];
  history: { role: "user" | "assistant"; content: string }[];
  question: string;
}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");

  const contextBlock = opts.context
    .map((c, i) => `[${i + 1}] (${SOURCE_LABELS[c.source_table] ?? c.source_table})\n${c.content_snippet}`)
    .join("\n\n");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: ANSWER_MODEL,
      max_tokens: 1024,
      system: `${opts.systemPrompt}\n\nContext:\n${contextBlock}`,
      messages: [...opts.history, { role: "user", content: opts.question }],
    }),
  });

  if (!res.ok) throw new Error(`Answer generation failed: ${res.status}`);
  const data = await res.json();

  // Anthropic's response can include non-text blocks (e.g. thinking) ahead
  // of the actual answer — content[0] isn't reliably the text block, so
  // grab every text block instead of assuming position.
  const text = (data.content ?? [])
    .filter((block: { type: string; text?: string }) => block.type === "text")
    .map((block: { text?: string }) => block.text ?? "")
    .join("\n")
    .trim();

  if (!text) {
    console.error("[composeAnswer] no text block in response", JSON.stringify(data).slice(0, 500));
    return "I found relevant context but couldn't compose an answer from it — try rephrasing the question.";
  }
  return text;
}

/**
 * Same pipeline as composeAnswer, but asks for a full report instead of a
 * short reply: a title, a two-sentence summary (shown as the chat message,
 * same idea as Claude's artifact blurb), and the full report body as
 * Markdown (rendered in a preview panel, exportable to .docx).
 */
export async function composeReport(opts: {
  systemPrompt: string;
  context: KnowledgeMatch[];
  history: { role: "user" | "assistant"; content: string }[];
  question: string;
}): Promise<{ title: string; summary: string; markdown: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");

  const contextBlock = opts.context
    .map((c, i) => `[${i + 1}] (${SOURCE_LABELS[c.source_table] ?? c.source_table})\n${c.content_snippet}`)
    .join("\n\n");

  const reportInstructions = [
    "The user is asking for a REPORT, not a quick chat reply.",
    "Reply in exactly this format, with nothing before or after it:",
    "TITLE: <a short, specific report title — plain text, no markdown>",
    "SUMMARY: <exactly two plain sentences summarizing what the report covers — plain text, no markdown, this is shown as the chat message>",
    "---",
    "<the full report body as Markdown: use ## headings to break it into sections, plain paragraphs, bold, and bullet/numbered lists where useful. Don't repeat the title as a heading. Keep formatting simple — no tables, no nested lists.>",
  ].join("\n");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: ANSWER_MODEL,
      max_tokens: 4096,
      system: `${opts.systemPrompt}\n\n${reportInstructions}\n\nContext:\n${contextBlock}`,
      messages: [...opts.history, { role: "user", content: opts.question }],
    }),
  });

  if (!res.ok) throw new Error(`Report generation failed: ${res.status}`);
  const data = await res.json();

  const text = (data.content ?? [])
    .filter((block: { type: string; text?: string }) => block.type === "text")
    .map((block: { text?: string }) => block.text ?? "")
    .join("\n")
    .trim();

  if (!text) {
    console.error("[composeReport] no text block in response", JSON.stringify(data).slice(0, 500));
    return {
      title: "Report",
      summary: "I found relevant context but couldn't put the report together — try rephrasing.",
      markdown: "",
    };
  }

  return parseReportResponse(text);
}

function parseReportResponse(text: string): { title: string; summary: string; markdown: string } {
  const titleMatch = text.match(/^TITLE:\s*(.+)$/m);
  const summaryMatch = text.match(/^SUMMARY:\s*([\s\S]*?)(?=\n---\n)/m);
  const bodyMatch = text.match(/\n---\n([\s\S]*)$/);

  if (titleMatch && summaryMatch && bodyMatch) {
    return {
      title: titleMatch[1].trim(),
      summary: summaryMatch[1].trim().replace(/\s+/g, " "),
      markdown: bodyMatch[1].trim(),
    };
  }

  // The model didn't follow the TITLE/SUMMARY/--- format exactly — fall
  // back to treating the whole reply as the report body rather than
  // losing the content.
  return {
    title: "Report",
    summary: "Here's the report — open the preview to see the full thing.",
    markdown: text,
  };
}
