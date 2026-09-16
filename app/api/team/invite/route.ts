import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getCurrentIdentity } from "@/lib/identity";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { type Role } from "@/lib/types";

interface InviteBody {
  email: string;
  name: string;
  role?: Role;
}

/** 12 chars, letters/digits only — easy to relay by hand, no ambiguous symbols. */
function generateTempPassword(): string {
  return randomBytes(9).toString("base64").replace(/[^a-zA-Z0-9]/g, "").slice(0, 12);
}

/**
 * Creates the login directly (password-based, same as every other account
 * in this app — LoginForm.tsx has no magic-link/invite-email flow to land
 * on) rather than emailing an invite link, so there's no new "accept
 * invite" page to build. The temp password is returned once for the
 * admin to relay to the new teammate themselves.
 */
export async function POST(req: NextRequest) {
  const identity = await getCurrentIdentity();
  if (identity.role !== "admin") {
    return NextResponse.json({ error: "Only admins can invite teammates." }, { status: 403 });
  }

  const { email, name, role } = (await req.json()) as InviteBody;
  if (!email?.trim() || !name?.trim()) {
    return NextResponse.json({ error: "email and name are required" }, { status: 400 });
  }

  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase isn't configured on the server" }, { status: 503 });
  }

  const tempPassword = generateTempPassword();
  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email: email.trim(),
    password: tempPassword,
    email_confirm: true,
  });
  if (createError || !created?.user) {
    return NextResponse.json({ error: createError?.message ?? "Couldn't create the login" }, { status: 400 });
  }

  const { error: roleError } = await supabase.from("roles").insert({
    user_id: created.user.id,
    name: name.trim(),
    role: role ?? "member",
    workspaces: ["assistant"],
  });
  if (roleError) {
    // Login exists but has no role row — clean it back up rather than leaving an orphaned account.
    await supabase.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: roleError.message }, { status: 500 });
  }

  return NextResponse.json({
    member: { user_id: created.user.id, name: name.trim(), role: role ?? "member", workspaces: ["assistant"] },
    tempPassword,
  });
}
