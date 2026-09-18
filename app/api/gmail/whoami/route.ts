import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedEmailAddress } from "@/lib/gmail";

/**
 * Answers "which mailbox is GMAIL_REFRESH_TOKEN actually authorized for"
 * directly from Google, rather than trusting whatever address the setup
 * instructions assumed (support@greaterinside.com was a placeholder
 * suggested mid-setup, never independently confirmed as correct, or
 * confirmed as the account actually used when consent was granted).
 * Reuses CRON_SECRET as the bearer token — a diagnostic, not a new
 * credential to manage.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured on this deployment" }, { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const emailAddress = await getAuthorizedEmailAddress();
    return NextResponse.json({ emailAddress });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
