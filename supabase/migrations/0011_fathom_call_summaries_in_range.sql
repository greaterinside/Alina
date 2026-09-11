-- Real gap surfaced by a real question: "what are the recurring themes or
-- concerns across my client calls this quarter?" Answering that needs a
-- pass over MANY calls at once — but the only existing tools are
-- list_recent_fathom_calls (titles/dates only, no content) and
-- get_fathom_call_content (full transcript of ONE call, up to 20k chars).
-- Looping get_fathom_call_content over a whole quarter's worth of calls
-- blows both the tool-iteration cap and the context window with full
-- transcripts the question never needed — themes only need each call's
-- summary, not its verbatim transcript.
--
-- chunk_index 0 is exactly that: chunkMeeting() in ingest-fathom.mjs
-- pushes the "Summary:" chunk first, before any transcript chunks, when a
-- summary exists — so chunk_index = 0 is a short, dense digest of the
-- call. (On the rare call with no Fathom-provided summary, chunk_index 0
-- falls back to the first ~3000 chars of transcript instead — still
-- bounded and still useful for a themes pass, just less concise.)

create or replace function public.get_fathom_call_summaries(
  since_date date default null,
  until_date date default null,
  limit_count int default 40
)
returns table(meeting_id text, title text, call_url text, recorded_at timestamptz, participants text[], summary text)
language sql
stable
as $$
  select meeting_id, title, call_url, recorded_at, participants, content as summary
  from social.fathom_calls
  where chunk_index = 0
    and (since_date is null or recorded_at::date >= since_date)
    and (until_date is null or recorded_at::date <= until_date)
  order by recorded_at desc nulls last
  limit limit_count
$$;
