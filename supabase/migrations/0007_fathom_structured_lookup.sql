-- Vector similarity search (match_knowledge) answers "find content similar
-- to this question" — it structurally cannot answer "list every call with
-- X" or "give me everything from this one call," because it only ever
-- returns a small top-K slice ranked across the WHOLE database, not
-- "everything belonging to one call." Confirmed against real questions:
-- asking for action items from a specific call only ever surfaced that
-- call's short Summary chunk, never its actual transcript, because the
-- summary happened to rank higher globally — the transcript was sitting
-- right there in the table, just never selected.
--
-- These two functions give Alina a second, deterministic path alongside
-- similarity search — exact lookups, not ranked guessing — exposed to
-- Claude as tools (see composeAnswer in lib/rag.ts) so it can choose to
-- use them when a question needs "all of X" rather than "closest match."

alter table social.fathom_calls
  add column if not exists participants text[] not null default '{}';

create index if not exists fathom_calls_participants_idx
  on social.fathom_calls using gin (participants);

-- Every call (deduped from its many chunk rows) whose participants array
-- has a name matching the query — for "who have I talked to" / "what
-- calls have I had with X" style questions.
create or replace function public.list_fathom_calls_by_participant(
  name_query text,
  limit_count int default 15
)
returns table(meeting_id text, title text, call_url text, recorded_at timestamptz, participants text[])
language sql
stable
as $$
  select distinct on (meeting_id)
    meeting_id, title, call_url, recorded_at, participants
  from social.fathom_calls
  where exists (
    select 1 from unnest(participants) p where p ilike '%' || name_query || '%'
  )
  order by meeting_id, recorded_at desc nulls last
$$;

-- The FULL reconstructed content of up to 5 calls whose title matches the
-- query — every chunk (summary, entire transcript, action items,
-- highlights) concatenated in order, not a single truncated snippet. Used
-- when a question needs real detail from one specific, already-identified
-- call.
create or replace function public.get_fathom_call_content(
  title_query text,
  max_chars int default 20000
)
returns table(meeting_id text, title text, call_url text, recorded_at timestamptz, content text)
language sql
stable
as $$
  select
    meeting_id,
    max(title) as title,
    max(call_url) as call_url,
    max(recorded_at) as recorded_at,
    left(string_agg(content, E'\n\n' order by chunk_index), max_chars) as content
  from social.fathom_calls
  where title ilike '%' || title_query || '%'
  group by meeting_id
  limit 5
$$;
