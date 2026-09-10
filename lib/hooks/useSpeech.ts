"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Reads Alina's answers out loud via ElevenLabs (/api/speak). Replaced the
 * free browser SpeechSynthesis voice after direct feedback that it wasn't
 * usable — this fetches real audio from the server instead of relying on
 * whatever voice the OS/browser happens to ship.
 */
export function useSpeech() {
  const [speaking, setSpeaking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  const cleanup = useCallback(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    audioRef.current?.pause();
    if (audioRef.current) audioRef.current.currentTime = 0;
    cleanup();
    setSpeaking(false);
  }, [cleanup]);

  const speak = useCallback(
    async (text: string) => {
      stop();
      setError(null);
      setLoading(true);
      try {
        const res = await fetch("/api/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (!res.ok) {
          const detail = await res.json().catch(() => null);
          throw new Error(detail?.error ?? `speak request failed: ${res.status}`);
        }

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        urlRef.current = url;

        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onplay = () => setSpeaking(true);
        audio.onended = () => {
          setSpeaking(false);
          cleanup();
        };
        audio.onerror = () => {
          setSpeaking(false);
          setError("Playback failed — the audio didn't load correctly.");
          cleanup();
        };
        await audio.play();
      } catch (err) {
        console.error("[useSpeech]", err);
        setSpeaking(false);
        setError(err instanceof Error ? err.message : "Couldn't play audio.");
      } finally {
        setLoading(false);
      }
    },
    [stop, cleanup]
  );

  return { speak, stop, speaking, loading, error, supported: true };
}
