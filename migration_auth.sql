-- Migration to add Auth and Profiles
-- Run this if you already have the basic tables (food, exercise, metrics, withings_auth)

-- 1. Create the Profiles table
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  full_name text,
  height double precision,
  goal_weight double precision,
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- Enable RLS for profiles
alter table profiles enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Users can view own profile') then
    create policy "Users can view own profile" on profiles for select using (auth.uid() = id);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'Users can update own profile') then
    create policy "Users can update own profile" on profiles for update using (auth.uid() = id);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'Users can insert own profile') then
    create policy "Users can insert own profile" on profiles for insert with check (auth.uid() = id);
  end if;
end $$;

-- 2. Add user_id column to existing tables
alter table food add column if not exists user_id uuid references auth.users default auth.uid();
alter table exercise add column if not exists user_id uuid references auth.users default auth.uid();
alter table metrics add column if not exists user_id uuid references auth.users default auth.uid();
alter table withings_auth add column if not exists user_id uuid references auth.users default auth.uid();

-- 3. Enable Row Level Security (RLS) on all tables
alter table food enable row level security;
alter table exercise enable row level security;
alter table metrics enable row level security;
alter table withings_auth enable row level security;

-- 4. Create Security Policies
do $$ begin
  if not exists (select 1 from pg_policies where policyname = 'Users can manage own food') then
    create policy "Users can manage own food" on food for all using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'Users can manage own exercise') then
    create policy "Users can manage own exercise" on exercise for all using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'Users can manage own metrics') then
    create policy "Users can manage own metrics" on metrics for all using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where policyname = 'Users can manage own withings_auth') then
    create policy "Users can manage own withings_auth" on withings_auth for all using (auth.uid() = user_id);
  end if;
end $$;
