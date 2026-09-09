-- GitHub knowledge ingestion: README / architecture-decision / merged-PR
-- content, one workspace-scoped table alongside tech.notes and
-- tech.meeting_notes so match_knowledge can search it the same way.
-- Populated by scripts/ingest-github.mjs — this table mirrors GitHub, it's
-- never written to by hand.
--
-- Uses vector(1024) to match voyage-3's output dimension, same assumption
-- scripts/backfill-embeddings.mjs makes for the other five tables.

create table if not exists tech.github_docs (
  id uuid primary key default gen_random_uuid(),
  repo text not null,
  doc_type text not null check (doc_type in ('readme', 'adr', 'pr_description')),
  path text not null,
  title text,
  content text not null,
  source_url text,
  embedding vector(1024),
  github_updated_at timestamptz,
  ingested_at timestamptz not null default now(),
  unique (repo, doc_type, path)
);

-- Needed on top of the tech-schema SELECT default already granted — this
-- table is also written to (by the ingestion script, not by end users).
grant select, insert, update on tech.github_docs to service_role;
