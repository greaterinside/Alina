"use client";

import { useRef, type ChangeEvent, type KeyboardEvent } from "react";
import { ArrowUp, Loader2, Mic, Paperclip, Sparkles } from "lucide-react";
import clsx from "clsx";

/** Kept in sync with lib/documents.ts's ACCEPTED_UPLOAD_TYPES. */
const ACCEPTED_UPLOAD_EXTENSIONS = ".pdf,.docx,.txt,.md";

export function Composer({
  value,
  onChange,
  onSubmit,
  placeholder,
  disabled,
  onMic,
  micListening,
  micSupported,
  multiline,
  onAttach,
  attaching,
  onOpenPrompts,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  placeholder: string;
  disabled?: boolean;
  onMic?: () => void;
  micListening?: boolean;
  micSupported?: boolean;
  multiline?: boolean;
  /** Called with a picked file (PDF/DOCX/TXT) — omit to hide the attach button entirely. */
  onAttach?: (file: File) => void;
  /** Shows a spinner on the attach button while an upload is being parsed/embedded. */
  attaching?: boolean;
  /** Opens the saved-prompts drawer — omit to hide the button entirely. */
  onOpenPrompts?: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // lets picking the same file twice in a row re-fire onChange
    if (file && onAttach) onAttach(file);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !multiline) {
      e.preventDefault();
      if (value.trim()) onSubmit();
    }
  }

  return (
    <div className="glass-panel flex items-end gap-2 p-2 pl-4 shadow-lg transition-colors focus-within:border-white/35">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={multiline ? 3 : 1}
        className="max-h-40 flex-1 resize-none bg-transparent py-2.5 text-[15px] leading-relaxed text-white placeholder:text-white/35 focus:outline-none"
      />

      {onAttach && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_UPLOAD_EXTENSIONS}
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={attaching}
            title="Attach a document (PDF, Word, or text) to add to the knowledge base"
            className="grid h-10 w-10 flex-none place-items-center rounded-2xl border border-white/15 text-white/55 transition-all duration-150 hover:border-white/30 hover:text-white disabled:opacity-40"
          >
            {attaching ? <Loader2 size={17} className="animate-spin" /> : <Paperclip size={17} />}
          </button>
        </>
      )}

      {onOpenPrompts && (
        <button
          onClick={onOpenPrompts}
          title="Saved prompts (or type / to open this)"
          className="grid h-10 w-10 flex-none place-items-center rounded-2xl border border-white/15 text-white/55 transition-all duration-150 hover:border-white/30 hover:text-white"
        >
          <Sparkles size={17} />
        </button>
      )}

      {onMic && (
        <button
          onClick={onMic}
          disabled={!micSupported}
          title={micSupported ? "Talk to Alina" : "Voice input isn't supported in this browser"}
          className={clsx(
            "grid h-10 w-10 flex-none place-items-center rounded-2xl border transition-all duration-150 active:scale-95 disabled:opacity-30",
            micListening
              ? "border-cyan-300/60 bg-cyan-300/10 text-cyan-300 animate-pulse-ring"
              : "border-white/15 text-white/55 hover:border-white/30 hover:text-white"
          )}
        >
          <Mic size={17} />
        </button>
      )}

      <button
        onClick={onSubmit}
        disabled={disabled || !value.trim()}
        className="grid h-10 w-10 flex-none place-items-center rounded-2xl bg-terracotta text-white shadow-cta transition-all duration-150 hover:brightness-[1.07] active:scale-90 disabled:opacity-30 disabled:shadow-none"
      >
        <ArrowUp size={18} />
      </button>
    </div>
  );
}
