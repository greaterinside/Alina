-- Manually uploaded documents (PDF/DOCX/TXT), attached from the Ask
-- composer. Deliberately public.*, workspace-column-scoped, not
-- schema-per-workspace — same reasoning as public.conversation_memory in
-- 0005_conversation_memory.sql: an upload can happen from any of the four
-- workspace tabs (including "assistant", which isn't a schema), so it's
-- filtered by the `workspace` column instead of a tech./social./support.
-- table prefix.
--
-- One uploaded file becomes several rows (one per chunk, sharing doc_id)
-- once it's long enough to need splitting — same shape as every other
-- ingested-doc table in this schema. Written by app/api/upload/route.ts,
-- never by hand.

create table if not exists public.uploaded_docs (
  id uuid primary key default gen_random_uuid(),
  doc_id uuid not null default gen_random_uuid(),
  workspace text not null check (workspace in ('assistant', 'tech', 'social', 'support')),
  filename text not null,
  chunk_index int not null default 0,
  content text not null,
  embedding vector(1024),
  uploaded_by uuid references auth.users (id) on delete set null,
  uploaded_at timestamptz not null default now()
);

create index if not exists uploaded_docs_doc_id_idx on public.uploaded_docs (doc_id);

grant select, insert on public.uploaded_docs to service_role;
