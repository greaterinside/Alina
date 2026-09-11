-- Real bug, caught by Claude's own accurate self-diagnosis against a real
-- question: get_fathom_call_content's `limit 5` had no ORDER BY in front
-- of it. With a recurring title like "Success Partners" matching 6+
-- distinct calls, which 5 came back was whatever arbitrary order
-- Postgres's GROUP BY happened to produce — not "the 5 most relevant,"
-- just whichever 5 — and the one actually being asked about (the most
-- recent, Sept 3) kept losing that lottery to five older ones.
--
-- Two fixes: order deterministically by recorded_at desc before the
-- limit (so "most recent" is what LIMIT 5 actually means), and add an
-- optional exact-date filter so the model can pin down precisely the
-- right call when it already knows the date — the most robust fix,
-- since "most recent 5" alone still isn't enough once a title has more
-- than 5 matches total and the one wanted isn't among the newest 5.

drop function if exists public.get_fathom_call_content(text, text, int);

create or replace function public.get_fathom_call_content(
  title_query text,
  participant_query text default null,
  on_date date default null,
  max_chars int default 20000
)
returns table(meeting_id text, title text, call_url text, recorded_at timestamptz, content text)
language sql
stable
as $$
  select meeting_id, title, call_url, recorded_at, content
  from (
    select
      meeting_id,
      max(title) as title,
      max(call_url) as call_url,
      max(recorded_at) as recorded_at,
      left(string_agg(content, E'\n\n' order by chunk_index), max_chars) as content
    from social.fathom_calls
    where title ilike '%' || title_query || '%'
      and (
        participant_query is null
        or exists (select 1 from unnest(participants) p where p ilike '%' || participant_query || '%')
      )
      and (on_date is null or recorded_at::date = on_date)
    group by meeting_id
  ) matched
  order by recorded_at desc nulls last
  limit 5
$$;
