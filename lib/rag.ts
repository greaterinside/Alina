import type { WorkspaceId } from "@/lib/types";

const VOYAGE_MODEL = "voyage-3";
const ANSWER_MODEL = process.env.ALINA_MODEL || "claude-sonnet-5";

export interface KnowledgeMatch {
  id: string;
  content: string;
  source: string;
  title: string;
  meta: string;
  similarity: number;
}

/** Embeds a query with Voyage AI — the same embedding model match_knowledge was built against. */
export async function embedQuery(text: string): Promise<number[]> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) throw new Error("VOYAGE_API_KEY is not configured");

  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ input: [text], model: VOYAGE_MODEL, input_type: "query" }),
  });

  if (!res.ok) throw new Error(`Voyage embedding request failed: ${res.status}`);
  const data = await res.json();
  return data.data[0].embedding;
}

/**
 * Calls the existing `match_knowledge` Postgres function via RPC.
 * Expected signature: match_knowledge(query_embedding vector, workspace text, match_count int)
 * returning rows shaped like KnowledgeMatch. Adjust the RPC name/args here
 * if the live function's signature differs.
 */
export async function matchKnowledge(
  supabase: any,
  workspace: WorkspaceId,
  embedding: number[],
  matchCount = 6
): Promise<KnowledgeMatch[]> {
  const { data, error } = await supabase.rpc("match_knowledge", {
    query_embedding: embedding,
    workspace: workspace === "assistant" ? null : workspace,
    match_count: matchCount,
  });
  if (error) throw error;
  return data ?? [];
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
    "Cite the source of each claim inline using [cite:Short Title] right after the sentence it supports.",
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
    .map((c, i) => `[${i + 1}] (${c.source} — ${c.title})\n${c.content}`)
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
  return data.content?.[0]?.text ?? "";
}
