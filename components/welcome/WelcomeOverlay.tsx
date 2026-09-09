"use client";

import { useEffect, useRef, useState } from "react";
import { Mascot } from "@/components/mascot/Mascot";

const SESSION_KEY = "alina-welcome-shown";
const WRITE_MS = 1100;
const HOLD_MS = 700;
const FADE_MS = 400;

type Phase = "writing" | "holding" | "exiting" | "done";

/**
 * A one-time handwritten "Hi, I'm Alina" moment that plays once per
 * session, right on top of the Ask screen as it loads. Purely
 * decorative — never blocks interaction beyond its own lifetime, and a
 * click anywhere (or the skip link) ends it immediately.
 */
export function WelcomeOverlay() {
  const [shouldRender, setShouldRender] = useState(false);
  const [phase, setPhase] = useState<Phase>("writing");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    let alreadyShown = true;
    try {
      alreadyShown = sessionStorage.getItem(SESSION_KEY) === "1";
    } catch {
      // sessionStorage unavailable (private mode, etc.) — just skip the moment.
      alreadyShown = true;
    }
    if (!alreadyShown) setShouldRender(true);
  }, []);

  useEffect(() => {
    if (!shouldRender) return;
    timers.current.push(setTimeout(() => setPhase("holding"), WRITE_MS));
    timers.current.push(setTimeout(() => setPhase("exiting"), WRITE_MS + HOLD_MS));
    timers.current.push(
      setTimeout(() => finish(), WRITE_MS + HOLD_MS + FADE_MS)
    );
    return () => timers.current.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldRender]);

  function finish() {
    timers.current.forEach(clearTimeout);
    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      // ignore — worst case it replays once more this browser
    }
    setPhase("done");
  }

  if (!shouldRender || phase === "done") return null;

  return (
    <div
      onClick={finish}
      className="fixed inset-0 z-[100] flex cursor-pointer items-center justify-center bg-offwhite transition-opacity duration-[400ms]"
      style={{ opacity: phase === "exiting" ? 0 : 1 }}
      role="button"
      aria-label="Dismiss welcome"
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          finish();
        }}
        className="absolute right-6 top-6 text-[13px] font-medium text-navy/40 transition-colors hover:text-navy"
      >
        Skip
      </button>

      <div className="flex items-end gap-4 px-6">
        <Mascot state="happy" size="lg" className="mb-1 animate-bounce-in hidden sm:block" />
        <div className="animate-write-reveal">
          <p className="whitespace-nowrap font-hand text-[64px] leading-none text-terracotta sm:text-[84px]">
            Hi, I&apos;m Alina
          </p>
        </div>
      </div>
    </div>
  );
}
