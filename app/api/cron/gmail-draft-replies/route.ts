import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { syncGmailSupportDrafts } from "@/lib/gmail-support-sync";

export const runtime = "nodejs";
// Composing a reply per email (embedding + retrieval + Claude) is the slow
// part; a busy inbox catching up after a quiet period can need real room,
// same reasoning as /api/cron/sync-notion.
export const maxDuration = 300;

/**
 * Fires on Vercel's cron schedule (see vercel.json). Same
 * Authorization: Bearer <CRON_SECRET> pattern as sync-notion — required,
 * not optional, since this route would otherwise be a public URL anyone
 * could hit to trigger real (embedding + Claude cost-bearing) work.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured on this deployment" }, { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase env vars aren't configured on this deployment" }, { status: 500 });
  }

  try {
    const result = await syncGmailSupportDrafts(supabase);
    if (result.errors.length > 0) console.error("[cron/gmail-draft-replies] errors:", result.errors);
    console.log(
      `[cron/gmail-draft-replies] ${result.checked} unread checked, ${result.drafted} drafted, ` +
        `${result.skippedAlreadyProcessed} already processed, ${result.errors.length} error(s)`
    );
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron/gmail-draft-replies]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
