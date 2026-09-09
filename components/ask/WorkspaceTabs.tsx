"use client";

import clsx from "clsx";
import { WORKSPACE_ORDER, WORKSPACES, type WorkspaceId } from "@/lib/types";

export function WorkspaceTabs({
  allowed,
  active,
  onChange,
}: {
  allowed: WorkspaceId[];
  active: WorkspaceId;
  onChange: (id: WorkspaceId) => void;
}) {
  const visible = WORKSPACE_ORDER.filter((id) => allowed.includes(id));
  if (visible.length <= 1) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {visible.map((id) => {
        const isActive = id === active;
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            className={clsx(
              "rounded-full px-4 py-2 text-[13px] font-semibold transition-all duration-150 active:scale-95",
              isActive
                ? "bg-navy text-white shadow-chunky-sm"
                : "border-2 border-navy/12 bg-white text-navy/70 hover:border-navy/25 hover:text-navy"
            )}
          >
            {WORKSPACES[id].name}
          </button>
        );
      })}
    </div>
  );
}
