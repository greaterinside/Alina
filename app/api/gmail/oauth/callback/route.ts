import { NextRequest, NextResponse } from "next/server";

/**
 * Google redirects here after consent. Exchanges the one-time code for a
 * refresh token and shows it once, in plain text, for a human to copy
 * into GMAIL_REFRESH_TOKEN — never stored automatically, same reasoning
 * as every other credential in this codebase (.env.local is git-ignored;
 * a person pastes it in, not code).
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");
  if (error) return NextResponse.json({ error }, { status: 400 });
  if (!code) return NextResponse.json({ error: "No code in callback" }, { status: 400 });

  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const redirectUri = process.env.GMAIL_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.json({ error: "GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REDIRECT_URI aren't configured" }, { status: 500 });
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const data = await res.json();
  if (!res.ok) return NextResponse.json({ error: "Token exchange failed", detail: data }, { status: 500 });

  if (!data.refresh_token) {
    return new NextResponse(
      "No refresh_token came back — this Google account already granted consent before. Revoke Alina's access at " +
        "https://myaccount.google.com/permissions (while signed into the support@ account) and run this flow again.",
      { status: 200 }
    );
  }

  return new NextResponse(
    `Copy this into GMAIL_REFRESH_TOKEN in .env.local / Vercel env vars:\n\n${data.refresh_token}\n\n` +
      "This is shown once and not stored anywhere by this app.",
    { status: 200, headers: { "Content-Type": "text/plain" } }
  );
}
