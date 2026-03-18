-- Create trainer_chat table
create table if not exists trainer_chat (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  message text not null,
  is_ai boolean default false not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table trainer_chat enable row level security;

-- RLS Policies
drop policy if exists "Users can manage own chat history" on trainer_chat;
create policy "Users can manage own chat history" on trainer_chat for all using (auth.uid() = user_id);
