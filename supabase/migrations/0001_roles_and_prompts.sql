-- Alina — roles, workspace tone/prompt control, and per-user personalization.
--
-- This repo was empty when the frontend rebuild started (no existing
-- Supabase migrations were found), so this file is a proposed schema for
-- the pieces the new frontend depends on. If a `roles` table already
-- exists in the live project under a different shape, adjust
-- lib/identity.ts to match instead of running this migration as-is.
--
-- Assumes the tech / social / support schemas and match_knowledge already
-- exist per the founder's brief; this file only adds what's missing.

create table if not exists public.roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  role text not null check (role in ('admin', 'senior', 'member')),
  -- Which of assistant/tech/social/support this person can query.
  workspaces text[] not null default '{assistant}',
  created_at timestamptz not null default now()
);

alter table public.roles enable row level security;

create policy "members read their own role"
  on public.roles for select
  using (auth.uid() = user_id);

create policy "admins read every role"
  on public.roles for select
  using (
    exists (
      select 1 from public.roles r
      where r.user_id = auth.uid() and r.role = 'admin'
    )
  );

-- Voice note: "each of these devices also has its own tone ... tech will
-- have its own tone, support will have its own tone, content will have
-- its own tone." One master tone/prompt per workspace, editable by
-- admin/senior from the (future) Routing or Sources screen.
create table if not exists public.workspace_prompts (
  workspace text primary key check (workspace in ('assistant', 'tech', 'social', 'support')),
  label text not null,
  system_prompt text not null,
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now()
);

alter table public.workspace_prompts enable row level security;

create policy "anyone signed in can read workspace tone"
  on public.workspace_prompts for select
  using (auth.role() = 'authenticated');

create policy "admins manage workspace tone"
  on public.workspace_prompts for all
  using (
    exists (
      select 1 from public.roles r
      where r.user_id = auth.uid() and r.role in ('admin', 'senior')
    )
  );

-- Voice note: "Alina is an agent every team member has ... unique to
-- them ... but always informed by the master database." A thin
-- per-user layer on top of the master prompt — never a replacement
-- for it, and never a way to see another workspace's data.
create table if not exists public.user_preferences (
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace text not null check (workspace in ('assistant', 'tech', 'social', 'support')),
  -- Short, personal notes on how this person likes answers phrased or
  -- structured — layered on top of workspace_prompts.system_prompt, never
  -- replacing it.
  personal_notes text,
  saved_prompts text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (user_id, workspace)
);

alter table public.user_preferences enable row level security;

create policy "members manage their own preferences"
  on public.user_preferences for all
  using (auth.uid() = user_id);
