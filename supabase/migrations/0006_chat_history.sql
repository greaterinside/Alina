-- Real persistent chat history — separate from and complementary to
-- 0005's conversation_memory. That table is shared/searchable-by-anyone
-- via semantic similarity; this one is what actually lets someone open
-- Alina two days later and see their own conversation still there in a
-- given workspace, the way ChatGPT/Claude's own chat history works.
--
-- One continuous per-person, per-workspace log (matches the app's
-- existing messagesByWs model — no separate "conversations"/threads
-- concept exists yet), not scoped to a single session.

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace text not null check (workspace in ('assistant', 'tech', 'social', 'support')),
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  -- Set only for Report-mode assistant messages — {title, markdown}, same
  -- shape as ReportDoc in lib/types.ts.
  report jsonb,
  created_at timestamptz not null default now()
);

alter table public.chat_messages enable row level security;

create policy "members manage their own chat history"
  on public.chat_messages for all
  using (auth.uid() = user_id);

create index if not exists chat_messages_user_workspace_idx
  on public.chat_messages (user_id, workspace, created_at);
