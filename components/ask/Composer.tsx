"use client";

import { useRef, type KeyboardEvent } from "react";
import { ArrowUp, Mic } from "lucide-react";
import clsx from "clsx";

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
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !multiline) {
      e.preventDefault();
      if (value.trim()) onSubmit();
    }
  }

  return (
    <div className="flex items-end gap-2 rounded-3xl border border-navy/10 bg-white p-2 pl-4 shadow-card transition-colors focus-within:border-terracotta/40">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={multiline ? 3 : 1}
        className="max-h-40 flex-1 resize-none bg-transparent py-2.5 text-[15px] leading-relaxed text-charcoal placeholder:text-charcoal/35 focus:outline-none"
      />

      {onMic && (
        <button
          onClick={onMic}
          disabled={!micSupported}
          title={micSupported ? "Talk to Alina" : "Voice input isn't supported in this browser"}
          className={clsx(
            "grid h-10 w-10 flex-none place-items-center rounded-2xl border transition-all duration-150 active:scale-95 disabled:opacity-30",
            micListening
              ? "border-terracotta bg-terracotta/10 text-terracotta animate-pulse-ring"
              : "border-navy/12 text-navy/55 hover:border-navy/25 hover:text-navy"
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
