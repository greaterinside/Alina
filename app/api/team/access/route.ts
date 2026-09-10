import { NextRequest, NextResponse } from "next/server";
import { getCurrentIdentity } from "@/lib/identity";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { WORKSPACES, type WorkspaceId } from "@/lib/types";

interface AccessBody {
  userId: string;
  workspace: WorkspaceId;
  grant: boolean;
}

export async function POST(req: NextRequest) {
  const identity = await getCurrentIdentity();
  if (identity.role !== "admin") {
    return NextResponse.json({ error: "Only admins can change workspace access." }, { status: 403 });
  }

  const { userId, workspace, grant } = (await req.json()) as AccessBody;
  if (!userId || !workspace || !WORKSPACES[workspace] || typeof grant !== "boolean") {
    return NextResponse.json({ error: "userId, workspace, and grant are required" }, { status: 400 });
  }

  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase isn't configured on the server" }, { status: 503 });
  }

  const { data: row, error: readError } = await supabase
    .from("roles")
    .select("workspaces")
    .eq("user_id", userId)
    .maybeSingle();

  if (readError || !row) {
    return NextResponse.json(
      { error: readError?.message ?? "No role row found for this person" },
      { status: 404 }
    );
  }

  const current: WorkspaceId[] = row.workspaces ?? [];
  const next = grant
    ? current.includes(workspace)
      ? current
      : [...current, workspace]
    : current.filter((w) => w !== workspace);

  const { error: writeError } = await supabase
    .from("roles")
    .update({ workspaces: next })
    .eq("user_id", userId);

  if (writeError) {
    return NextResponse.json({ error: writeError.message }, { status: 500 });
  }

  return NextResponse.json({ workspaces: next });
}
