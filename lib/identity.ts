import { getSupabaseServerClient } from "@/lib/supabase/server";
import { WORKSPACE_ORDER, type Role, type WorkspaceId } from "@/lib/types";

export interface Identity {
  userId: string | null;
  name: string;
  email: string;
  role: Role;
  workspaces: WorkspaceId[];
  /** True when this is a placeholder identity because Supabase isn't wired up yet. */
  isDemo: boolean;
}

const DEMO_IDENTITY: Identity = {
  userId: null,
  name: "You",
  email: "",
  role: "admin",
  workspaces: WORKSPACE_ORDER,
  isDemo: true,
};

/**
 * Resolves the signed-in team member's role and workspace access from the
 * `public.roles` table (see supabase/migrations/0001_roles_and_prompts.sql).
 *
 * Falls back to a demo admin identity when Supabase isn't configured yet,
 * or when a session has no matching row — so the shell is always browsable,
 * but never pretends a real person has a role they don't.
 */
export async function getCurrentIdentity(): Promise<Identity> {
  const supabase = await getSupabaseServerClient();
  if (!supabase) return DEMO_IDENTITY;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return DEMO_IDENTITY;

  const { data, error } = await supabase
    .from("roles")
    .select("role, workspaces, name")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !data) {
    // Signed in, but no role row yet: least-privilege, not demo-admin.
    return {
      userId: user.id,
      name: user.email ?? "Team member",
      email: user.email ?? "",
      role: "member",
      workspaces: ["assistant"],
      isDemo: false,
    };
  }

  return {
    userId: user.id,
    name: data.name ?? user.email ?? "Team member",
    email: user.email ?? "",
    role: (data.role as Role) ?? "member",
    workspaces: (data.workspaces as WorkspaceId[]) ?? ["assistant"],
    isDemo: false,
  };
}
