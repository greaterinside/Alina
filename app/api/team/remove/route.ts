import { NextRequest, NextResponse } from "next/server";
import { getCurrentIdentity } from "@/lib/identity";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

/**
 * Deletes the login entirely, not just the roles row — "remove" should
 * mean someone who's left genuinely has no access, not a downgrade to
 * least-privilege (which is what a missing roles row means for someone
 * still signed in, per lib/identity.ts). Also means the same email can
 * be invited again later without hitting "already registered."
 */
export async function POST(req: NextRequest) {
  const identity = await getCurrentIdentity();
  if (identity.role !== "admin") {
    return NextResponse.json({ error: "Only admins can remove teammates." }, { status: 403 });
  }

  const { userId } = (await req.json()) as { userId: string };
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }
  if (userId === identity.userId) {
    return NextResponse.json({ error: "You can't remove yourself." }, { status: 400 });
  }

  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase isn't configured on the server" }, { status: 503 });
  }

  const { error: roleError } = await supabase.from("roles").delete().eq("user_id", userId);
  if (roleError) {
    return NextResponse.json({ error: roleError.message }, { status: 500 });
  }

  const { error: authError } = await supabase.auth.admin.deleteUser(userId);
  if (authError) {
    return NextResponse.json({ error: `Role removed, but the login couldn't be deleted — ${authError.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
