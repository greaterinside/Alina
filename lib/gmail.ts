/**
 * Gmail REST API access for the support inbox — deliberately raw fetch()
 * calls, no googleapis SDK, matching how scripts/ingest-notion.mjs and
 * scripts/ingest-github.mjs talk to their APIs directly rather than
 * pulling in a client library.
 *
 * Auth is a single mailbox's OAuth refresh token (GMAIL_REFRESH_TOKEN),
 * obtained once via the /api/gmail/oauth flow below and pasted into env
 * vars — same pattern as every other credential in this codebase. Scopes
 * requested are gmail.readonly + gmail.compose: read incoming mail and
 * create/update drafts. There is no scope that permits drafts without
 * also technically permitting drafts.send — the actual safety boundary is
 * that nothing in this file (or its caller) ever calls that endpoint.
 */

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

async function getAccessToken(): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: requireEnv("GMAIL_CLIENT_ID"),
      client_secret: requireEnv("GMAIL_CLIENT_SECRET"),
      refresh_token: requireEnv("GMAIL_REFRESH_TOKEN"),
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Gmail token refresh failed: ${res.status} ${await res.text().catch(() => "")}`);
  const data = await res.json();
  return data.access_token;
}

async function gmailFetch(accessToken: string, path: string, init?: RequestInit) {
  const res = await fetch(`${GMAIL_API}${path}`, {
    ...init,
    headers: { ...init?.headers, Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Gmail API ${path} failed: ${res.status} ${await res.text().catch(() => "")}`);
  return res.json();
}

function base64UrlDecode(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

function base64UrlEncode(data: string): string {
  return Buffer.from(data, "utf-8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function headerValue(headers: { name: string; value: string }[], name: string): string | undefined {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value;
}

/** Walks a message's MIME parts depth-first for the first text/plain body; falls back to a stripped text/html one. */
function extractPlainTextBody(payload: any): string {
  const htmlFallback: { current: string | null } = { current: null };

  function walk(part: any): string | null {
    if (!part) return null;
    if (part.mimeType === "text/plain" && part.body?.data) return base64UrlDecode(part.body.data);
    if (part.mimeType === "text/html" && part.body?.data && !htmlFallback.current) {
      htmlFallback.current = base64UrlDecode(part.body.data);
    }
    for (const child of part.parts ?? []) {
      const found = walk(child);
      if (found) return found;
    }
    return null;
  }

  const plain = walk(payload);
  if (plain) return plain.trim();
  if (htmlFallback.current) return htmlFallback.current.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return "";
}

/** "Name <email@x.com>" -> { name, email }; falls back to the email alone as the name when there isn't one. */
function parseFromHeader(raw: string): { name: string; email: string } {
  const match = raw.match(/^"?([^"<]*)"?\s*<(.+)>$/);
  if (match) return { name: match[1].trim() || match[2], email: match[2].trim() };
  return { name: raw.trim(), email: raw.trim() };
}

export interface SupportEmail {
  messageId: string;
  threadId: string;
  subject: string;
  fromName: string;
  fromEmail: string;
  bodyText: string;
  /** The RFC 2822 Message-ID header (not Gmail's internal id) — needed for In-Reply-To/References when drafting a reply. */
  rfc822MessageId: string;
}

/** Which mailbox GMAIL_REFRESH_TOKEN is actually authorized for — the one thing that can't be assumed from setup instructions alone. */
export async function getAuthorizedEmailAddress(): Promise<string> {
  const accessToken = await getAccessToken();
  const data = await gmailFetch(accessToken, "/profile");
  return data.emailAddress;
}

/**
 * Unread messages in the inbox not already in support.tickets get
 * drafted; this only lists ids + threadIds, cheap.
 *
 * Scoped to subject:TEST ONLY — support@ already has a separate,
 * pre-existing automation drafting replies to every real incoming email
 * every morning (confirmed live by Ajit, not something this codebase
 * knew about). Without this filter, this cron was quietly double-
 * drafting on top of real customer emails for however long it ran
 * unscoped — this restricts it to deliberately-marked test emails
 * (subject containing "TEST," e.g. "[TEST] ...") until there's an
 * actual decision on how — or whether — the two systems coexist.
 */
export async function listUnreadInboxMessageIds(): Promise<{ id: string; threadId: string }[]> {
  const accessToken = await getAccessToken();
  const data = await gmailFetch(accessToken, "/messages?q=" + encodeURIComponent("is:unread in:inbox subject:TEST") + "&maxResults=25");
  return (data.messages ?? []).map((m: any) => ({ id: m.id, threadId: m.threadId }));
}

export async function getSupportEmail(messageId: string): Promise<SupportEmail> {
  const accessToken = await getAccessToken();
  const data = await gmailFetch(accessToken, `/messages/${messageId}?format=full`);
  const headers = data.payload?.headers ?? [];
  const { name, email } = parseFromHeader(headerValue(headers, "From") ?? "");
  return {
    messageId: data.id,
    threadId: data.threadId,
    subject: headerValue(headers, "Subject") ?? "(no subject)",
    fromName: name,
    fromEmail: email,
    bodyText: extractPlainTextBody(data.payload),
    rfc822MessageId: headerValue(headers, "Message-ID") ?? "",
  };
}

/**
 * Creates a Gmail draft replying on the given thread — visible in the real
 * inbox exactly like a human had started typing a reply, so whoever owns
 * support@ reviews and sends it themselves. Never calls drafts.send.
 */
export async function createDraftReply(opts: {
  threadId: string;
  inReplyToRfc822MessageId: string;
  to: string;
  subject: string;
  bodyText: string;
}): Promise<void> {
  const accessToken = await getAccessToken();
  const replySubject = opts.subject.toLowerCase().startsWith("re:") ? opts.subject : `Re: ${opts.subject}`;
  const mime =
    `To: ${opts.to}\r\n` +
    `Subject: ${replySubject}\r\n` +
    (opts.inReplyToRfc822MessageId ? `In-Reply-To: ${opts.inReplyToRfc822MessageId}\r\n` : "") +
    (opts.inReplyToRfc822MessageId ? `References: ${opts.inReplyToRfc822MessageId}\r\n` : "") +
    `Content-Type: text/plain; charset="UTF-8"\r\n\r\n${opts.bodyText}`;

  await gmailFetch(accessToken, "/drafts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: { threadId: opts.threadId, raw: base64UrlEncode(mime) } }),
  });
}
