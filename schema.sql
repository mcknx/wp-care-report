-- VA P6 care-plan report: one row per weekly run — the raw check data and Claude's checked report.
create table if not exists p6_reports (
  id serial primary key,
  run_at timestamptz default now(),
  status text check (status in ('green','amber','red')),
  data jsonb,
  report jsonb,
  emailed boolean default false
);
