"use client";

import { useEffect, useState } from "react";
import { X, Brain } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { WORKSPACES, WORKSPACE_ORDER, type WorkspaceId } from "@/lib/types";

interface Entry {
  workspace: WorkspaceId;
  notes: string;
}

/**
 * Minimal check/clear for personal memory — deliberately not the full
 * per-fact manage-memory UI (cut per explicit direction). Just enough that
 * a wrong auto-extracted "fact" isn't stuck silently coloring every future
 * answer with no way to undo it short of editing the database directly.
 */
export function MemoryPanel({ onClose }: { onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [clearing, setClearing] = useState<WorkspaceId | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setError("Supabase isn't configured in this environment.");
        setLoading(false);
        return;
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError("Sign in to see what Alina remembers about you.");
        setLoading(false);
        return;
      }
      const { data, error: queryError } = await supabase
        .from("user_preferences")
        .select("workspace, personal_notes")
        .eq("user_id", user.id);

      if (cancelled) return;
      if (queryError) {
        setError(queryError.message);
      } else {
        setUserId(user.id);
        setEntries(
          (data ?? [])
            .filter((row) => row.personal_notes)
            .map((row) => ({ workspace: row.workspace as WorkspaceId, notes: row.personal_notes as string }))
        );
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function clearWorkspace(workspace: WorkspaceId) {
    if (!userId) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setClearing(workspace);
    const { error: updateError } = await supabase
      .from("user_preferences")
      .update({ personal_notes: null })
      .eq("user_id", userId)
      .eq("workspace", workspace);
    setClearing(null);

    if (updateError) {
      setError(updateError.message);
    } else {
      setEntries((prev) => prev.filter((e) => e.workspace !== workspace));
    }
  }

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-50 bg-navy/30" aria-hidden />
      <div className="fixed inset-y-3 right-3 z-50 flex w-[calc(100%-1.5rem)] max-w-sm flex-col overflow-hidden rounded-3xl bg-white shadow-pop">
        <div className="flex flex-none items-center justify-between border-b border-navy/8 px-6 py-4">
          <div className="flex items-center gap-2">
            <Brain size={17} className="text-plum" />
            <p className="text-[14.5px] font-semibold text-navy">What Alina remembers</p>
          </div>
          <button
            onClick={onClose}
            className="grid h-8 w-8 flex-none place-items-center rounded-xl text-navy/50 transition-colors hover:bg-navy/5 hover:text-navy"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <p className="text-[13px] text-charcoal/45">Loading…</p>
          ) : error ? (
            <p className="rounded-2xl border border-terracotta/25 bg-terracotta/10 px-3.5 py-2.5 text-[12.5px] text-terracotta">
              {error}
            </p>
          ) : entries.length === 0 ? (
            <p className="text-[13px] text-charcoal/45">
              Nothing remembered yet — it builds up naturally as you use Ask.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {WORKSPACE_ORDER.filter((id) => entries.some((e) => e.workspace === id)).map((id) => {
                const entry = entries.find((e) => e.workspace === id)!;
                return (
                  <div key={id} className="rounded-2xl bg-offwhite p-3.5">
                    <div className="mb-1.5 flex items-center justify-between">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-navy/45">
                        {WORKSPACES[id].name}
                      </p>
                      <button
                        onClick={() => clearWorkspace(id)}
                        disabled={clearing === id}
                        className="text-[11px] font-semibold text-terracotta hover:text-terracotta/75 disabled:opacity-50"
                      >
                        {clearing === id ? "Clearing…" : "Clear"}
                      </button>
                    </div>
                    <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-charcoal">{entry.notes}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
