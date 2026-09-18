-- support.tickets predates this rebuild (see 0015's header comment) and
-- was apparently never granted to service_role — the Postgres role this
-- app's backend actually writes as (getSupabaseServiceClient). Confirmed
-- live: the Gmail draft-reply cron's very first real insert failed with
-- "permission denied for table tickets", the exact Postgres error for a
-- missing GRANT, not an RLS policy rejection (service_role bypasses RLS
-- by default in Supabase — this was never an RLS problem).
grant select, insert, update on support.tickets to service_role;
