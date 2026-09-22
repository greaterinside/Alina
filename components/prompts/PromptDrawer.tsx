"use client";

import { useEffect, useState } from "react";
import { X, Search, Plus, Pencil, Trash2, Sparkles, ArrowRight } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { extractPromptVariables, hydratePromptVariables } from "@/lib/saved-prompts";
import { WORKSPACES, type SavedPrompt, type WorkspaceId } from "@/lib/types";

type View = "list" | "form" | "hydrate";

/**
 * Slide-over for saved prompt templates — deliberately the same light
 * card style as MemoryPanel/ReportPreviewPanel, even though it's opened
 * from the dark Ask screen; every slide-over in this app is a light card
 * regardless of what screen opened it.
 *
 * Scoped to ONE workspace at a time (the one currently active in Ask),
 * same as personal_notes/workspace_prompts — a prompt saved under Social
 * only shows up there, not in Tech.
 */
export function PromptDrawer({
  open,
  onClose,
  workspace,
  currentInput,
  onUsePrompt,
}: {
  open: boolean;
  onClose: () => void;
  workspace: WorkspaceId;
  /** Whatever's currently typed in the composer — offered as a starting point when writing a new prompt. */
  currentInput: string;
  onUsePrompt: (hydratedText: string) => void;
}) {
  const [userId, setUserId] = useState<string | null>(null);
  const [prompts, setPrompts] = useState<SavedPrompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [view, setView] = useState<View>("list");
  const [editing, setEditing] = useState<SavedPrompt | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formBody, setFormBody] = useState("");
  const [formShared, setFormShared] = useState(false);
  const [saving, setSaving] = useState(false);

  const [hydrating, setHydrating] = useState<SavedPrompt | null>(null);
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setView("list");
    setSearch("");
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workspace]);

  async function load() {
    setLoading(true);
    setError(null);
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
      setError("Sign in to use saved prompts.");
      setLoading(false);
      return;
    }
    setUserId(user.id);

    // RLS returns exactly what this person can see: their own rows plus
    // anyone else's shared rows for this workspace — no extra filtering needed here.
    const { data, error: queryError } = await supabase
      .from("saved_prompts")
      .select("id, user_id, workspace, title, body, is_shared, created_at")
      .eq("workspace", workspace)
      .order("created_at", { ascending: false });

    if (queryError) setError(queryError.message);
    else setPrompts((data ?? []) as SavedPrompt[]);
    setLoading(false);
  }

  function openNewForm() {
    setEditing(null);
    setFormTitle("");
    setFormBody(currentInput);
    setFormShared(false);
    setView("form");
  }

  function openEditForm(p: SavedPrompt) {
    setEditing(p);
    setFormTitle(p.title);
    setFormBody(p.body);
    setFormShared(p.is_shared);
    setView("form");
  }

  async function saveForm() {
    if (!formTitle.trim() || !formBody.trim() || !userId) return;
    setSaving(true);
    setError(null);
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const { error: saveError } = editing
      ? await supabase
          .from("saved_prompts")
          .update({ title: formTitle.trim(), body: formBody, is_shared: formShared, updated_at: new Date().toISOString() })
          .eq("id", editing.id)
      : await supabase
          .from("saved_prompts")
          .insert({ user_id: userId, workspace, title: formTitle.trim(), body: formBody, is_shared: formShared });

    setSaving(false);
    if (saveError) {
      setError(saveError.message);
    } else {
      setView("list");
      load();
    }
  }

  async function deletePrompt(p: SavedPrompt) {
    if (!window.confirm(`Delete "${p.title}"?`)) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setPrompts((prev) => prev.filter((x) => x.id !== p.id));
    const { error: deleteError } = await supabase.from("saved_prompts").delete().eq("id", p.id);
    if (deleteError) {
      setError(deleteError.message);
      load();
    }
  }

  function pickPrompt(p: SavedPrompt) {
    const vars = extractPromptVariables(p.body);
    if (vars.length === 0) {
      onUsePrompt(p.body);
      onClose();
      return;
    }
    setHydrating(p);
    setVariableValues(Object.fromEntries(vars.map((v) => [v, ""])));
    setView("hydrate");
  }

  function confirmHydrate() {
    if (!hydrating) return;
    onUsePrompt(hydratePromptVariables(hydrating.body, variableValues));
    onClose();
  }

  if (!open) return null;

  const filtered = prompts.filter(
    (p) => !search.trim() || p.title.toLowerCase().includes(search.toLowerCase()) || p.body.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-50 bg-navy/30" aria-hidden />
      <div className="fixed inset-y-3 right-3 z-50 flex w-[calc(100%-1.5rem)] max-w-md flex-col overflow-hidden rounded-3xl bg-white shadow-pop">
        <div className="flex flex-none items-center justify-between border-b border-navy/8 px-6 py-4">
          <div className="flex items-center gap-2">
            <Sparkles size={17} className="text-plum" />
            <p className="text-[14.5px] font-semibold text-navy">
              {view === "list" ? `Saved prompts — ${WORKSPACES[workspace].name}` : view === "hydrate" ? hydrating?.title : editing ? "Edit prompt" : "New prompt"}
            </p>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 flex-none place-items-center rounded-xl text-navy/50 transition-colors hover:bg-navy/5 hover:text-navy">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {view === "list" && (
            <>
              <div className="mb-3 flex items-center gap-2">
                <div className="relative flex-1">
                  <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-navy/35" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search prompts…"
                    className="w-full rounded-xl border border-navy/12 bg-white py-2 pl-8 pr-3 text-[13px] text-navy outline-none focus:border-terracotta/50"
                  />
                </div>
                <button onClick={openNewForm} className="grid h-9 w-9 flex-none place-items-center rounded-xl bg-navy/8 text-navy transition-colors hover:bg-navy/12" title="New prompt">
                  <Plus size={16} />
                </button>
              </div>

              {loading ? (
                <p className="text-[13px] text-charcoal/45">Loading…</p>
              ) : error ? (
                <p className="rounded-2xl border border-terracotta/25 bg-terracotta/10 px-3.5 py-2.5 text-[12.5px] text-terracotta">{error}</p>
              ) : filtered.length === 0 ? (
                <p className="text-[13px] text-charcoal/45">
                  {prompts.length === 0
                    ? "No saved prompts yet for this workspace — save one from what you're typing, or write one from scratch."
                    : "Nothing matches that search."}
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {filtered.map((p) => {
                    const mine = p.user_id === userId;
                    const vars = extractPromptVariables(p.body);
                    return (
                      <div key={p.id} className="group rounded-2xl border border-navy/8 bg-offwhite p-3.5">
                        <button onClick={() => pickPrompt(p)} className="block w-full text-left">
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <p className="text-[13.5px] font-semibold text-navy">{p.title}</p>
                            <ArrowRight size={14} className="flex-none text-navy/30 transition-transform group-hover:translate-x-0.5" />
                          </div>
                          <p className="line-clamp-2 text-[12.5px] leading-relaxed text-charcoal/60">{p.body}</p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            {p.is_shared && <span className="pill-tag text-[10.5px]">Shared</span>}
                            {!mine && <span className="text-[10.5px] text-charcoal/40">from a teammate</span>}
                            {vars.length > 0 && (
                              <span className="text-[10.5px] text-charcoal/40">{vars.length} field{vars.length === 1 ? "" : "s"} to fill in</span>
                            )}
                          </div>
                        </button>
                        {mine && (
                          <div className="mt-2 flex items-center gap-3 border-t border-navy/6 pt-2">
                            <button onClick={() => openEditForm(p)} className="flex items-center gap-1 text-[11.5px] font-medium text-navy/50 hover:text-navy">
                              <Pencil size={11} /> Edit
                            </button>
                            <button onClick={() => deletePrompt(p)} className="flex items-center gap-1 text-[11.5px] font-medium text-terracotta/70 hover:text-terracotta">
                              <Trash2 size={11} /> Delete
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {view === "form" && (
            <div className="flex flex-col gap-3.5">
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-medium text-navy/70">Title</label>
                <input
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="e.g. Weekly social recap"
                  className="rounded-xl border border-navy/12 bg-white px-3.5 py-2.5 text-[13.5px] text-navy outline-none focus:border-terracotta/50"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] font-medium text-navy/70">
                  Prompt — use <code className="rounded bg-navy/8 px-1 py-0.5 text-[11px]">{"{{variable}}"}</code> for anything that changes each time
                </label>
                <textarea
                  value={formBody}
                  onChange={(e) => setFormBody(e.target.value)}
                  rows={6}
                  placeholder={`e.g. "Write a {{platform}} post about {{topic}} in our usual tone"`}
                  className="resize-none rounded-xl border border-navy/12 bg-white px-3.5 py-2.5 text-[13.5px] text-navy outline-none focus:border-terracotta/50"
                />
              </div>
              <label className="flex items-center gap-2 text-[12.5px] text-charcoal/70">
                <input type="checkbox" checked={formShared} onChange={(e) => setFormShared(e.target.checked)} className="h-4 w-4 rounded border-navy/25" />
                Share with everyone who has {WORKSPACES[workspace].name} access
              </label>
              {error && <p className="text-[12px] text-terracotta">{error}</p>}
              <div className="flex items-center gap-2">
                <button onClick={saveForm} disabled={saving || !formTitle.trim() || !formBody.trim()} className="btn-cta flex-1">
                  {saving ? "Saving…" : editing ? "Save changes" : "Save prompt"}
                </button>
                <button onClick={() => setView("list")} className="rounded-2xl border border-navy/12 px-4 py-2.5 text-[13px] font-medium text-navy/60 hover:bg-navy/5">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {view === "hydrate" && hydrating && (
            <div className="flex flex-col gap-3.5">
              <p className="text-[12.5px] text-charcoal/55">Fill these in, then it drops straight into your message.</p>
              {extractPromptVariables(hydrating.body).map((v) => (
                <div key={v} className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-medium text-navy/70">{v}</label>
                  <input
                    value={variableValues[v] ?? ""}
                    onChange={(e) => setVariableValues((prev) => ({ ...prev, [v]: e.target.value }))}
                    className="rounded-xl border border-navy/12 bg-white px-3.5 py-2.5 text-[13.5px] text-navy outline-none focus:border-terracotta/50"
                    autoFocus={v === extractPromptVariables(hydrating.body)[0]}
                  />
                </div>
              ))}
              <div className="flex items-center gap-2">
                <button onClick={confirmHydrate} className="btn-cta flex-1">
                  Use this prompt
                </button>
                <button onClick={() => setView("list")} className="rounded-2xl border border-navy/12 px-4 py-2.5 text-[13px] font-medium text-navy/60 hover:bg-navy/5">
                  Back
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
