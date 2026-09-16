import { NextRequest, NextResponse } from "next/server";
import { getCurrentIdentity } from "@/lib/identity";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { WORKSPACE_ORDER, type Role } from "@/lib/types";

const VALID_ROLES: Role[] = ["admin", "ai engineer", "content"];

export async function POST(req: NextRequest) {
  const identity = await getCurrentIdentity();
  if (identity.role !== "admin") {
    return NextResponse.json({ error: "Only admins can change roles." }, { status: 403 });
  }

  const { userId, role } = (await req.json()) as { userId: string; role: Role };
  if (!userId || !VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: "userId and a valid role are required" }, { status: 400 });
  }
  if (userId === identity.userId) {
    return NextResponse.json({ error: "You can't change your own role." }, { status: 400 });
  }

  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase isn't configured on the server" }, { status: 503 });
  }

  // Admin means full control — keep the stored workspaces array honest
  // with that rather than leaving it partial and relying purely on
  // lib/identity.ts's runtime override to paper over it (that's still
  // there as the actual enforcement; this just keeps what Team displays,
  // and the raw table itself, from looking wrong).
  const update = role === "admin" ? { role, workspaces: WORKSPACE_ORDER } : { role };

  const { error } = await supabase.from("roles").update(update).eq("user_id", userId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(update);
}
