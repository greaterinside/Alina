# Alina

Internal AI knowledge assistant for Greater Inside. Next.js 14 (App Router) +
TypeScript + Tailwind, on top of the shared Supabase project.

## Status: this rebuild, honestly

This branch was started against an **empty repository** — no prior Next.js
app, API routes, or Supabase migrations existed in `greaterinside/alina` to
build on. So instead of only adding UI on top of working `app/api/projects`,
`app/api/recordings/ingest`, and `match_knowledge` routes as planned, this
scaffold defines the contract those pieces need to satisfy (see
`lib/rag.ts` and `app/api/ask/route.ts`) and wires the frontend to call it.
Point `NEXT_PUBLIC_SUPABASE_URL` / keys at the real project and the same
code path starts answering from live data — nothing here needs rewriting,
just wiring.

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

## Env vars

| Var | Used for |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Auth + reads from the browser and server |
| `SUPABASE_SERVICE_ROLE_KEY` | `/api/ask`'s trusted `match_knowledge` calls |
| `VOYAGE_API_KEY` | Embedding the question before retrieval |
| `ANTHROPIC_API_KEY` | Composing the answer from retrieved context |
| `ALINA_MODEL` | Optional override for the answer model (default `claude-sonnet-5`) |

## Next up

- Wire Sources' "Connect" buttons to real OAuth flows and flip `connected`
  in `lib/connectors.ts` to read live state instead of a hardcoded `false`.
- Build Routing's rule editor and Team's invite/permission editing.
- Admin UI for editing `workspace_prompts` (today it's DB-only).
- Confirm `match_knowledge`'s real RPC signature in the live project and
  adjust `lib/rag.ts#matchKnowledge` if it differs from the guess here.
