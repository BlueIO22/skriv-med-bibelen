-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New query)

-- 1. Cache table
create table if not exists query_cache (
  id         uuid    primary key default gen_random_uuid(),
  query_text text    not null,
  embedding  vector(512) not null,
  response   text    not null,
  created_at timestamptz default now()
);

-- 2. Find a cached response similar enough to the incoming query
create or replace function match_cache(
  query_embedding   vector(512),
  similarity_threshold float default 0.92
)
returns table(response text)
language sql as $$
  select response
  from query_cache
  where 1 - (embedding <=> query_embedding) > similarity_threshold
  order by embedding <=> query_embedding
  limit 1;
$$;

-- 3. Trim cache to newest 500 rows
create or replace function cleanup_query_cache()
returns void
language sql as $$
  delete from query_cache
  where id in (
    select id from query_cache
    order by created_at asc
    offset 500
  );
$$;
