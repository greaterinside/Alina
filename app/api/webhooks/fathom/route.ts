import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { verifyFathomSignature, syncOneFathomMeeting } from "@/lib/fathom-webhook";

export const runtime = "nodejs";
// Embedding a handful of chunks for one meeting is quick, but a long call's
// transcript can still take a few seconds across several embed calls —
// same ceiling reasoning as the other ingestion routes, not because this
// one is expected to run anywhere near it.
export const maxDuration = 60;

/**
 * Fathom calls this the moment a meeting finishes processing (event
 * "new-meeting-content-ready" — their only event type as of writing) —
 * real-time replacement for someone remembering to run
 * scripts/ingest-fathom.mjs by hand. Configure this URL as the webhook
 * target in Fathom's own settings; see README's Fathom section.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.FATHOM_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "FATHOM_WEBHOOK_SECRET is not configured on this deployment" }, { status: 500 });
  }

  const rawBody = await req.text();
  const verified = verifyFathomSignature({
    rawBody,
    webhookId: req.headers.get("webhook-id"),
    webhookTimestamp: req.headers.get("webhook-timestamp"),
    webhookSignature: req.headers.get("webhook-signature"),
    secret,
  });
  if (!verified) {
    return NextResponse.json({ error: "Signature verification failed" }, { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Body isn't valid JSON" }, { status: 400 });
  }

  // Field names here are the least-confirmed part of this integration (see
  // lib/fathom-webhook.ts's header comment) — logged so a real payload's
  // actual shape is easy to check against these guesses.
  console.log("[webhooks/fathom] event received, top-level keys:", Object.keys(payload ?? {}).join(", "));

  const meetingId =
    payload?.id ??
    payload?.meeting_id ??
    payload?.meeting?.id ??
    payload?.data?.id ??
    payload?.data?.meeting_id ??
    payload?.data?.meeting?.id;
  if (!meetingId) {
    console.error("[webhooks/fathom] no meeting id found in payload:", JSON.stringify(payload).slice(0, 500));
    return NextResponse.json({ error: "Couldn't find a meeting id in the payload" }, { status: 400 });
  }

  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase env vars aren't configured on this deployment" }, { status: 500 });
  }

  try {
    const result = await syncOneFathomMeeting(supabase, String(meetingId));
    console.log(`[webhooks/fathom] meeting ${meetingId}: ${result.chunksIngested} chunk(s) ingested`);
    return NextResponse.json({ meetingId, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[webhooks/fathom] meeting ${meetingId} failed —`, message);
    // Non-2xx so Fathom retries — a transient failure (rate limit, a
    // flaky embed call) shouldn't silently lose this meeting forever.
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
