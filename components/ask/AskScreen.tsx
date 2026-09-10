"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Volume2, VolumeX } from "lucide-react";
import clsx from "clsx";
import { Mascot, type MascotState } from "@/components/mascot/Mascot";
import { WorkspaceTabs } from "@/components/ask/WorkspaceTabs";
import { ModeToggle } from "@/components/ask/ModeToggle";
import { Composer } from "@/components/ask/Composer";
import { MessageBubble } from "@/components/ask/MessageBubble";
import { TypingAnswer } from "@/components/ask/TypingAnswer";
import { EmptyState } from "@/components/ask/EmptyState";
import { useSpeech } from "@/lib/hooks/useSpeech";
import { useVoiceInput } from "@/lib/hooks/useVoiceInput";
import { WORKSPACES, type AskMode, type ChatMessage, type WorkspaceId } from "@/lib/types";

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
  const [justAnswered, setJustAnswered] = useState(false);

  const threadRef = useRef<HTMLDivElement>(null);
  const { speak, speaking, error: speechError, supported: speechSupported } = useSpeech();
  const { start: startMic, listening, supported: micSupported } = useVoiceInput((text) =>
    setInput((prev) => (prev ? `${prev} ${text}` : text))
  );

  const messages = messagesByWs[workspace] ?? [];

  const mascotState: MascotState = loading
    ? "thinking"
    : speaking
    ? "speaking"
    : justAnswered
    ? "happy"
    : "idle";

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  function appendMessage(ws: WorkspaceId, message: ChatMessage) {
    setMessagesByWs((prev) => ({ ...prev, [ws]: [...(prev[ws] ?? []), message] }));
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
    setJustAnswered(false);

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace,
          mode,
          message: trimmed,
          history: messages.slice(-6),
        }),
      });
      const data = await res.json();

      const assistantMessage: ChatMessage = {
        id: nextId(),
        role: "assistant",
        content: data.content ?? "Something went wrong on my end — try that again?",
        citations: data.citations,
        provenance: data.provenance,
        createdAt: new Date().toISOString(),
      };
      appendMessage(workspace, assistantMessage);
      setJustAnswered(true);
      setTimeout(() => setJustAnswered(false), 2400);
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
    <div className="flex h-full flex-col">
      <div className="flex flex-none flex-wrap items-center gap-3 border-b border-navy/8 px-6 py-4">
        <WorkspaceTabs allowed={allowedWorkspaces} active={workspace} onChange={setWorkspace} />
        <span className="pill-tag hidden sm:inline-flex">Tone: {WORKSPACES[workspace].toneHint}</span>
        <div className="ml-auto flex items-center gap-2">
          {speechSupported && (
            <button
              onClick={() => setAutoSpeak((v) => !v)}
              title={autoSpeak ? "Alina will read answers out loud" : "Turn on voice replies"}
              className={clsx(
                "grid h-9 w-9 place-items-center rounded-2xl border transition-colors",
                autoSpeak
                  ? "border-terracotta/40 bg-terracotta/10 text-terracotta"
                  : "border-navy/10 text-navy/50 hover:text-navy"
              )}
            >
              {autoSpeak ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>
          )}
          <ModeToggle mode={mode} onChange={setMode} />
        </div>
      </div>

      {mode === "chat" ? (
        <>
          <div ref={threadRef} className="flex-1 overflow-y-auto px-6 py-6">
            {messages.length === 0 ? (
              <EmptyState workspace={workspace} mode={mode} onPick={send} />
            ) : (
              <div className="mx-auto flex max-w-2xl flex-col gap-4">
                {messages.map((m) => (
                  <MessageBubble key={m.id} message={m} onSpeak={speechSupported ? speak : undefined} />
                ))}
                {loading && <ThinkingBubble />}
              </div>
            )}
          </div>
          <div className="flex-none px-6 pb-6 pt-2">
            {speechError && (
              <div className="mx-auto mb-2 flex max-w-2xl items-center justify-between rounded-2xl border border-terracotta/25 bg-terracotta/10 px-3.5 py-2 text-[12.5px] text-terracotta">
                <span>Couldn&apos;t play voice: {speechError}</span>
              </div>
            )}
            <div className="mx-auto flex max-w-2xl items-end gap-3">
              <Mascot state={mascotState} size="md" className="mb-1 hidden sm:block" />
              <div className="flex-1">
                <Composer
                  value={input}
                  onChange={setInput}
                  onSubmit={() => send(input)}
                  placeholder={`Ask ${WORKSPACES[workspace].name.toLowerCase() === "assistant" ? "Alina" : "about " + WORKSPACES[workspace].name.toLowerCase()}…`}
                  disabled={loading}
                  onMic={micSupported ? startMic : undefined}
                  micListening={listening}
                  micSupported={micSupported}
                />
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto px-6 py-6">
            {typingPairs.length === 0 && !loading ? (
              <EmptyState workspace={workspace} mode={mode} onPick={send} />
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
                  <div className="card-chunky flex items-center gap-3 p-5">
                    <Mascot state="thinking" size="sm" />
                    <p className="text-[13.5px] text-navy/50">Drafting, one second…</p>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex-none px-6 pb-6 pt-2">
            <div className="mx-auto max-w-2xl">
              <Composer
                value={input}
                onChange={setInput}
                onSubmit={() => send(input)}
                placeholder="Describe what you need drafted — a reply, a summary, a recap…"
                disabled={loading}
                multiline
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ThinkingBubble() {
  return (
    <div className="flex items-start gap-3">
      <Mascot state="thinking" size="sm" />
      <div className="flex items-center gap-1 rounded-3xl rounded-tl-lg border border-navy/[0.07] bg-white px-4 py-3.5 shadow-card">
        <span className="h-1.5 w-1.5 animate-blink rounded-full bg-navy/40 [animation-delay:0ms]" />
        <span className="h-1.5 w-1.5 animate-blink rounded-full bg-navy/40 [animation-delay:150ms]" />
        <span className="h-1.5 w-1.5 animate-blink rounded-full bg-navy/40 [animation-delay:300ms]" />
      </div>
    </div>
  );
}
