"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sparkles,
  MessageCircleHeart,
  PlugZap,
  Route,
  Users,
} from "lucide-react";
import clsx from "clsx";
import type { Identity } from "@/lib/identity";
import { canSeeAdminSections, WORKSPACE_ORDER, WORKSPACES } from "@/lib/types";

const NAV = [
  { href: "/ask", label: "Ask", icon: MessageCircleHeart, admin: false },
  { href: "/sources", label: "Sources", icon: PlugZap, admin: true },
  { href: "/routing", label: "Routing", icon: Route, admin: true },
  { href: "/team", label: "Team", icon: Users, admin: true },
] as const;

export function Sidebar({ identity }: { identity: Identity }) {
  const pathname = usePathname();
  const showAdmin = canSeeAdminSections(identity.role);
  const items = NAV.filter((item) => !item.admin || showAdmin);

  return (
    <aside className="flex h-screen w-[248px] flex-none flex-col bg-navy text-white/90">
      <div className="flex items-center gap-2.5 px-5 pb-4 pt-6">
        <span className="grid h-9 w-9 flex-none place-items-center rounded-2xl bg-terracotta shadow-chunky-sm">
          <Sparkles size={18} className="text-white" />
        </span>
        <div className="leading-tight">
          <p className="text-[15px] font-bold tracking-tight text-white">Alina</p>
          <p className="text-[11px] text-white/55">Greater Inside</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pt-2">
        <p className="px-3 pb-2 pt-3 text-[10.5px] font-semibold uppercase tracking-wide text-white/35">
          {showAdmin ? "Workspace" : "Yours"}
        </p>
        <ul className="space-y-1">
          {items.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={clsx(
                    "group flex items-center gap-2.5 rounded-2xl px-3 py-2.5 text-[13.5px] font-medium transition-all duration-150",
                    active
                      ? "bg-white text-navy shadow-chunky-sm"
                      : "text-white/70 hover:bg-white/10 hover:text-white"
                  )}
                >
                  <Icon
                    size={17}
                    className={active ? "text-terracotta" : "text-white/55 group-hover:text-white"}
                  />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>

        {showAdmin && (
          <>
            <p className="px-3 pb-2 pt-6 text-[10.5px] font-semibold uppercase tracking-wide text-white/35">
              Knowledge
            </p>
            <ul className="space-y-1">
              {WORKSPACE_ORDER.map((id) => (
                <li key={id}>
                  <Link
                    href={`/ask?ws=${id}`}
                    className="flex items-center gap-2.5 rounded-2xl px-3 py-2 text-[12.5px] text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    <span className="h-1.5 w-1.5 flex-none rounded-full bg-terracotta/80" />
                    {WORKSPACES[id].name}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </nav>

      <div className="flex items-center gap-2.5 border-t border-white/10 px-4 py-3.5">
        <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-white/15 text-[11px] font-semibold text-white">
          {identity.name.slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-[12.5px] font-medium text-white">{identity.name}</p>
          <p className="truncate text-[10.5px] capitalize text-white/50">
            {identity.isDemo ? "Demo mode" : identity.role}
          </p>
        </div>
      </div>
    </aside>
  );
}
