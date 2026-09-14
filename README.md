# Alina

Internal AI knowledge assistant for Greater Inside. Next.js 14 (App Router) +
TypeScript + Tailwind, on top of the shared Supabase project.

## Status: this rebuild, honestly

This branch was started against an **empty repository** — no prior Next.js
app, API routes, or Supabase migrations existed in `greaterinside/alina` to
build on. `app/api/projects` and `app/api/recordings/ingest` still don't
exist here and aren't used by anything in this branch. `match_knowledge`
does exist in the live Supabase project, and `/api/ask` (via `lib/rag.ts`)
now calls its real signature —
`match_knowledge(query_embedding, match_count, workspace_filter)` — rather
than a guess. It just has no data to find yet: see **Embeddings backfill**
below.

Built so far:

- **Role-gated sidebar shell** — Ask is always visible; Sources, Routing,
  and Team are hidden in the nav (and redirect away) for anyone whose role
  isn't `admin`/`senior` in `public.roles`.
- **Ask** (the priority screen) — chat mode and typing mode, workspace tabs
  (Assistant/Tech/Social/Support, scoped to what the signed-in person can
  query), the Alina mascot with idle/thinking/speaking/happy states, free
  browser text-to-speech, push-to-talk voice input, citations, and a
  provenance panel per answer.
- **Sources** — the real connector list from the brief (GitHub, Notion,
  Zoom, Fathom, Gmail, Google Drive, WhatsApp), every one shown as
  "available to connect" since none are genuinely wired up yet. No fake
  "connected" state.
- **Routing** and **Team** — thin placeholder screens (Team reads live from
  `public.roles` and shows an honest empty state until that table has
  rows), ready for the next pass.

## Prompt control & personalization (from the founder's voice notes)

Two ideas from the brief are modeled in the schema and the `/api/ask`
route, even though there's no UI to edit them yet:

1. **Per-workspace tone.** `public.workspace_prompts` holds one system
   prompt per workspace (support writes differently than tech). `/api/ask`
   pulls it and layers it into the system prompt before generating an
   answer — this is what will let Support draft a client reply "in our
   voice" instead of a generic one.
2. **Per-person layer on a shared master.** `public.user_preferences`
   holds each teammate's own notes/shortcuts per workspace. It's additive
   only — it can change tone, never facts, and every answer still comes
   from the same shared knowledge base everyone else queries.

