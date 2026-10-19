create table if not exists stream_source (
  idx          int primary key,
  features     double precision[] not null,  -- 30 nilai: Time, V1..V28, Amount
  actual_class int                            -- null kalau feed asli tanpa label
);

create table if not exists transactions (
  id           bigint generated always as identity primary key,
  source_idx   int unique references stream_source(idx),
  ingested_at  timestamptz not null default now(),
  txn_time     double precision,
  amount       double precision,
  prob         double precision not null,
  flagged      boolean not null,              -- prob >= 0.5463
  actual_class int,
  features     double precision[]
);
create index on transactions (ingested_at desc);
create index on transactions (prob desc);
create index on transactions (flagged) where flagged;

create table if not exists ingest_state (
  id            int primary key default 1,
  cursor        int not null default 0,
  last_run      timestamptz,
  rows_ingested bigint not null default 0,
  constraint single_row check (id = 1)
);
insert into ingest_state (id) values (1) on conflict do nothing;

create or replace view v_stats_summary as
select count(*)                                            as total,
       count(*) filter (where flagged)                     as flagged,
       count(*) filter (where actual_class = 1 and flagged)     as tp,
       count(*) filter (where actual_class = 0 and flagged)     as fp,
       count(*) filter (where actual_class = 1 and not flagged) as fn,
       count(*) filter (where actual_class = 0 and not flagged) as tn,
       avg(prob) as avg_prob, max(ingested_at) as last_ingested
from transactions;

create or replace view v_stats_hourly as
select date_trunc('hour', ingested_at) as hour, count(*) as n,
       count(*) filter (where flagged) as flagged,
       count(*) filter (where actual_class = 1) as actual_fraud
from transactions group by 1;

create or replace view v_prob_hist as
select width_bucket(prob, 0, 1, 20) as bucket, count(*) as n
from transactions group by 1;

-- keamanan: API kita pakai service_role key (bypass RLS); anon diblokir
alter table stream_source enable row level security;
alter table transactions  enable row level security;
alter table ingest_state  enable row level security;