-- Similarity search can't answer date-range questions ("what campaigns
-- this week") — a campaign's title/description doesn't semantically
-- resemble the word "week," so even correctly-ingested content can score
-- below relevance regardless of tuning. Same problem Fathom already hit
-- (see 0009/0011) and solved with real SQL date-range lookups instead of
-- embeddings. This column is that fix for Notion database rows: a
-- content calendar / campaign tracker's actual launch/event date, pulled
-- straight from whichever date-type property the row has (see
-- scripts/ingest-notion.mjs), so a tool can filter by real date instead
-- of guessing from text similarity.

alter table tech.notion_docs add column if not exists row_date timestamptz;

create index if not exists notion_docs_row_date_idx on tech.notion_docs (row_date) where row_date is not null;
