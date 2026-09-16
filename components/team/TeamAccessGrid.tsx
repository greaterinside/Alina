"use client";

import { useState, type FormEvent } from "react";
import clsx from "clsx";
import { UserPlus, Trash2, Copy, Check } from "lucide-react";
import { WORKSPACE_ORDER, WORKSPACES, type Role, type WorkspaceId } from "@/lib/types";

interface Member {
  user_id: string;
  name: string;
  role: Role;
  workspaces: WorkspaceId[];
}

const ROLES: Role[] = ["admin", "senior", "member"];

/**
 * Click a pill to grant/revoke that person's access to a workspace. Updates
 * optimistically, then reconciles with whatever /api/team/access actually
 * wrote (or reverts + shows the error if the write failed). Admins can also
 * invite new teammates, change anyone else's role, and remove anyone else
 * — never themselves, so an admin can't accidentally lock themselves out
 * with no one left to undo it.
 */
export function TeamAccessGrid({
  initialMembers,
  canEdit,
  currentUserId,
}: {
  initialMembers: Member[];
  canEdit: boolean;
  currentUserId: string | null;
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

  async function changeRole(userId: string, role: Role) {
    if (!canEdit || pending) return;
    setPending(`role:${userId}`);
    setRowError((prev) => ({ ...prev, [userId]: "" }));

    try {
      const res = await fetch("/api/team/role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Request failed: ${res.status}`);
      setMembers((prev) => prev.map((m) => (m.user_id === userId ? { ...m, role } : m)));
    } catch (err) {
      setRowError((prev) => ({
        ...prev,
        [userId]: err instanceof Error ? err.message : "Couldn't change role — try again.",
      }));
    } finally {
      setPending(null);
    }
  }

  async function remove(userId: string, name: string) {
    if (!canEdit || pending) return;
    if (!window.confirm(`Remove ${name}? They'll lose access to Alina entirely.`)) return;
    setPending(`remove:${userId}`);
    setRowError((prev) => ({ ...prev, [userId]: "" }));

    try {
      const res = await fetch("/api/team/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Request failed: ${res.status}`);
      setMembers((prev) => prev.filter((m) => m.user_id !== userId));
    } catch (err) {
      setRowError((prev) => ({
        ...prev,
        [userId]: err instanceof Error ? err.message : "Couldn't remove — try again.",
      }));
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {canEdit && (
        <InviteForm
          onInvited={(member) => setMembers((prev) => [...prev, member])}
        />
      )}

      <div className="card-chunky overflow-hidden">
        <div className="grid grid-cols-[1.4fr_1fr_1.6fr_auto] gap-3 bg-offwhite px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-navy/45">
          <span>Person</span>
          <span>Role</span>
          <span>Workspaces</span>
          <span />
        </div>
        {members.map((m) => {
          const isSelf = m.user_id === currentUserId;
          return (
            <div key={m.user_id} className="border-t border-navy/6 px-5 py-3.5">
              <div className="grid grid-cols-[1.4fr_1fr_1.6fr_auto] items-center gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-navy/8 text-[11px] font-semibold text-navy">
                    {m.name.slice(0, 2).toUpperCase()}
                  </span>
                  <p className="text-[13.5px] font-medium text-navy">{m.name}</p>
                </div>
                {canEdit && !isSelf ? (
                  <select
                    value={m.role}
                    disabled={pending === `role:${m.user_id}`}
                    onChange={(e) => changeRole(m.user_id, e.target.value as Role)}
                    className="w-fit rounded-lg border border-navy/12 bg-white px-2 py-1 text-[12.5px] capitalize text-charcoal/75 outline-none focus:border-terracotta/50"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-[12.5px] capitalize text-charcoal/65">
                    {m.role}
                    {isSelf && " (you)"}
                  </p>
                )}
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
                {canEdit && !isSelf ? (
                  <button
                    type="button"
                    disabled={pending === `remove:${m.user_id}`}
                    onClick={() => remove(m.user_id, m.name)}
                    title={`Remove ${m.name}`}
                    className="grid h-7 w-7 place-items-center rounded-lg text-charcoal/35 transition-colors hover:bg-terracotta/10 hover:text-terracotta disabled:cursor-wait disabled:opacity-50"
                  >
                    <Trash2 size={14} />
                  </button>
                ) : (
                  <span />
                )}
              </div>
              {rowError[m.user_id] && (
                <p className="mt-1.5 text-[11.5px] text-terracotta">{rowError[m.user_id]}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InviteForm({ onInvited }: { onInvited: (member: Member) => void }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Request failed: ${res.status}`);

      onInvited(data.member);
      setTempPassword(data.tempPassword);
      setEmail("");
      setName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't invite that person — try again.");
    } finally {
      setLoading(false);
    }
  }

  async function copyPassword() {
    if (!tempPassword) return;
    await navigator.clipboard.writeText(tempPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="card-chunky p-5">
      <p className="mb-3 text-[13.5px] font-semibold text-navy">Invite a teammate</p>
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2.5">
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          className="min-w-[140px] flex-1 rounded-xl border border-navy/12 bg-white px-3.5 py-2.5 text-[13px] text-navy outline-none focus:border-terracotta/50"
        />
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email@greaterinside.com"
          className="min-w-[200px] flex-1 rounded-xl border border-navy/12 bg-white px-3.5 py-2.5 text-[13px] text-navy outline-none focus:border-terracotta/50"
        />
        <button type="submit" disabled={loading} className="btn-cta">
          <UserPlus size={16} />
          {loading ? "Inviting…" : "Invite"}
        </button>
      </form>
      <p className="mt-2 text-[11.5px] text-charcoal/45">
        Starts with access to just Assistant, and role "member" — grant more below once they're added.
      </p>

      {error && (
        <p className="mt-3 rounded-2xl border border-terracotta/25 bg-terracotta/10 px-3.5 py-2.5 text-[12.5px] text-terracotta">
          {error}
        </p>
      )}

      {tempPassword && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-navy/12 bg-offwhite px-4 py-3">
          <div>
            <p className="text-[12px] font-medium text-navy">
              Added — send them this password directly (shown once, not saved anywhere):
            </p>
            <p className="mt-1 font-mono text-[14px] font-semibold text-navy">{tempPassword}</p>
          </div>
          <button
            type="button"
            onClick={copyPassword}
            className="grid h-8 w-8 flex-none place-items-center rounded-lg text-navy/50 transition-colors hover:bg-navy/8"
            title="Copy"
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
          </button>
        </div>
      )}
    </div>
  );
}
