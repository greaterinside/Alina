import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient, getSupabaseServiceClient } from "@/lib/supabase/server";
import { getCurrentIdentity } from "@/lib/identity";
import { ACCEPTED_UPLOAD_TYPES, MAX_UPLOAD_BYTES, ingestUpload } from "@/lib/documents";
import { WORKSPACES, type WorkspaceId } from "@/lib/types";

export const runtime = "nodejs";
// Embedding a long document can take a few seconds past a typical
// serverless default — same reasoning as /api/ask's maxDuration.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file");
  const workspace = form.get("workspace") as WorkspaceId | null;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file attached" }, { status: 400 });
  }
  if (!workspace || !WORKSPACES[workspace]) {
    return NextResponse.json({ error: "workspace is required" }, { status: 400 });
  }

  const kind = ACCEPTED_UPLOAD_TYPES[file.type as keyof typeof ACCEPTED_UPLOAD_TYPES];
  if (!kind) {
    return NextResponse.json(
      { error: "Only PDF, Word (.docx), and plain text/markdown files are supported right now." },
      { status: 400 }
    );
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `That file is too large — ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB max.` },
      { status: 400 }
    );
  }

  const identity = await getCurrentIdentity();
  if (!identity.workspaces.includes(workspace)) {
    return NextResponse.json({ error: "You don't have access to that workspace" }, { status: 403 });
  }

  const supabase = getSupabaseServiceClient() ?? (await getSupabaseServerClient());
  if (!supabase) {
    return NextResponse.json(
      { error: "Not connected to the knowledge base yet — Supabase env vars aren't configured on this deployment." },
      { status: 200 }
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const { chunkCount, charCount, docId } = await ingestUpload({
      supabase,
      buffer,
      filename: file.name,
      kind,
      workspace,
      uploadedBy: identity.userId,
    });

    return NextResponse.json({
      filename: file.name,
      workspace,
      chunkCount,
      charCount,
      docId,
    });
  } catch (err) {
    console.error("[/api/upload]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Something went wrong reading that file." },
      { status: 200 }
    );
  }
}
