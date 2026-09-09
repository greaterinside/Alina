"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  MessageCircleHeart,
  PlugZap,
  Route,
  Users,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import clsx from "clsx";
import type { Identity } from "@/lib/identity";
import { canSeeAdminSections, WORKSPACE_ORDER, WORKSPACES } from "@/lib/types";
import { GreaterInsideLogo, GreaterInsideMark } from "@/components/branding/GreaterInsideLogo";

const NAV = [
  { href: "/ask", label: "Ask", icon: MessageCircleHeart, admin: false },
  { href: "/sources", label: "Sources", icon: PlugZap, admin: true },
  { href: "/routing", label: "Routing", icon: Route, admin: true },
  { href: "/team", label: "Team", icon: Users, admin: true },
] as const;

const COLLAPSE_KEY = "alina-sidebar-collapsed";

export function Sidebar({
  identity,
  mobileOpen = false,
  onNavigate = () => {},
}: {
  identity: Identity;
  /** Whether the off-canvas drawer is open (ignored at md+, where the sidebar is always visible). */
  mobileOpen?: boolean;
  /** Called when a nav link is tapped — used to close the mobile drawer. */
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const showAdmin = canSeeAdminSections(identity.role);
  const items = NAV.filter((item) => !item.admin || showAdmin);

  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem(COLLAPSE_KEY) === "1") setCollapsed(true);
    } catch {
      // no-op — collapse just won't be remembered
    }
  }, []);
  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }

  return (
    <aside
      className={clsx(
        // No overflow-hidden here — the collapse toggle button below
        // deliberately sits half outside this box (-right-3), and an
        // overflow-hidden ancestor would clip it to a sliver. rounded-3xl
        // still rounds this element's own background/shadow regardless of
        // overflow; only the scrollable inner content needs clipping,
        // handled by the wrapper just inside this.
        "fixed inset-y-3 left-3 z-50 flex w-[252px] flex-none flex-col rounded-3xl bg-navy text-white/90 shadow-pop transition-transform duration-200 ease-out",
        "md:static md:inset-auto md:left-auto md:z-auto md:translate-x-0 md:shadow-pop md:transition-[width]",
        mobileOpen ? "translate-x-0" : "-translate-x-[120%]",
        collapsed ? "md:w-[76px]" : "md:w-[252px]"
      )}
    >
      <button
        onClick={toggle}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="absolute -right-3 top-8 z-10 hidden h-6 w-6 place-items-center rounded-full border border-navy/10 bg-white text-navy shadow-soft transition-transform hover:scale-105 active:scale-95 md:grid"
      >
        {collapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
      </button>

      <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden rounded-3xl">
      <div
        className={clsx(
          "flex items-center pb-5 pt-6",
          collapsed ? "justify-center px-0" : "gap-2 px-5"
        )}
      >
        {collapsed ? (
          <GreaterInsideMark size={30} />
        ) : (
          <GreaterInsideLogo variant="light" size={14} />
        )}
      </div>

      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3">
        {!collapsed && (
          <p className="px-2 pb-2 text-[10.5px] font-semibold uppercase tracking-wide text-white/35">
            {showAdmin ? "Workspace" : "Yours"}
          </p>
        )}
        <ul className="space-y-1 rounded-2xl bg-white/[0.05] p-1.5">
          {items.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(href + "/");
            return (
              <li key={href}>
                <Link
                  href={href}
                  onClick={onNavigate}
                  title={collapsed ? label : undefined}
                  className={clsx(
                    "group flex items-center rounded-xl py-2.5 text-[13.5px] font-medium transition-all duration-150",
                    collapsed ? "justify-center px-0" : "gap-2.5 px-3",
                    active
                      ? "bg-white text-navy shadow-soft"
                      : "text-white/65 hover:bg-white/[0.08] hover:text-white"
                  )}
                >
                  <Icon
                    size={17}
                    className={clsx(
                      "flex-none",
                      active ? "text-terracotta" : "text-white/55 group-hover:text-white"
                    )}
                  />
                  {!collapsed && label}
                </Link>
              </li>
            );
          })}
        </ul>

        {showAdmin && (
          <>
            {!collapsed && (
              <p className="px-2 pb-2 pt-5 text-[10.5px] font-semibold uppercase tracking-wide text-white/35">
                Knowledge
              </p>
            )}
            <ul
              className={clsx(
                "space-y-1 rounded-2xl bg-white/[0.05] p-1.5",
                collapsed && "mt-5"
              )}
            >
              {WORKSPACE_ORDER.map((id) => (
                <li key={id}>
                  <Link
                    href={`/ask?ws=${id}`}
                    onClick={onNavigate}
                    title={collapsed ? WORKSPACES[id].name : undefined}
                    className={clsx(
                      "flex items-center rounded-xl py-2 text-[12.5px] text-white/60 transition-colors hover:bg-white/[0.08] hover:text-white",
                      collapsed ? "justify-center px-0" : "gap-2.5 px-3"
                    )}
                  >
                    <span className="h-1.5 w-1.5 flex-none rounded-full bg-terracotta/80" />
                    {!collapsed && WORKSPACES[id].name}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </nav>

      <div className="px-3 pb-3">
        <Link
          href="/ask"
          onClick={onNavigate}
          title={collapsed ? "Ask Alina" : undefined}
          className={clsx(
            "flex items-center rounded-2xl bg-terracotta/15 text-terracotta transition-all duration-150 hover:bg-terracotta/20 active:scale-[0.98]",
            collapsed ? "justify-center p-2.5" : "gap-2.5 px-3.5 py-3"
          )}
        >
          <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-terracotta text-white shadow-cta">
            <Sparkles size={15} />
          </span>
          {!collapsed && (
            <span className="min-w-0 leading-tight">
              <span className="block text-[13px] font-semibold">Ask Alina</span>
              <span className="block text-[11px] text-terracotta/70">Get an instant answer</span>
            </span>
          )}
        </Link>
      </div>

      <div
        className={clsx(
          "flex items-center border-t border-white/10 py-3.5",
          collapsed ? "justify-center px-0" : "gap-2.5 px-4"
        )}
      >
        <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-white/15 text-[11px] font-semibold text-white">
          {identity.name.slice(0, 2).toUpperCase()}
        </span>
        {!collapsed && (
          <div className="min-w-0 leading-tight">
            <p className="truncate text-[12.5px] font-medium text-white">{identity.name}</p>
            <p className="truncate text-[10.5px] capitalize text-white/50">
              {identity.isDemo ? "Demo mode" : identity.role}
            </p>
          </div>
        )}
      </div>
      </div>
    </aside>
  );
}
