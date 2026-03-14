-- Add carbs column to food table
alter table food add column if not exists carbs integer default 0;
