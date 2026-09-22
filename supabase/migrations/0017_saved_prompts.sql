-- Explicit, user-saved prompt templates ("save this prompt, reuse it on
-- purpose later") — a deliberate, separate thing from
-- public.user_preferences.personal_notes, which is auto-extracted memory
-- nobody chose to save. public.user_preferences.saved_prompts (text[])
-- was reserved for this back in 0001 but never built on: no title, no id
-- to edit/delete one entry safely, no way to mark a prompt shared with a
-- workspace — a real table instead of trying to repurpose that column.
create table if not exists public.saved_prompts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace text not null check (workspace in ('assistant', 'tech', 'social', 'support')),
  title text not null,
  -- The prompt text itself; may contain {{variable}} placeholders the UI
  -- prompts for and fills in before dropping it into the composer.
  body text not null,
  -- Personal by default. When true, anyone with access to this workspace
  -- (public.roles.workspaces) can see and use it — but only the owner
  -- can edit or delete it, so sharing never creates a collision over who
  -- controls a template.
  is_shared boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists saved_prompts_user_workspace_idx on public.saved_prompts (user_id, workspace);
create index if not exists saved_prompts_shared_workspace_idx on public.saved_prompts (workspace) where is_shared;

alter table public.saved_prompts enable row level security;

create policy "owners manage their own prompts"
  on public.saved_prompts for all
  using (auth.uid() = user_id);

create policy "workspace members read shared prompts"
  on public.saved_prompts for select
  using (
    is_shared
    and exists (
      select 1 from public.roles r
      where r.user_id = auth.uid() and public.saved_prompts.workspace = any (r.workspaces)
    )
  );
