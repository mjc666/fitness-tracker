-- Enable necessary extensions if not enabled
create extension if not exists pg_net;
create extension if not exists pg_cron;

-- Schedule the 'withings-sync-all' function to run every 4 hours
-- This version fetches the API key from the Supabase Vault for security
select
  cron.schedule(
    'sync-withings-all-users',
    '0 */4 * * *', -- At minute 0 of every 4th hour
    $$
    declare
      api_key text;
    begin
      -- 1. Fetch the secret from the vault
      select secret into api_key from vault.secrets where name = 'withings_sync_api_key';

      -- 2. Trigger the sync if the key exists
      if api_key is not null then
        perform net.http_post(
          url:='https://asxpzqmtsgfiabvaeotq.supabase.co/functions/v1/withings-sync-all',
          headers:=jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || api_key
          ),
          body:='{}'::jsonb
        );
      end if;
    end;
    $$
  );
