"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { GreaterInsideLogo } from "@/components/branding/GreaterInsideLogo";
import type { Identity } from "@/lib/identity";

/**
 * Owns the mobile drawer state for the sidebar. Below the md breakpoint
 * the sidebar becomes an off-canvas drawer (opened via the hamburger
 * button here) instead of a permanent column, since there isn't room for
 * both it and real content on a phone-width screen.
 */
export function AppShell({
  identity,
  children,
}: {
  identity: Identity;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen w-full gap-3 overflow-hidden bg-[#E9E9E6] p-3">
      <Sidebar
        identity={identity}
        mobileOpen={mobileOpen}
        onNavigate={() => setMobileOpen(false)}
      />

      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-navy/40 md:hidden"
          aria-hidden
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex flex-none items-center gap-3 pb-2.5 md:hidden">
          <button
            onClick={() => setMobileOpen(true)}
            className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-navy text-white shadow-soft"
          >
            <Menu size={17} />
          </button>
          <GreaterInsideLogo variant="dark" size={11} />
        </div>

        <main className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl bg-offwhite shadow-soft">
          {children}
        </main>
      </div>
    </div>
  );
}
