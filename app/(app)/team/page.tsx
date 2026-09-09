import { Users, AlertTriangle } from "lucide-react";
import { requireAdminIdentity } from "@/lib/admin-gate";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { WORKSPACE_ORDER, WORKSPACES, type Role, type WorkspaceId } from "@/lib/types";
import { PageHeader } from "@/components/admin/PageHeader";

export default async function TeamPage() {
  await requireAdminIdentity();

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
          <div className="card-chunky overflow-hidden">
            <div className="grid grid-cols-[1.4fr_1fr_1.6fr] gap-3 bg-offwhite px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-navy/45">
              <span>Person</span>
              <span>Role</span>
              <span>Workspaces</span>
            </div>
            {members.map((m) => (
              <div
                key={m.user_id}
                className="grid grid-cols-[1.4fr_1fr_1.6fr] items-center gap-3 border-t border-navy/6 px-5 py-3.5"
              >
                <div className="flex items-center gap-2.5">
                  <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-navy/8 text-[11px] font-semibold text-navy">
                    {m.name.slice(0, 2).toUpperCase()}
                  </span>
                  <p className="text-[13.5px] font-medium text-navy">{m.name}</p>
                </div>
                <p className="text-[12.5px] capitalize text-charcoal/65">{m.role}</p>
                <div className="flex flex-wrap gap-1.5">
                  {WORKSPACE_ORDER.map((id) => (
                    <span
                      key={id}
                      className={
                        m.workspaces?.includes(id)
                          ? "pill-tag"
                          : "inline-flex items-center rounded-full bg-navy/5 px-3 py-1 text-xs text-navy/30"
                      }
                    >
                      {WORKSPACES[id].name}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
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
