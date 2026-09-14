import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import { syncNotion } from "@/lib/notion-sync";

export const runtime = "nodejs";
// An incremental run should normally be fast (most items get skipped by
// the staleness check), but the very first run after a quiet period, or
// one that lands right after a lot of Notion editing, can genuinely need
// more room — matches /api/ask's ceiling rather than guessing lower.
export const maxDuration = 300;

/**
 * Fires on Vercel's cron schedule (see vercel.json) so nobody has to run
 * scripts/ingest-notion.mjs by hand after every Notion edit. Vercel signs
 * its own cron requests with `Authorization: Bearer <CRON_SECRET>` when
 * CRON_SECRET is set as an env var — required here, not optional, since
 * this route is otherwise just a public URL anyone could hit to trigger
 * a real (embedding-cost-bearing) sync run.
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
    const result = await syncNotion(supabase);
    if (result.errors.length > 0) console.error("[cron/sync-notion] errors:", result.errors);
    console.log(
      `[cron/sync-notion] ${result.itemsUpdated} item(s) updated, ${result.chunksIngested} chunk(s), ` +
        `${result.itemsExpanded} total (was ${result.itemsFound} before row expansion), ${result.errors.length} error(s)`
    );
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron/sync-notion]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
