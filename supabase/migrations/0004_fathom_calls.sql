-- Fathom call recordings/transcripts — a new workspace-scoped table
-- alongside social.recordings. That table's live schema (if it exists at
-- all) predates this rebuild and isn't controlled here, so rather than
-- guess at its columns and risk a blind insert failing on an unknown
-- NOT NULL constraint, this is a dedicated table this app fully owns.
-- Populated only by scripts/ingest-fathom.mjs — never written to by hand.
--
-- One row per transcript CHUNK, not per call — long calls are split the
-- same way scripts/ingest-github.mjs splits large source files, so
-- retrieval can match a specific part of a long transcript instead of
-- only ever pulling in the whole (truncated) thing.
--
-- Uses vector(1024) to match text-embedding-3-small's pinned dimension,
-- same as tech.github_docs.

create table if not exists social.fathom_calls (
  id uuid primary key default gen_random_uuid(),
  meeting_id text not null,
  chunk_index int not null default 0,
  title text,
  call_url text,
  recorded_at timestamptz,
  content text not null,
  embedding vector(1024),
  ingested_at timestamptz not null default now(),
  unique (meeting_id, chunk_index)
);

grant select, insert, update on social.fathom_calls to service_role;
