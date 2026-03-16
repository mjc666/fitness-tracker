-- Add birthday and gender to profiles table
alter table profiles 
add column birthday date,
add column gender text;
