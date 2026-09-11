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
              "rounded-full px-4 py-2 text-[13px] font-semibold backdrop-blur-xl transition-all duration-150 active:scale-95",
              isActive
                ? "border border-white/25 bg-white/20 text-white"
                : "border border-white/12 bg-white/[0.06] text-white/60 hover:border-white/25 hover:text-white"
            )}
          >
            {WORKSPACES[id].name}
          </button>
        );
      })}
    </div>
  );
}
