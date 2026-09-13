-- Notion knowledge ingestion: project pages, client pages, and SOPs pulled
-- from every page/database shared with the Alina Notion integration —
-- same shape as tech.github_docs so match_knowledge can search it the
-- same way once its union branch is updated (see README's Notion
-- ingestion section). Populated by scripts/ingest-notion.mjs — this table
-- mirrors Notion, it's never written to by hand.
--
-- `path` is the Notion page id, or `<page id>#chunkN` for a page long
-- enough to need splitting — unique on its own, so no separate composite
-- key like github_docs' (repo, doc_type, path) is needed here (there's
-- only ever one Notion workspace, not many repos).
--
-- Uses vector(1024) to match the rest of the schema's OpenAI
-- text-embedding-3-small assumption (see scripts/ingest-notion.mjs).

create table if not exists tech.notion_docs (
  id uuid primary key default gen_random_uuid(),
  page_id text not null,
  doc_type text not null check (doc_type in ('page', 'database')),
  path text not null unique,
  title text,
  content text not null,
  source_url text,
  embedding vector(1024),
  notion_updated_at timestamptz,
  ingested_at timestamptz not null default now()
);

create index if not exists notion_docs_page_id_idx on tech.notion_docs (page_id);

-- Needed on top of the tech-schema SELECT default already granted — this
-- table is also written to (by the ingestion script, not by end users).
grant select, insert, update on tech.notion_docs to service_role;
