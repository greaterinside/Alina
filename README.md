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
cp .env.example .env.local   # fill in Supabase / Voyage / Anthropic keys
npm run dev
```

Without the env vars set, the app still runs: the sidebar defaults to a
demo admin identity (so every screen is reachable) and `/api/ask` returns
a plain "I'm not connected yet" message instead of inventing an answer.

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
`SUPABASE_SERVICE_ROLE_KEY` and `VOYAGE_API_KEY` (reads `.env.local` if
present). See the script's own header comment for the Voyage model /
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
Supabase/Voyage keys the backfill script needs — see the script's own
header comment for what it does and doesn't cover yet (no incremental
sync cursor, capped at 50 most-recent merged PRs per repo).

**This table isn't wired into `match_knowledge` yet.** That function lives
in Supabase, not in this repo, and only knows about the original six
tables — it needs a new branch added for `tech.github_docs` before GitHub
content shows up in any Ask answer. Pull the function's current definition
(`select pg_get_functiondef('public.match_knowledge'::regproc);` in the
SQL Editor) and add the union branch before relying on this.

## Env vars

| Var | Used for |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Auth + reads from the browser and server |
| `SUPABASE_SERVICE_ROLE_KEY` | `/api/ask`'s trusted `match_knowledge` calls |
| `VOYAGE_API_KEY` | Embedding the question before retrieval |
| `ANTHROPIC_API_KEY` | Composing the answer from retrieved context |
| `ALINA_MODEL` | Optional override for the answer model (default `claude-sonnet-5`) |
| `GITHUB_APP_ID` / `GITHUB_APP_PRIVATE_KEY` / `GITHUB_INSTALLATION_ID` | `scripts/ingest-github.mjs`'s GitHub App auth |
| `ELEVENLABS_API_KEY` | `/api/speak` — voice for "Hear this" / auto-speak |
| `ELEVENLABS_VOICE_ID` | Optional — which ElevenLabs voice to use (defaults to a preset one) |

## Next up

- Add `tech.github_docs` to `match_knowledge`'s union (see **GitHub
  ingestion** above), then run the embeddings backfill and the GitHub
  ingestion script, and verify a real Ask query in each of
  Tech/Social/Support actually returns matches.
- Wire Sources' "Connect" buttons to real OAuth flows and flip `connected`
  in `lib/connectors.ts` to read live state instead of a hardcoded `false`.
- Build Routing's rule editor and Team's invite/permission editing.
- Admin UI for editing `workspace_prompts` (today it's DB-only).
- A trigger/webhook that embeds a row on insert, so new content doesn't
  need the backfill script re-run to become searchable, and a scheduled
  re-run of the GitHub ingestion so new READMEs/ADRs/merged PRs keep
  showing up without a manual trigger.
