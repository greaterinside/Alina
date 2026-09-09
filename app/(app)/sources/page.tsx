import { PlugZap } from "lucide-react";
import { requireAdminIdentity } from "@/lib/admin-gate";
import { getConnectors } from "@/lib/connectors";
import { PageHeader } from "@/components/admin/PageHeader";

export default async function SourcesPage() {
  await requireAdminIdentity();
  const connectors = getConnectors();

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader
        title="Sources"
        subtitle="What feeds Alina, and how often. Nobody uploads anything by hand."
      />
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <p className="pill-tag mb-4">Available to connect</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {connectors.map((c) => (
            <div key={c.id} className="card-chunky flex flex-col gap-3 p-4">
              <div className="flex items-center gap-2.5">
                <span className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-navy/8 text-navy">
                  <PlugZap size={16} />
                </span>
                <p className="text-[14px] font-semibold text-navy">{c.name}</p>
              </div>
              <p className="min-h-[40px] text-[12.5px] leading-relaxed text-charcoal/60">
                {c.description}
              </p>
              <button
                disabled
                title="Connector setup is next up — not wired to a real OAuth flow yet"
                className="btn-ghost mt-auto w-full cursor-not-allowed py-2 text-[12.5px] opacity-60"
              >
                Connect {c.name}
              </button>
            </div>
          ))}
        </div>
        <p className="mt-6 max-w-xl text-[12.5px] text-charcoal/45">
          This screen is scaffolded and ready — the next phase wires each card to a real OAuth
          connection and shows genuinely "Connected" once a token exists, never before.
        </p>
      </div>
    </div>
  );
}
