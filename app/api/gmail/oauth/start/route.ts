import { NextResponse } from "next/server";

/**
 * One-time manual setup step, not called by the running app afterward:
 * visit this URL yourself, signed into the support@ Google account, to
 * grant Alina read + draft (never send) access and get back a refresh
 * token to paste into env vars. See README's Gmail section.
 */
export async function GET() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const redirectUri = process.env.GMAIL_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    return NextResponse.json({ error: "GMAIL_CLIENT_ID / GMAIL_REDIRECT_URI aren't configured" }, { status: 500 });
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    // Forces Google to hand back a refresh_token even if this same Google
    // account consented before — without it, a re-run of this flow (e.g.
    // after losing the first refresh token) silently returns none.
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.compose"].join(" "),
  });

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}
