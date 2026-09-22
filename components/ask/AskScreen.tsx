"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Volume2, VolumeX, Trash2 } from "lucide-react";
import clsx from "clsx";
import { ParticleField, PARTICLE_INTRO_SESSION_KEY } from "@/components/mascot/ParticleField";
import { WorkspaceTabs } from "@/components/ask/WorkspaceTabs";
import { ModeToggle } from "@/components/ask/ModeToggle";
import { Composer } from "@/components/ask/Composer";
import { MessageBubble } from "@/components/ask/MessageBubble";
import { TypingAnswer } from "@/components/ask/TypingAnswer";
import { EmptyState } from "@/components/ask/EmptyState";
import { ReportPreviewPanel } from "@/components/ask/ReportPreviewPanel";
import { PromptDrawer } from "@/components/prompts/PromptDrawer";
import { useSpeech } from "@/lib/hooks/useSpeech";
import { useVoiceInput } from "@/lib/hooks/useVoiceInput";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { WORKSPACES, type AskMode, type ChatMessage, type ReportDoc, type WorkspaceId } from "@/lib/types";

let idCounter = 0;
const nextId = () => `m${Date.now()}_${idCounter++}`;

export function AskScreen({
  allowedWorkspaces,
  userName,
}: {
  allowedWorkspaces: WorkspaceId[];
  userName: string;
}) {
  const searchParams = useSearchParams();
  const requestedWs = searchParams.get("ws") as WorkspaceId | null;

  const deniedWorkspace =
    requestedWs && WORKSPACES[requestedWs] && !allowedWorkspaces.includes(requestedWs)
      ? requestedWs
      : null;

  const [workspace, setWorkspace] = useState<WorkspaceId>(
    requestedWs && allowedWorkspaces.includes(requestedWs)
      ? requestedWs
      : allowedWorkspaces[0] ?? "assistant"
  );
  const [mode, setMode] = useState<AskMode>("chat");
  const [messagesByWs, setMessagesByWs] = useState<Record<string, ChatMessage[]>>({});
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [attaching, setAttaching] = useState(false);
  // Most recently uploaded doc's id, per workspace — sent with the next
  // question(s) so a just-attached document is guaranteed available as
  // context rather than left to match_knowledge's similarity search (a
  // vague "what's in this" shares little vocabulary with the document's
  // own content and can legitimately score too low to surface otherwise).
  const [recentUploadByWs, setRecentUploadByWs] = useState<Record<string, string>>({});
  const [openReport, setOpenReport] = useState<ReportDoc | null>(null);
  const [promptDrawerOpen, setPromptDrawerOpen] = useState(false);
  const [loadedWorkspaces, setLoadedWorkspaces] = useState<Set<WorkspaceId>>(new Set());
  const [historyLoading, setHistoryLoading] = useState(false);
  // Holds the greeting/chips back until the particle intro has fully
  // dissolved back into the sphere, so the two never render as text over
  // text. Starts `true` (matches what SSR renders, since sessionStorage
  // doesn't exist server-side) and gets corrected — before paint, via
  // useLayoutEffect, not useEffect — the moment the client can actually
  // check whether the intro already played this session.
  const [introDone, setIntroDone] = useState(true);
  useLayoutEffect(() => {
    try {
      if (sessionStorage.getItem(PARTICLE_INTRO_SESSION_KEY) !== "1") setIntroDone(false);
    } catch {
      // sessionStorage unavailable — just show the greeting immediately
    }
  }, []);

  const threadRef = useRef<HTMLDivElement>(null);
  const { speak, error: speechError, supported: speechSupported } = useSpeech();
  const { start: startMic, listening, supported: micSupported } = useVoiceInput((text) =>
    setInput((prev) => (prev ? `${prev} ${text}` : text))
  );

  const messages = messagesByWs[workspace] ?? [];

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  // Loads this person's saved conversation for a workspace the first time
  // it's viewed — lazily, per workspace, not all four up front. Never
  // overwrites a conversation already in progress (e.g. the fetch is still
  // in flight when someone sends a message) — only fills in history if
  // this workspace is still genuinely empty when it resolves.
  useEffect(() => {
    if (loadedWorkspaces.has(workspace)) return;
    let cancelled = false;

    (async () => {
      const supabase = getSupabaseBrowserClient();
      const markLoaded = () => !cancelled && setLoadedWorkspaces((prev) => new Set(prev).add(workspace));

      if (!supabase) return markLoaded();
      setHistoryLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setHistoryLoading(false);
        return markLoaded();
      }

      const { data, error } = await supabase
        .from("chat_messages")
        .select("id, role, content, report, created_at")
        .eq("user_id", user.id)
        .eq("workspace", workspace)
        .order("created_at", { ascending: true })
        .limit(200);

      if (cancelled) return;
      setHistoryLoading(false);

      if (!error && data && data.length > 0) {
        const loaded: ChatMessage[] = data.map((row) => ({
          id: row.id,
          role: row.role as "user" | "assistant",
          content: row.content,
          report: (row.report as ReportDoc | null) ?? undefined,
          createdAt: row.created_at,
        }));
        setMessagesByWs((prev) => (prev[workspace]?.length ? prev : { ...prev, [workspace]: loaded }));
      }
      markLoaded();
    })();

    return () => {
      cancelled = true;
    };
  }, [workspace, loadedWorkspaces]);

  function appendMessage(ws: WorkspaceId, message: ChatMessage) {
    setMessagesByWs((prev) => ({ ...prev, [ws]: [...(prev[ws] ?? []), message] }));
  }

  // Clears the visible thread AND the saved chat_messages rows behind it
  // for this workspace — otherwise it'd just reload right back in on the
  // next visit, since that table is exactly where persisted history comes
  // from. Deliberately does NOT touch user_preferences (learned facts) or
  // conversation_memory (shared past-answer knowledge) — those are how
  // Alina keeps learning progressively regardless of any chat being
  // cleared; this only clears the literal transcript.
  async function clearChatHistory() {
    if (messages.length === 0) return;
    if (!window.confirm(`Clear your ${WORKSPACES[workspace].name} conversation? This can't be undone.`)) return;

    setMessagesByWs((prev) => ({ ...prev, [workspace]: [] }));

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from("chat_messages").delete().eq("user_id", user.id).eq("workspace", workspace);
  }

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMessage: ChatMessage = {
      id: nextId(),
      role: "user",
      content: trimmed,
      createdAt: new Date().toISOString(),
    };
    appendMessage(workspace, userMessage);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace,
          mode,
          message: trimmed,
          history: messages.slice(-6),
          recentUploadId: recentUploadByWs[workspace],
        }),
      });
      const data = await res.json();

      const assistantMessage: ChatMessage = {
        id: nextId(),
        role: "assistant",
        content: data.content ?? "Something went wrong on my end — try that again?",
        citations: data.citations,
        provenance: data.provenance,
        report: data.report,
        createdAt: new Date().toISOString(),
      };
      appendMessage(workspace, assistantMessage);
      if (autoSpeak) speak(assistantMessage.content.replace(/\[cite:[^\]]+\]/g, ""));
    } catch {
      appendMessage(workspace, {
        id: nextId(),
        role: "assistant",
        content: "I couldn't reach the knowledge base just now. Mind trying again in a moment?",
        createdAt: new Date().toISOString(),
      });
    } finally {
      setLoading(false);
    }
  }

  function regenerate(promptText: string) {
    send(promptText);
  }

  // Typing "/" as the very first character opens the saved-prompts
  // drawer instead of the button — the "/" stays in the box (cleared
  // automatically once a prompt is picked, since that overwrites the
  // whole input) so closing the drawer without picking anything just
  // leaves it there to backspace, no extra state to reconcile.
  function handleInputChange(v: string) {
    if (v === "/" && input !== "/") setPromptDrawerOpen(true);
    setInput(v);
  }

  // Uploads go straight into the permanent knowledge base (public.uploaded_docs)
  // via /api/upload, not into this one conversation — so the confirmation/error
  // just gets posted as a normal assistant message in the current thread rather
  // than being attached to whatever's typed in the composer.
  async function uploadDocument(file: File) {
    if (attaching) return;
    setAttaching(true);

    try {
      const form = new FormData();
      form.append("file", file);
      form.append("workspace", workspace);

      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = await res.json();

      const content = data.error
        ? `Couldn't add **${file.name}** — ${data.error}`
        : `Added **${file.name}** to the ${WORKSPACES[workspace].name} knowledge base (${data.chunkCount} ` +
          `chunk${data.chunkCount === 1 ? "" : "s"}) — ask away, it's searchable now.`;

      if (!data.error && data.docId) {
        setRecentUploadByWs((prev) => ({ ...prev, [workspace]: data.docId }));
      }

      appendMessage(workspace, {
        id: nextId(),
        role: "assistant",
        content,
        createdAt: new Date().toISOString(),
      });
    } catch {
      appendMessage(workspace, {
        id: nextId(),
        role: "assistant",
        content: `Couldn't reach the server to upload **${file.name}** — try again in a moment?`,
        createdAt: new Date().toISOString(),
      });
    } finally {
      setAttaching(false);
    }
  }

  const typingPairs = useMemo(() => {
    const pairs: { prompt: ChatMessage; answer: ChatMessage }[] = [];
    for (let i = 0; i < messages.length - 1; i++) {
      if (messages[i].role === "user" && messages[i + 1]?.role === "assistant") {
        pairs.push({ prompt: messages[i], answer: messages[i + 1] });
      }
    }
    return pairs;
  }, [messages]);

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[#05050f]">
      <ParticleField onIntroDone={() => setIntroDone(true)} />
      <div className="relative z-10 flex h-full flex-col">
      {deniedWorkspace && (
        <div className="flex-none border-b border-terracotta/25 bg-terracotta/15 px-6 py-2.5 text-[12.5px] text-[#ffb088]">
          Oops — you don&apos;t have access to {WORKSPACES[deniedWorkspace].name}. Showing{" "}
          {WORKSPACES[workspace].name} instead. Ask an admin on the Team page if you need it.
        </div>
      )}
      <div className="flex flex-none flex-wrap items-center gap-3 border-b border-white/10 px-6 py-4">
        <WorkspaceTabs allowed={allowedWorkspaces} active={workspace} onChange={setWorkspace} />
        <span className="glass-pill hidden px-3 py-1 text-xs font-medium text-white/70 sm:inline-flex">
          Tone: {WORKSPACES[workspace].toneHint}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {speechSupported && (
            <button
              onClick={() => setAutoSpeak((v) => !v)}
              title={autoSpeak ? "Alina will read answers out loud" : "Turn on voice replies"}
              className={clsx(
                "grid h-9 w-9 place-items-center rounded-2xl border backdrop-blur-xl transition-colors",
                autoSpeak
                  ? "border-terracotta/50 bg-terracotta/15 text-[#ffb088]"
                  : "border-white/12 text-white/50 hover:text-white"
              )}
            >
              {autoSpeak ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>
          )}
          {messages.length > 0 && (
            <button
              onClick={clearChatHistory}
              title={`Clear your ${WORKSPACES[workspace].name} conversation`}
              className="grid h-9 w-9 place-items-center rounded-2xl border border-white/12 text-white/50 backdrop-blur-xl transition-colors hover:border-terracotta/40 hover:text-[#ffb088]"
            >
              <Trash2 size={16} />
            </button>
          )}
          <ModeToggle mode={mode} onChange={setMode} />
        </div>
      </div>

      {mode !== "typing" ? (
        <>
          <div ref={threadRef} className="flex-1 overflow-y-auto px-6 py-6">
            {messages.length === 0 && historyLoading ? null : messages.length === 0 ? (
              <div
                className={clsx(
                  "h-full transition-opacity duration-700",
                  introDone ? "opacity-100" : "opacity-0"
                )}
              >
                <EmptyState workspace={workspace} mode={mode} onPick={send} />
              </div>
            ) : (
              <div className="mx-auto flex max-w-2xl flex-col gap-4">
                {messages.map((m) => (
                  <MessageBubble
                    key={m.id}
                    message={m}
                    onSpeak={speechSupported ? speak : undefined}
                    onPreviewReport={setOpenReport}
                  />
                ))}
                {loading && <ThinkingBubble />}
              </div>
            )}
          </div>
          <div className="flex-none px-6 pb-6 pt-2">
            {speechError && (
              <div className="glass-panel mx-auto mb-2 flex max-w-2xl items-center justify-between px-3.5 py-2 text-[12.5px] text-[#ffb088]">
                <span>Couldn&apos;t play voice: {speechError}</span>
              </div>
            )}
            <div className="mx-auto max-w-2xl">
              <Composer
                value={input}
                onChange={handleInputChange}
                onSubmit={() => send(input)}
                placeholder={
                  mode === "report"
                    ? "Describe the report you need — a project recap, a status summary…"
                    : `Ask ${WORKSPACES[workspace].name.toLowerCase() === "assistant" ? "Alina" : "about " + WORKSPACES[workspace].name.toLowerCase()}… (or type / for saved prompts)`
                }
                disabled={loading}
                onMic={micSupported ? startMic : undefined}
                micListening={listening}
                micSupported={micSupported}
                onAttach={uploadDocument}
                attaching={attaching}
                onOpenPrompts={() => setPromptDrawerOpen(true)}
              />
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto px-6 py-6">
            {typingPairs.length === 0 && historyLoading ? null : typingPairs.length === 0 && !loading ? (
              <div
                className={clsx(
                  "h-full transition-opacity duration-700",
                  introDone ? "opacity-100" : "opacity-0"
                )}
              >
                <EmptyState workspace={workspace} mode={mode} onPick={send} />
              </div>
            ) : (
              <div className="mx-auto flex max-w-2xl flex-col gap-4">
                {typingPairs.map((pair) => (
                  <TypingAnswer
                    key={pair.answer.id}
                    prompt={pair.prompt}
                    answer={pair.answer}
                    onRegenerate={() => regenerate(pair.prompt.content)}
                  />
                ))}
                {loading && (
                  <div className="glass-panel flex items-center gap-3 p-5">
                    <DotLoader />
                    <p className="text-[13.5px] text-white/60">Drafting, one second…</p>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex-none px-6 pb-6 pt-2">
            <div className="mx-auto max-w-2xl">
              <Composer
                value={input}
                onChange={handleInputChange}
                onSubmit={() => send(input)}
                placeholder="Describe what you need drafted — a reply, a summary, a recap… (or type / for saved prompts)"
                disabled={loading}
                multiline
                onAttach={uploadDocument}
                attaching={attaching}
                onOpenPrompts={() => setPromptDrawerOpen(true)}
              />
            </div>
          </div>
        </>
      )}

      <ReportPreviewPanel report={openReport} onClose={() => setOpenReport(null)} />
      <PromptDrawer
        open={promptDrawerOpen}
        onClose={() => setPromptDrawerOpen(false)}
        workspace={workspace}
        currentInput={input === "/" ? "" : input}
        onUsePrompt={setInput}
      />
      </div>
    </div>
  );
}

function DotLoader() {
  return (
    <div className="flex items-center gap-1">
      <span className="h-1.5 w-1.5 animate-blink rounded-full bg-white/50 [animation-delay:0ms]" />
      <span className="h-1.5 w-1.5 animate-blink rounded-full bg-white/50 [animation-delay:150ms]" />
      <span className="h-1.5 w-1.5 animate-blink rounded-full bg-white/50 [animation-delay:300ms]" />
    </div>
  );
}

function ThinkingBubble() {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="pl-1 text-[12px] font-semibold text-white/55">Alina</p>
      <div className="glass-panel flex w-fit items-center gap-1 px-4 py-3.5">
        <DotLoader />
      </div>
    </div>
  );
}
