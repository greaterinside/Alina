import { Route } from "lucide-react";
import { requireAdminIdentity } from "@/lib/admin-gate";
import { PageHeader } from "@/components/admin/PageHeader";

export default async function RoutingPage() {
  await requireAdminIdentity();

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <PageHeader
        title="Routing"
        subtitle="Where each incoming item goes, and what to do with the ones Alina is unsure about."
      />
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-navy/8 text-navy">
          <Route size={22} />
        </span>
        <p className="max-w-sm text-[14px] font-semibold text-navy">Rules are next up</p>
        <p className="max-w-sm text-[12.5px] leading-relaxed text-charcoal/55">
          Once Sources is wired to real connectors, rules will live here — what counts as a
          Tech, Social, or Support item, and which tag it gets filed under.
        </p>
      </div>
    </div>
  );
}
