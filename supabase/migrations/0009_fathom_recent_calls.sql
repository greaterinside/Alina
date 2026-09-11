-- Direct gap surfaced by a real question: "what calls have I had this
-- month" — list_fathom_calls_by_participant only searches BY a name;
-- there was no way to just browse calls chronologically. Alina correctly
-- said so rather than guessing, but the tool genuinely didn't exist yet.
--
-- Writing the new one surfaced a real bug in the existing one, fixed here
-- too: `limit_count` was declared but never used in a LIMIT clause (only
-- ever looked fine because every test so far happened to match just one
-- call), and DISTINCT ON's required ORDER BY (meeting_id, recorded_at)
-- means the dedup step's own row order is by meeting_id TEXT, not by
-- date — genuine chronological order + the limit both need a second,
-- outer ORDER BY/LIMIT on top of the dedup subquery, not folded into it.

create or replace function public.list_fathom_calls_by_participant(
  name_query text,
  limit_count int default 15
)
returns table(meeting_id text, title text, call_url text, recorded_at timestamptz, participants text[])
language sql
stable
as $$
  select meeting_id, title, call_url, recorded_at, participants
  from (
    select distinct on (meeting_id)
      meeting_id, title, call_url, recorded_at, participants
    from social.fathom_calls
    where exists (
      select 1 from unnest(participants) p where p ilike '%' || name_query || '%'
    )
    order by meeting_id, recorded_at desc nulls last
  ) deduped
  order by recorded_at desc nulls last
  limit limit_count
$$;

-- Every call (deduped), most recent first, optionally since a given date
-- — for "what calls have I had this month" / "catch me up on recent
-- calls" style questions that aren't about any one specific person.
create or replace function public.list_recent_fathom_calls(
  since_date timestamptz default null,
  limit_count int default 25
)
returns table(meeting_id text, title text, call_url text, recorded_at timestamptz, participants text[])
language sql
stable
as $$
  select meeting_id, title, call_url, recorded_at, participants
  from (
    select distinct on (meeting_id)
      meeting_id, title, call_url, recorded_at, participants
    from social.fathom_calls
    where since_date is null or recorded_at >= since_date
    order by meeting_id, recorded_at desc nulls last
  ) deduped
  order by recorded_at desc nulls last
  limit limit_count
$$;
