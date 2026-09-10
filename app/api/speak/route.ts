import { NextRequest, NextResponse } from "next/server";

// "Rachel" — a warm, clear default ElevenLabs voice. Override with
// ELEVENLABS_VOICE_ID once a specific voice is picked for Alina.
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";
// eleven_turbo_v2_5 returned 402s even with free credits available and
// the account confirmed to support free-tier API access — switched to
// the standard multilingual model, which has broader plan availability.
const MODEL_ID = "eleven_multilingual_v2";
const MAX_TEXT_CHARS = 5000;

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { text } = await req.json();
  if (!text || typeof text !== "string") {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ELEVENLABS_API_KEY is not configured" }, { status: 503 });
  }

  const voiceId = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text: text.slice(0, MAX_TEXT_CHARS),
      model_id: MODEL_ID,
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("[/api/speak]", res.status, detail);
    return NextResponse.json(
      { error: `ElevenLabs request failed: ${res.status} ${detail.slice(0, 300)}` },
      { status: 502 }
    );
  }

  const audio = await res.arrayBuffer();
  return new NextResponse(audio, {
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
  });
}
