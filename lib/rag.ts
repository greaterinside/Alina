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
  "social.fathom_calls": "Call transcript",
  "social.testimonials": "Testimonial",
  "social.content_prompts": "Content prompt",
  "support.tickets": "Support ticket",
  "public.conversation_memory": "Past answer",
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
 * A past Alina answer (public.conversation_memory) is a weaker source
 * than a real doc/call/ticket — it's Alina's own prior output, not
 * independent evidence, so a loosely-related one is worse than none:
 * it risks the model treating its own earlier (possibly wrong) answer
 * as confirmation. Held to a stricter bar than everything else.
 */
const MIN_SIMILARITY_PAST_ANSWER = 0.5;
const PAST_ANSWER_SOURCE = "public.conversation_memory";

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
  return (data ?? []).filter((m: KnowledgeMatch) => {
    const floor = m.source_table === PAST_ANSWER_SOURCE ? MIN_SIMILARITY_PAST_ANSWER : MIN_SIMILARITY;
    return m.similarity >= floor;
  });
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
  lines.push(
    "Some context items are labeled \"Past answer — verify, don't treat as independent fact\": that's " +
      "something Alina said before, not a real doc/call/ticket. Use it for continuity and tone, but if it " +
      "conflicts with what the other sources actually say, trust the other sources — never let a past " +
      "answer confirm itself."
  );
  return lines.join("\n");
}

/**
 * Shared by composeAnswer and composeReport. Past-answer context
 * (public.conversation_memory) is tagged distinctly rather than blended
 * in as if it were an independent source — see the matching instruction
 * in buildSystemPrompt above. Without this the model can't tell "a real
 * doc says X" apart from "I said X before," which risks a wrong answer
 * getting retrieved as its own confirmation on a similar future question.
 */
function formatContextBlock(context: KnowledgeMatch[]): string {
  return context
    .map((c, i) => {
      const label = SOURCE_LABELS[c.source_table] ?? c.source_table;
      const tag = c.source_table === PAST_ANSWER_SOURCE ? `${label} — verify, don't treat as independent fact` : label;
      return `[${i + 1}] (${tag})\n${c.content_snippet}`;
    })
    .join("\n\n");
}

export async function composeAnswer(opts: {
  systemPrompt: string;
  context: KnowledgeMatch[];
  history: { role: "user" | "assistant"; content: string }[];
  question: string;
}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");

  const contextBlock = formatContextBlock(opts.context);

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

  const contextBlock = formatContextBlock(opts.context);

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

const MAX_PERSONAL_NOTES_CHARS = 1500;
const MAX_REMEMBERED_FACTS = 10;

/**
 * Reads a single message and decides whether it states a lasting personal
 * fact/preference worth remembering across future conversations — same
 * idea as ChatGPT/Claude's own memory feature, just scoped to one message
 * at a time rather than a whole conversation. Deliberately conservative:
 * a question or a one-off request is not a fact, and it's told never to
 * invent one that wasn't actually said.
 */
export async function extractPersonalFact(message: string): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: ANSWER_MODEL,
        max_tokens: 100,
        system:
          "You extract lasting personal facts or preferences from a single message — the kind worth " +
          "remembering across future conversations (their role, how they like answers phrased or " +
          "structured, a recurring workflow detail). Reply with ONLY the fact as one short plain " +
          "sentence written in third person (e.g. \"Prefers short, direct answers\"), or reply with " +
          "exactly NONE if this message doesn't state anything worth remembering long-term. A question " +
          "is not a fact. A one-off request is not a fact. Never invent one that wasn't actually said.",
        messages: [{ role: "user", content: message }],
      }),
    });
    if (!res.ok) return null;

    const data = await res.json();
    const text = (data.content ?? [])
      .filter((block: { type: string; text?: string }) => block.type === "text")
      .map((block: { text?: string }) => block.text ?? "")
      .join(" ")
      .trim();

    if (!text || text.toUpperCase() === "NONE") return null;
    return text;
  } catch (err) {
    console.error("[extractPersonalFact]", err);
    return null;
  }
}

/** Merges a newly-extracted fact into this person's personal_notes for a workspace, bounded so it can't grow unbounded. */
export async function rememberPersonalFact(
  supabase: any,
  userId: string,
  workspace: WorkspaceId,
  fact: string
): Promise<void> {
  try {
    const { data: existing } = await supabase
      .from("user_preferences")
      .select("personal_notes")
      .eq("user_id", userId)
      .eq("workspace", workspace)
      .maybeSingle();

    const priorLines = (existing?.personal_notes as string | undefined)?.split("\n").filter(Boolean) ?? [];
    if (priorLines.includes(fact)) return; // already remembered, don't duplicate

    const merged = [...priorLines, fact].slice(-MAX_REMEMBERED_FACTS).join("\n").slice(-MAX_PERSONAL_NOTES_CHARS);

    const { error } = await supabase
      .from("user_preferences")
      .upsert(
        { user_id: userId, workspace, personal_notes: merged, updated_at: new Date().toISOString() },
        { onConflict: "user_id,workspace" }
      );
    if (error) console.error("[rememberPersonalFact] upsert failed", error.message);
  } catch (err) {
    console.error("[rememberPersonalFact]", err);
  }
}

/**
 * Embeds a well-grounded chat exchange (one that actually had real
 * matches behind it) and saves it to public.conversation_memory, so the
 * same good answer can surface again for a related future question —
 * shared across the team, not per-person like user_preferences above.
 * Best-effort: a failure here never breaks the actual answer already
 * returned to the user.
 */
export async function rememberConversation(opts: {
  supabase: any;
  workspace: WorkspaceId;
  question: string;
  answer: string;
  askedBy?: string | null;
}): Promise<void> {
  try {
    const content = `Q: ${opts.question}\nA: ${opts.answer}`;
    const embedding = await embedQuery(content.slice(0, 8000));
    const { error } = await opts.supabase.from("conversation_memory").insert({
      workspace: opts.workspace,
      question: opts.question,
      answer: opts.answer,
      content,
      embedding,
      asked_by: opts.askedBy ?? null,
    });
    if (error) console.error("[rememberConversation] insert failed", error.message);
  } catch (err) {
    console.error("[rememberConversation]", err);
  }
}

/**
 * Saves one user/assistant exchange to public.chat_messages so this
 * person's conversation in this workspace is still there if they come
 * back days later — separate from rememberConversation above, which is
 * shared/searchable-by-anyone via similarity, not a per-person continuous
 * log. Runs for every mode (chat/typing/report), unlike the two memory
 * functions above which are chat-only. Best-effort, same as those.
 */
export async function saveChatExchange(opts: {
  supabase: any;
  userId: string;
  workspace: WorkspaceId;
  question: string;
  answer: string;
  report?: { title: string; markdown: string } | null;
}): Promise<void> {
  try {
    const { error } = await opts.supabase.from("chat_messages").insert([
      { user_id: opts.userId, workspace: opts.workspace, role: "user", content: opts.question },
      {
        user_id: opts.userId,
        workspace: opts.workspace,
        role: "assistant",
        content: opts.answer,
        report: opts.report ?? null,
      },
    ]);
    if (error) console.error("[saveChatExchange] insert failed", error.message);
  } catch (err) {
    console.error("[saveChatExchange]", err);
  }
}