Both tables are proposed in `supabase/migrations/0001_roles_and_prompts.sql`
— check it against whatever the live project's actual schema turns out to
be before running it.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in Supabase / OpenAI / Anthropic keys
npm run dev
```

Without the env vars set, the app still runs: the sidebar defaults to a
demo admin identity (so every screen is reachable) and `/api/ask` returns
a plain "I'm not connected yet" message instead of inventing an answer.

## Signing in

Once Supabase env vars are set, every page except `/login` requires a real
session (`middleware.ts`) — the demo-admin fallback above only applies when
Supabase isn't configured at all.

There's no self-serve sign-up. To give someone access:

1. **Supabase Dashboard → Authentication → Users → Add user** — set their
   email and a password (or send an invite email, if that's turned on for
   the project). Copy the generated **User UID**.
2. Add or update their row in `public.roles` with that same UID as
   `user_id`, plus their `name`, `role` (`admin` / `senior` / `member`),
   and `workspaces` (which of `assistant`/`tech`/`social`/`support` they
   can query):
   ```sql
   insert into public.roles (user_id, name, role, workspaces)
   values ('<the UID from step 1>', 'Diksha', 'member', array['assistant', 'tech'])
   on conflict (user_id) do update
     set name = excluded.name, role = excluded.role, workspaces = excluded.workspaces;
   ```
3. They sign in at `/login` with that email/password. Admins can then grant
   or revoke individual workspace access for anyone from the **Team** page
   (click a person's workspace pill) — no more SQL needed after the first
   row exists.

Signing out is the icon next to your name at the bottom of the sidebar.

## Embeddings backfill

`match_knowledge` reads `embedding` columns on six tables — `tech.notes`,
`tech.meeting_notes`, `social.recordings`, `social.testimonials`,
`social.content_prompts`, `support.tickets` — and only ever matches rows
where that column is set. Until it's backfilled, every query will come
back empty even with everything else wired up correctly.

```bash
node scripts/backfill-embeddings.mjs
```

Idempotent (only touches rows where `embedding is null`), so it's safe to
re-run after new rows land — though a live webhook/trigger that embeds a
row the moment it's written would make this unnecessary going forward;
this script is the one-time catch-up for what already exists. Needs
`SUPABASE_SERVICE_ROLE_KEY` and `OPENAI_API_KEY` (reads `.env.local` if
present). See the script's own header comment for the embedding model /
vector-dimension assumption it makes.

## GitHub ingestion

`tech.github_docs` (see `supabase/migrations/0002_github_docs.sql`) holds
READMEs, architecture-decision docs, and merged-PR descriptions pulled from
every repo the Greater Inside GitHub App is installed on — one row per
doc, embedded the same way as the other five tables so Tech Ask can cite
it.

```bash
node scripts/ingest-github.mjs
```

Safe to re-run (upserts on `repo, doc_type, path`). Needs `GITHUB_APP_ID`,
`GITHUB_APP_PRIVATE_KEY`, and `GITHUB_INSTALLATION_ID` on top of the
Supabase/OpenAI keys the backfill script needs — see the script's own
header comment for what it does and doesn't cover yet (no incremental
sync cursor, capped at 50 most-recent merged PRs per repo).

Wired into `match_knowledge`'s union — that function lives in Supabase, not
this repo, so this happened as a manual SQL Editor edit rather than a
migration file here. If it's ever rebuilt from scratch, pull the current
definition (`select pg_get_functiondef('public.match_knowledge'::regproc);`)
and confirm `tech.github_docs` is still in the union.

## Fathom ingestion

`social.fathom_calls` (see `supabase/migrations/0004_fathom_calls.sql`)
holds call transcripts + AI summaries pulled from Fathom (fathom.video —
the meeting notetaker; **not** usefathom.com, an unrelated analytics
product with a confusingly similar name). This is what gives Ask
plain-language product/customer context that code alone can't — code
explains *what's built*, calls explain *what it means and why*.

```bash
node scripts/ingest-fathom.mjs
```

Needs `FATHOM_API_KEY` on top of the Supabase/OpenAI keys. Safe to re-run
(upserts on `meeting_id, chunk_index`). **Unlike the GitHub script, this
one wasn't written against docs I could actually load** — Fathom's docs
domain wasn't reachable when this was built, so the field names it reads
off each meeting (title, transcript, summary, url, recorded-at) are
best-guess based on common API conventions, tried in priority order. The
first run prints the raw shape of the first meeting it fetches — if the
script logs 0 chunks ingested despite meetings existing, that printed
JSON will show which field names to fix in `fetchAllMeetings()`.

A Fathom API key only sees meetings its owner recorded or that were
explicitly shared with them — not the whole team's calls automatically.

Wired into `match_knowledge`'s union, same as GitHub above.

Every chunk is stamped with a short line up front — call title, real
participant names (pulled from the transcript's own speaker labels, which
catch an external client's name even when they're not a calendar invitee),
date, and the actual Fathom watch link — since `match_knowledge` only ever
shows the first 300 characters of whichever chunk matched, and this is
what lets "what did we discuss with Tradewize" or "give me a link to that
call" actually work. A normal re-run only adds *new* chunks — it won't
retroactively stamp this onto calls already ingested before this existed.
To apply it to everything already in the database, run once with
`FORCE_REFRESH=1` (re-embeds and overwrites every chunk, same cost as a
fresh full run — not something to do casually or often):

```bash
FORCE_REFRESH=1 node scripts/ingest-fathom.mjs
```

## Notion ingestion

`tech.notion_docs` (see `supabase/migrations/0012_notion_docs.sql`) holds
project pages, client pages, and SOPs pulled from every page/database
shared with the Alina Notion integration.

```bash
node scripts/ingest-notion.mjs
```

Needs `NOTION_API_KEY` on top of the Supabase/OpenAI keys — generated as an
**internal** integration at notion.so/my-integrations (no OAuth review,
since it never leaves your own workspace). It only sees what's explicitly
shared with it: open a page in Notion, Share -> invite the integration by
name. Sharing a top-level page shares everything nested under it.

Safe to re-run — incremental by Notion's own `last_edited_time`, so a
normal re-run only re-fetches/re-embeds pages that actually changed since
the last run. **After upgrading the script itself** (e.g. this database-
row-expansion fix), unedited objects still look "up to date" against
their old timestamp even though an older, less-capable version of the
script ingested them — run once with `FORCE_REFRESH=1` to re-process
everything regardless of staleness:

```bash
FORCE_REFRESH=1 node scripts/ingest-notion.mjs
```

**Databases are expanded into their actual rows, not just their title.**
A content calendar, campaign tracker, or client list in Notion is a
database — its title alone ("Campaigns & Launches") says almost nothing;
the real content (dates, statuses, owners) lives in each row's columns.
Every shared database's rows get queried and ingested individually, each
row's properties turned into "Column: value" lines, and the same applies
to a database found embedded *inside* a shared page (a `child_database`
block) even if that database was never separately shared. Earlier builds
of this script only stored a database's own title/description — fixed
after that surfaced as a real gap live (asked "what campaigns this week,"
got nothing, even though the calendar was right there in Notion). The
first run after this fix will find every row "new" and ingest all of
them; normal incremental re-runs after that are cheap again.

Wired into `match_knowledge`'s union, same as GitHub and Fathom above.

Once `NOTION_API_KEY` is set, the Notion card on **Sources** flips to
"Connected" on its own (see `lib/connectors.ts`) — no separate toggle.

**A database that's genuinely shared can still be invisible to search.**
Confirmed live: a campaign-tracker database the integration could fetch
directly by id (full schema, real data) never once appeared among ~262
`/v1/search` results — its `parent` is `{"type":"workspace"}` (top-level,
not nested under any page), and Notion's search apparently doesn't
reliably surface those for integrations even with real access. Search is
the only discovery mechanism Notion's API offers — there's no "list
everything this integration can see" endpoint — so the workaround is
`NOTION_EXTRA_IDS`: a comma-separated list of page/database ids (as they
appear in a Notion URL) that get fetched directly every run, regardless
of whether search ever lists them. Diagnose a suspected case of this
yourself before assuming a sharing problem — pull the id out of the
Notion URL (32 hex chars right after `/p/`, dashes optional) and:

```bash
curl -s -H "Authorization: Bearer $NOTION_API_KEY" -H "Notion-Version: 2022-06-28" \
  "https://api.notion.com/v1/databases/<id-with-dashes>"
