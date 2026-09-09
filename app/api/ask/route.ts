import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient, getSupabaseServiceClient } from "@/lib/supabase/server";
import { getCurrentIdentity } from "@/lib/identity";
import {
  buildSystemPrompt,
  composeAnswer,
  embedQuery,
  getUserPersonalization,
  getWorkspaceTone,
  matchKnowledge,
  SOURCE_LABELS,
} from "@/lib/rag";
import { WORKSPACES, type WorkspaceId } from "@/lib/types";

export const runtime = "nodejs";

interface AskBody {
  workspace: WorkspaceId;
  mode: "chat" | "typing";
  message: string;
  history?: { role: "user" | "assistant"; content: string }[];
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as AskBody;
  const { workspace, message, history = [] } = body;

  if (!workspace || !WORKSPACES[workspace] || !message?.trim()) {
    return NextResponse.json({ error: "workspace and message are required" }, { status: 400 });
  }

  const configured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) &&
      process.env.VOYAGE_API_KEY &&
      process.env.ANTHROPIC_API_KEY
  );

  if (!configured) {
    return NextResponse.json({
      content:
        "I'm not connected to the real knowledge base yet — an admin needs to add the Supabase, Voyage, and Anthropic keys for this environment (see .env.example). " +
        "Once that's wired up, I'll answer this from your team's actual sources instead of telling you this.",
      provenance: [],
    });
  }

  try {
    const supabase = getSupabaseServiceClient() ?? (await getSupabaseServerClient());
    if (!supabase) throw new Error("Supabase client unavailable");

    const identity = await getCurrentIdentity();

    const [embedding, tone, personalNotes] = await Promise.all([
      embedQuery(message),
      getWorkspaceTone(supabase, workspace),
      identity.userId ? getUserPersonalization(supabase, identity.userId, workspace) : Promise.resolve(undefined),
    ]);

    const matches = await matchKnowledge(supabase, workspace, embedding);

    const systemPrompt = buildSystemPrompt({
      workspaceLabel: WORKSPACES[workspace].name,
      masterTone: tone?.system_prompt,
      personalNotes,
    });

    const content = await composeAnswer({
      systemPrompt,
      context: matches,
      history: history.map((h) => ({ role: h.role, content: h.content })),
      question: message,
    });

    return NextResponse.json({
      content,
      provenance: matches.slice(0, 4).map((m) => ({
        source: SOURCE_LABELS[m.source_table] ?? m.source_table,
        title: m.content_snippet.length > 80 ? m.content_snippet.slice(0, 77) + "…" : m.content_snippet,
        meta: `${Math.round(m.similarity * 100)}% match`,
      })),
    });
  } catch (err) {
    console.error("[/api/ask]", err);
    return NextResponse.json(
      {
        content:
          "Something went wrong reaching the knowledge base just now. That's on my end — try again in a moment.",
        provenance: [],
      },
      { status: 200 }
    );
  }
}
