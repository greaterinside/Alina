import { NextRequest, NextResponse } from "next/server";
import { getCurrentIdentity } from "@/lib/identity";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { type Role } from "@/lib/types";

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

  const { error } = await supabase.from("roles").update({ role }).eq("user_id", userId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ role });
}
