import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)

Deno.serve(async (req) => {
  try {
    // 1. Get all unique users who have connected Withings
    const { data: authRecords, error: authError } = await supabase
      .from('withings_auth')
      .select('user_id')

    if (authError || !authRecords) {
      return new Response(JSON.stringify({ error: 'Failed to fetch auth records' }), { status: 500 })
    }

    // Use a Set to get unique user IDs
    const userIds = Array.from(new Set(authRecords.map(r => r.user_id)))
    console.log(`Syncing for ${userIds.length} users...`)

    // 2. Trigger sync for each user
    // Note: We're doing this sequentially for simplicity. 
    // For many users, you might want to trigger these as independent async calls.
    const results = []
    for (const userId of userIds) {
      try {
        console.log(`Syncing user: ${userId}`)
        // We'll call the existing withings-sync function directly for each user
        // We pass the SERVICE_ROLE_KEY to bypass RLS/Auth check in the sync function
        const syncRes = await fetch(`${SUPABASE_URL}/functions/v1/withings-sync?user_id=${userId}`, {
          headers: { 'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` }
        })
        const syncData = await syncRes.json()
        results.push({ userId, status: syncData.status, error: syncData.error })
      } catch (err) {
        results.push({ userId, status: 'failed', error: err.message })
      }
    }

    return new Response(JSON.stringify({
      status: 'complete',
      users_synced: results.length,
      details: results
    }), { headers: { 'Content-Type': 'application/json' } })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})
