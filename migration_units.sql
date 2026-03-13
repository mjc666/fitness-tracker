-- Add units column to profiles
alter table profiles add column if not exists units text default 'metric'; -- 'metric' (kg/cm) or 'imperial' (lb/in)