```

Real data back means it's this search quirk (add it to `NOTION_EXTRA_IDS`);
a 404/"could not find" means it's a genuine sharing gap instead (Share it
with the integration in Notion).

## Document upload

The paperclip button in the Ask composer (`components/ask/Composer.tsx`)
lets anyone attach a PDF, Word (`.docx`), or plain text/markdown file —
`app/api/upload/route.ts` extracts its text (`pdf-parse` / `mammoth`),
chunks and embeds it, and saves it straight into `public.uploaded_docs`
(see `supabase/migrations/0013_uploaded_docs.sql`). It's genuinely
persistent, not a per-conversation attachment: once uploaded, it's part of
the real knowledge base for that workspace, searchable by anyone, same as
a Notion page or a GitHub doc — the Ask thread just shows a confirmation
message ("Added *filename* — N chunks") rather than treating the file as
part of that one exchange.

Same `match_knowledge` union caveat as every other table above: add a
`public.uploaded_docs` branch (filtered by its `workspace` column, same
pattern as `public.conversation_memory`) before uploaded content shows up
in Ask answers.

4MB file size cap (`MAX_UPLOAD_BYTES` in `lib/documents.ts`) — matches
Vercel's serverless request body limit, with room to spare.

A just-uploaded document is also guaranteed context for whatever's asked
next in that workspace, not left purely to `match_knowledge`'s similarity
search — a vague "what's in this"/"summarize it" shares almost no
vocabulary with the document's own content and can legitimately score
below the relevance floor otherwise. `AskScreen.tsx` remembers the most
recent upload's `doc_id` per workspace and sends it as `recentUploadId`
with the next question; `/api/ask` fetches that document's full content
directly (`getUploadContent` in `lib/documents.ts`) and prepends it to the
context regardless of similarity score.

## Live web tools

`lib/rag.ts` gives Claude two more tools alongside the Fathom lookups:
`search_web` (find pages relevant to a query, via Tavily) and `fetch_page`
(read one page's actual text content). Both are read-only, available in
every workspace, and Claude only reaches for them when the knowledge base
genuinely doesn't cover something — a competitor's current pricing,
today's news, a tool's docs. Needs `TAVILY_API_KEY`; `fetch_page` needs no
key of its own (it's a direct fetch + text extraction via `cheerio`).

Deliberately no write/action tools (post something, send something, spend
something) — those have real external consequences and need a
human-approval step this app doesn't have yet. `fetch_page` also refuses
anything that isn't a public `http(s)` URL (blocks localhost/private-IP/
cloud-metadata targets) since the model picks the URL, not a person.

## Env vars

| Var | Used for |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Auth + reads from the browser and server |
| `SUPABASE_SERVICE_ROLE_KEY` | `/api/ask`'s trusted `match_knowledge` calls |
| `OPENAI_API_KEY` | Embedding the question before retrieval (was Voyage AI — switched after account-access problems) |
| `ANTHROPIC_API_KEY` | Composing the answer from retrieved context |
| `ALINA_MODEL` | Optional override for the answer model (default `claude-sonnet-5`) |
| `GITHUB_APP_ID` / `GITHUB_APP_PRIVATE_KEY` / `GITHUB_INSTALLATION_ID` | `scripts/ingest-github.mjs`'s GitHub App auth |
| `FATHOM_API_KEY` | `scripts/ingest-fathom.mjs`'s Fathom API auth |
| `NOTION_API_KEY` | `scripts/ingest-notion.mjs`'s Notion internal integration token |
| `NOTION_EXTRA_IDS` | Optional — comma-separated page/database ids search doesn't surface (see Notion ingestion above) |
| `TAVILY_API_KEY` | `search_web` tool in `lib/rag.ts` — live web search during Ask answers |
| `ELEVENLABS_API_KEY` | `/api/speak` — voice for "Hear this" / auto-speak |
| `ELEVENLABS_VOICE_ID` | Optional — which ElevenLabs voice to use (defaults to a preset one) |

## Next up

- Run the embeddings backfill and each ingestion script (GitHub, Fathom,
  Notion — all three now wired into `match_knowledge`'s union), then
  verify a real Ask query in each of Tech/Social/Support actually returns
  matches.
- Wire Sources' remaining "Connect" buttons (Zoom, Gmail, Google Drive,
  WhatsApp) to real OAuth flows — GitHub, Fathom, and Notion already flip
  to "Connected" live once their env vars are set (see `lib/connectors.ts`).
- Build Routing's rule editor and Team's invite/permission editing.
- Admin UI for editing `workspace_prompts` (today it's DB-only).
- A trigger/webhook that embeds a row on insert, so new content doesn't
  need the backfill script re-run to become searchable, and a scheduled
  re-run of the GitHub ingestion so new READMEs/ADRs/merged PRs keep
  showing up without a manual trigger.
