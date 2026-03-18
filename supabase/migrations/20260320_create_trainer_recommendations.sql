-- Create trainer_recommendations table
create table if not exists trainer_recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null unique,
  exercises text,
  nutrition text,
  supplements text,
  diet text,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table trainer_recommendations enable row level security;

-- RLS Policies
drop policy if exists "Users can manage own recommendations" on trainer_recommendations;
create policy "Users can manage own recommendations" on trainer_recommendations for all using (auth.uid() = user_id);
