-- Adds the 'code_file' doc_type so scripts/ingest-github.mjs can store
-- chunks of actual source files (not just README/ADR/PR text) in the same
-- tech.github_docs table. Finds and replaces whatever the doc_type check
-- constraint is actually named in this database, rather than assuming
-- Postgres's default naming, since that's derived automatically and can
-- vary by how the table was created.

do $$
declare
  con_name text;
begin
  select conname into con_name
  from pg_constraint
  where conrelid = 'tech.github_docs'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%doc_type%';

  if con_name is not null then
    execute format('alter table tech.github_docs drop constraint %I', con_name);
  end if;
end $$;

alter table tech.github_docs
  add constraint github_docs_doc_type_check
  check (doc_type in ('readme', 'adr', 'pr_description', 'code_file'));
