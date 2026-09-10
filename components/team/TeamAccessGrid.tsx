"use client";

import { useState } from "react";
import clsx from "clsx";
import { WORKSPACE_ORDER, WORKSPACES, type Role, type WorkspaceId } from "@/lib/types";

interface Member {
  user_id: string;
  name: string;
  role: Role;
  workspaces: WorkspaceId[];
}

/**
 * Click a pill to grant/revoke that person's access to a workspace. Updates
 * optimistically, then reconciles with whatever /api/team/access actually
 * wrote (or reverts + shows the error if the write failed).
 */
export function TeamAccessGrid({
  initialMembers,
  canEdit,
}: {
  initialMembers: Member[];
  canEdit: boolean;
}) {
  const [members, setMembers] = useState(initialMembers);
  const [pending, setPending] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});

  async function toggle(userId: string, workspace: WorkspaceId, currentlyGranted: boolean) {
    if (!canEdit || pending) return;
    const key = `${userId}:${workspace}`;
    setPending(key);
    setRowError((prev) => ({ ...prev, [userId]: "" }));

    setMembers((prev) =>
      prev.map((m) =>
        m.user_id === userId
          ? {
              ...m,
              workspaces: currentlyGranted
                ? m.workspaces.filter((w) => w !== workspace)
                : [...m.workspaces, workspace],
            }
          : m
      )
    );

    try {
      const res = await fetch("/api/team/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, workspace, grant: !currentlyGranted }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Request failed: ${res.status}`);

      setMembers((prev) =>
        prev.map((m) => (m.user_id === userId ? { ...m, workspaces: data.workspaces } : m))
      );
    } catch (err) {
      setMembers((prev) =>
        prev.map((m) =>
          m.user_id === userId
            ? {
                ...m,
                workspaces: currentlyGranted
                  ? [...m.workspaces, workspace]
                  : m.workspaces.filter((w) => w !== workspace),
              }
            : m
        )
      );
      setRowError((prev) => ({
        ...prev,
        [userId]: err instanceof Error ? err.message : "Couldn't update access — try again.",
      }));
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="card-chunky overflow-hidden">
      <div className="grid grid-cols-[1.4fr_1fr_1.6fr] gap-3 bg-offwhite px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-navy/45">
        <span>Person</span>
        <span>Role</span>
        <span>Workspaces</span>
      </div>
      {members.map((m) => (
        <div key={m.user_id} className="border-t border-navy/6 px-5 py-3.5">
          <div className="grid grid-cols-[1.4fr_1fr_1.6fr] items-center gap-3">
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-navy/8 text-[11px] font-semibold text-navy">
                {m.name.slice(0, 2).toUpperCase()}
              </span>
              <p className="text-[13.5px] font-medium text-navy">{m.name}</p>
            </div>
            <p className="text-[12.5px] capitalize text-charcoal/65">{m.role}</p>
            <div className="flex flex-wrap gap-1.5">
              {WORKSPACE_ORDER.map((id) => {
                const granted = Boolean(m.workspaces?.includes(id));
                const key = `${m.user_id}:${id}`;
                const isPending = pending === key;
                return (
                  <button
                    key={id}
                    type="button"
                    disabled={!canEdit || isPending}
                    onClick={() => toggle(m.user_id, id, granted)}
                    title={
                      !canEdit
                        ? granted
                          ? `${m.name} has access to ${WORKSPACES[id].name}`
                          : `${m.name} doesn't have access to ${WORKSPACES[id].name}`
                        : granted
                        ? `Click to remove ${m.name}'s access to ${WORKSPACES[id].name}`
                        : `Click to give ${m.name} access to ${WORKSPACES[id].name}`
                    }
                    className={clsx(
                      "rounded-full px-3 py-1 text-xs font-medium transition-all",
                      granted ? "pill-tag" : "bg-navy/5 text-navy/30",
                      canEdit && !isPending && "cursor-pointer hover:opacity-80 active:scale-95",
                      isPending && "cursor-wait opacity-50",
                      !canEdit && "cursor-default"
                    )}
                  >
                    {WORKSPACES[id].name}
                  </button>
                );
              })}
            </div>
          </div>
          {rowError[m.user_id] && (
            <p className="mt-1.5 text-[11.5px] text-terracotta">{rowError[m.user_id]}</p>
          )}
        </div>
      ))}
    </div>
  );
}
