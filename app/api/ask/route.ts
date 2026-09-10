import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient, getSupabaseServiceClient } from "@/lib/supabase/server";
import { getCurrentIdentity } from "@/lib/identity";
import {
  buildSystemPrompt,
  composeAnswer,
  composeReport,
  embedQuery,
  getUserPersonalization,
  getWorkspaceTone,
  matchKnowledge,
  SOURCE_LABELS,
} from "@/lib/rag";
import { WORKSPACES, type WorkspaceId } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Supabase/Postgrest errors (and some fetch failures) are plain objects,
 * not Error instances — `String(err)` on those collapses to the useless
 * "[object Object]". Pull out whatever message/detail fields exist instead.
 */
function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    const parts = [e.message, e.details, e.hint, e.code].filter(
      (v): v is string => typeof v === "string" && v.length > 0
    );
    if (parts.length > 0) return parts.join(" — ");
    try {
      return JSON.stringify(err);
    } catch {
      // fall through
    }
  }
  return String(err);
}

interface AskBody {
  workspace: WorkspaceId;
  mode: "chat" | "typing" | "report";
  message: string;
  history?: { role: "user" | "assistant"; content: string }[];
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as AskBody;
  const { workspace, mode, message, history = [] } = body;

  if (!workspace || !WORKSPACES[workspace] || !message?.trim()) {
    return NextResponse.json({ error: "workspace and message are required" }, { status: 400 });
  }

  // Named individually (rather than one collapsed boolean) so the fallback
  // message below can say exactly which one this deployment is missing,
  // instead of everyone re-guessing which of five keys didn't take.
  const missing: string[] = [];
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    missing.push("SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY)");
  }
  if (!process.env.OPENAI_API_KEY) missing.push("OPENAI_API_KEY");
  if (!process.env.ANTHROPIC_API_KEY) missing.push("ANTHROPIC_API_KEY");

  if (missing.length > 0) {
    return NextResponse.json({
      content:
        `I'm not connected to the real knowledge base yet — this deployment is missing: ${missing.join(", ")}. ` +
        "Add it in Vercel's Project Settings → Environment Variables (for the environment you're viewing) and redeploy. " +
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

    if (mode === "report") {
      const { title, summary, markdown } = await composeReport({
        systemPrompt,
        context: matches,
        history: history.map((h) => ({ role: h.role, content: h.content })),
        question: message,
      });

      return NextResponse.json({
        content: summary,
        report: { title, markdown },
      });
    }

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
    const detail = describeError(err);
    return NextResponse.json(
      {
        // Internal tool, not public-facing — surfacing the real error (a
        // short message, never a stack trace) beats another silent
        // "something went wrong" that hides which of five moving pieces
        // actually failed.
        content: `Something went wrong reaching the knowledge base: ${detail}`,
        provenance: [],
      },
      { status: 200 }
    );
  }
}
