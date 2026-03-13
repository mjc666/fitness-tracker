import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CLIENT_ID = Deno.env.get('WITHINGS_CLIENT_ID')
const CLIENT_SECRET = Deno.env.get('WITHINGS_CLIENT_SECRET')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)

Deno.serve(async (req) => {
  try {
    const { searchParams } = new URL(req.url)
    let userId = searchParams.get('user_id')

    // If no user_id in params, try to get from Auth header (if provided)
    if (!userId) {
      const authHeader = req.headers.get('Authorization')
      if (authHeader) {
        const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
        userId = user?.id
      }
    }

    if (!userId) return new Response(JSON.stringify({ error: 'User ID required' }), { status: 400 })

    // 1. Get the auth record for THIS specific user
    const { data: auth, error: authError } = await supabase
      .from('withings_auth')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (authError || !auth) return new Response(JSON.stringify({ error: 'Auth not found' }), { status: 400 })

    let accessToken = auth.access_token
    const expiresAt = new Date(auth.expires_at)

    if (expiresAt.getTime() < Date.now() + 60000) {
      const refreshResponse = await fetch('https://wbsapi.withings.net/v2/oauth2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          action: 'requesttoken',
          grant_type: 'refresh_token',
          client_id: CLIENT_ID!,
          client_secret: CLIENT_SECRET!,
          refresh_token: auth.refresh_token,
        }),
      })
      const refreshData = await refreshResponse.json()
      if (refreshData.status === 0) {
        accessToken = refreshData.body.access_token
        const newExpiresAt = new Date()
        newExpiresAt.setSeconds(newExpiresAt.getSeconds() + refreshData.body.expires_in)
        await supabase.from('withings_auth').update({
          access_token: accessToken,
          refresh_token: refreshData.body.refresh_token,
          expires_at: newExpiresAt.toISOString(),
        }).eq('id', auth.id)
      }
    }

    const startSecs = Math.floor((Date.now() - (365 * 24 * 60 * 60 * 1000)) / 1000)
    
    // Weight fetch
    const weightRes = await fetch('https://wbsapi.withings.net/measure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        action: 'getmeas',
        access_token: accessToken,
        meastypes: '1',
        category: '1',
        startdate: startSecs.toString(),
      }),
    })
    const weightData = await weightRes.json()
    
    let mAdded = 0
    if (weightData.status === 0 && weightData.body.measuregrps) {
      for (const group of weightData.body.measuregrps) {
        const m = group.measures.find((m: any) => m.type === 1)
        if (m) {
          const val = m.value * Math.pow(10, m.unit)
          const { error } = await supabase.from('metrics').upsert({
            user_id: userId,
            weight: parseFloat(val.toFixed(2)),
            height: 0, bmi: 0,
            created_at: new Date(group.date * 1000).toISOString(),
            source: 'withings',
            external_id: `with_w_${group.grpid}`
          }, { onConflict: 'external_id' })
          if (!error) mAdded++
        }
      }
    }

    // Activity fetch
    const today = new Date().toISOString().split('T')[0]
    const yearAgo = new Date(Date.now() - (365 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0]
    const actRes = await fetch('https://wbsapi.withings.net/v2/measure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        action: 'getactivity',
        access_token: accessToken,
        startdateymd: yearAgo,
        enddateymd: today,
        data_fields: 'calories',
      }),
    })
    const actData = await actRes.json()
    let aAdded = 0
    if (actData.status === 0 && actData.body.activities) {
      for (const act of actData.body.activities) {
        if (act.calories > 0) {
          const { error } = await supabase.from('exercise').upsert({
            user_id: userId,
            name: 'Withings Activity',
            calories_burned: Math.round(act.calories),
            created_at: act.date + 'T12:00:00Z',
            source: 'withings',
            external_id: `with_a_${act.date}`
          }, { onConflict: 'external_id' })
          if (!error) aAdded++
        }
      }
    }

    return new Response(JSON.stringify({
      status: 'success',
      metrics_synced: mAdded,
      activities_synced: aAdded
    }), { headers: { 'Content-Type': 'application/json' } })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})
