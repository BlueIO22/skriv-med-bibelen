-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New query)

-- 1. Add embedding column to church_year_day
alter table church_year_day
  add column if not exists embedding vector(512);

-- 2. Find the best-matching church year day for a query embedding,
--    filtered by series and tekstrekke (lectionary year).
create or replace function match_church_year_day(
  query_embedding      vector(512),
  series_filter        text,
  tekstrekke_filter    int,
  similarity_threshold float default 0.60
)
returns table(
  id                text,
  name              text,
  series            text,
  sunday_name       text,
  tekstrekke        int,
  dato              text,
  ot_reference      text,
  epistle_reference text,
  gospel_reference  text,
  similarity        float
)
language sql as $$
  select
    id, name, series, sunday_name, tekstrekke, dato,
    ot_reference, epistle_reference, gospel_reference,
    1 - (embedding <=> query_embedding) as similarity
  from church_year_day
  where
    series = series_filter
    and tekstrekke = tekstrekke_filter
    and embedding is not null
    and 1 - (embedding <=> query_embedding) > similarity_threshold
  order by embedding <=> query_embedding
  limit 1;
$$;
