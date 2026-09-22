-- Supabase's Security Advisor flagged these 4 as critical: public, with
-- RLS never enabled — meaning the public anon key (shipped to every
-- browser by design) could query them directly via PostgREST, bypassing
-- this app entirely. All four were created by this rebuild's own
-- migrations (0004, 0005, 0012, 0013) and RLS was simply never added.
--
-- Confirmed every reference to these tables in the codebase goes through
-- getSupabaseServiceClient() (server-only, service role — bypasses RLS
-- by design) — nothing in browser-facing code queries any of them
-- directly. So no policy is added here on purpose: enabling RLS with
-- zero policies default-denies the anon/authenticated roles completely
-- while leaving every real code path (which never used those roles for
-- these tables anyway) unaffected.
alter table social.fathom_calls enable row level security;
alter table public.conversation_memory enable row level security;
alter table public.uploaded_docs enable row level security;
alter table tech.notion_docs enable row level security;
