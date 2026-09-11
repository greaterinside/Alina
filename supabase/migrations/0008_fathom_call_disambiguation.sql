-- get_full_call just proved this necessary against a real question:
-- Fathom auto-titles every unscheduled call "Impromptu Zoom Meeting" — a
-- generic default, not a real name — so several unrelated calls (a
-- financial-platform discussion, a business coaching call, an ad
-- strategy call) all matched the same title lookup. Claude correctly
-- refused to guess which one was meant rather than blending details from
-- the wrong call — the fix is giving it a second, optional filter to
-- disambiguate with, not trusting title alone.
--
-- Drop-then-recreate rather than plain CREATE OR REPLACE: adding a new
-- parameter changes the function's signature, which Postgres would
-- otherwise register as a second overload sitting alongside the old one
-- — ambiguous for PostgREST/supabase-js's .rpc() to resolve.

drop function if exists public.get_fathom_call_content(text, int);

create or replace function public.get_fathom_call_content(
  title_query text,
  participant_query text default null,
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
    and (
      participant_query is null
      or exists (select 1 from unnest(participants) p where p ilike '%' || participant_query || '%')
    )
  group by meeting_id
  limit 5
$$;
