import { Users, AlertTriangle } from "lucide-react";
import { requireAdminIdentity } from "@/lib/admin-gate";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { type Role, type WorkspaceId } from "@/lib/types";
import { PageHeader } from "@/components/admin/PageHeader";
import { TeamAccessGrid } from "@/components/team/TeamAccessGrid";

export default async function TeamPage() {
  const identity = await requireAdminIdentity();

  const supabase = await getSupabaseServerClient();
  const { data, error } = supabase
    ? await supabase.from("roles").select("user_id, name, role, workspaces")
    : { data: null, error: null };

  const members = (data ?? []) as {
    user_id: string;
    name: string;
    role: Role;
    workspaces: WorkspaceId[];
  }[];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader title="Team" subtitle="Who can query what, based on real roles." />
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {!supabase ? (
          <EmptyNotice
            icon={<AlertTriangle size={22} />}
            title="Supabase isn't connected in this environment"
            body="NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY aren't set here — add them (locally in .env.local, and in Vercel's Project Settings → Environment Variables for the deployed site) to load real team data."
          />
        ) : error ? (
          <EmptyNotice
            icon={<AlertTriangle size={22} />}
            title="Couldn't read public.roles"
            body={`Supabase is connected, but the query failed: "${error.message}". If that says the relation doesn't exist, the roles table hasn't been created in this project yet — run supabase/migrations/0001_roles_and_prompts.sql against it (Supabase dashboard → SQL Editor), then add a row per team member.`}
          />
        ) : members.length === 0 ? (
          <EmptyNotice
            icon={<Users size={22} />}
            title="No team members yet"
            body="public.roles exists and is reachable, but has no rows. Add one per team member — this table reads live, nothing here is placeholder data."
          />
        ) : (
          <>
            <TeamAccessGrid initialMembers={members} canEdit={identity.role === "admin"} />
            {identity.role !== "admin" && (
              <p className="mt-3 text-[12px] text-charcoal/50">
                Only admins can change who has access to which workspace — you can view this as a
                senior teammate.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function EmptyNotice({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-navy/8 text-navy">
        {icon}
      </span>
      <p className="max-w-md text-[14px] font-semibold text-navy">{title}</p>
      <p className="max-w-md text-[12.5px] leading-relaxed text-charcoal/55">{body}</p>
    </div>
  );
}
