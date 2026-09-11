-- Persistent memory, two kinds:
--
-- 1. public.user_preferences already exists in 0001_roles_and_prompts.sql
--    (personal_notes per person per workspace) but nothing ever wrote to
--    it — /api/ask only read it. This migration doesn't touch that table;
--    it's here as a reminder that this file assumes it already exists.
--    Run this first if it doesn't:
--      create table if not exists public.user_preferences (
--        user_id uuid not null references auth.users (id) on delete cascade,
--        workspace text not null check (workspace in ('assistant', 'tech', 'social', 'support')),
--        personal_notes text,
--        saved_prompts text[] not null default '{}',
--        updated_at timestamptz not null default now(),
--        primary key (user_id, workspace)
--      );
--      alter table public.user_preferences enable row level security;
--      create policy "members manage their own preferences"
--        on public.user_preferences for all using (auth.uid() = user_id);
--
-- 2. public.conversation_memory (new, this migration) — shared, not
--    per-person: every well-grounded chat answer (one that actually had
--    real matches behind it, not an "I don't know") gets embedded and
--    saved here, so a good answer given once can surface again for a
--    related question from anyone, the same way a GitHub doc or a Fathom
--    call would. Not schema-scoped under tech/social/support like those,
--    since a conversation can happen in any of the four workspaces
--    (including "assistant", which isn't a schema) — filtered by the
--    `workspace` column instead.

create table if not exists public.conversation_memory (
  id uuid primary key default gen_random_uuid(),
  workspace text not null check (workspace in ('assistant', 'tech', 'social', 'support')),
  question text not null,
  answer text not null,
  content text not null,
  embedding vector(1024),
  asked_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

grant select, insert on public.conversation_memory to service_role;
