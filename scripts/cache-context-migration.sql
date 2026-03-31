-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New query)

-- 1. Add exact-match context columns to query_cache
alter table query_cache
  add column if not exists sunday_name text,
  add column if not exists tekstrekke  int,
  add column if not exists series      text;

-- 2. Update match_cache to filter on exact context when provided.
--    Rows without context columns (old entries) are matched regardless.
create or replace function match_cache(
  query_embedding      vector(512),
  similarity_threshold float   default 0.92,
  p_sunday_name        text    default null,
  p_tekstrekke         int     default null,
  p_series             text    default null
)
returns table(response text)
language sql as $$
  select response
  from query_cache
  where 1 - (embedding <=> query_embedding) > similarity_threshold
    and (sunday_name is null or p_sunday_name is null or sunday_name = p_sunday_name)
    and (tekstrekke  is null or p_tekstrekke  is null or tekstrekke  = p_tekstrekke)
    and (series      is null or p_series      is null or series      = p_series)
  order by embedding <=> query_embedding
  limit 1;
$$;
