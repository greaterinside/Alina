-- support.tickets already existed before this rebuild (customer_email,
-- customer_name, question, drafted_reply, status, embedding, etc. — see
-- README's Embeddings backfill section) but had no columns identifying
-- which Gmail message/thread a row came from. Without those, a re-run of
-- the Gmail draft-reply cron would have no way to tell "already drafted
-- this one" from "new email" and would draft duplicate replies forever.
alter table support.tickets add column if not exists gmail_message_id text;
alter table support.tickets add column if not exists gmail_thread_id text;
alter table support.tickets add column if not exists subject text;

create unique index if not exists tickets_gmail_message_id_idx
  on support.tickets (gmail_message_id)
  where gmail_message_id is not null;
