import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CLIENT_ID = Deno.env.get('WITHINGS_CLIENT_ID')
const CLIENT_SECRET = Deno.env.get('WITHINGS_CLIENT_SECRET')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { searchParams } = new URL(req.url)
    let userId = searchParams.get('user_id')

    const authHeader = req.headers.get('Authorization')
    if (authHeader) {
      const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
      if (!authError && user) {
        userId = user.id
      } else if (authHeader.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: 'Invalid token' }), { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        })
      }
    }

    if (!userId) return new Response(JSON.stringify({ error: 'User ID required' }), { 
      status: 400, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })

    const { data: auth, error: authError } = await supabase
      .from('withings_auth')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (authError || !auth) return new Response(JSON.stringify({ error: 'Auth not found' }), { 
      status: 400, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })

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

    const startSecs = Math.floor((Date.now() - (30 * 24 * 60 * 60 * 1000)) / 1000)
    
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
          const dateStr = new Date(group.date * 1000).toISOString().split('T')[0]
          const { error } = await supabase.from('metrics').upsert({
            user_id: userId,
            weight: parseFloat(val.toFixed(2)),
            height: 0, bmi: 0,
            created_at: dateStr + 'T12:00:00Z',
            source: 'withings',
            external_id: `with_w_${group.grpid}`
          }, { onConflict: 'external_id' })
          if (!error) mAdded++
        }
      }
    }

    // Activity fetch
    const today = new Date().toISOString().split('T')[0]
    const thirtyDaysAgo = new Date(Date.now() - (30 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0]
    const actRes = await fetch('https://wbsapi.withings.net/v2/measure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        action: 'getactivity',
        access_token: accessToken,
        startdateymd: thirtyDaysAgo,
        enddateymd: today,
        data_fields: 'calories,steps,heart_rate',
      }),
    })
    const actData = await actRes.json()
    
    const aggregated: Record<string, { steps: number, calories: number, hr: number, hr_count: number }> = {}
    
    if (actData.status === 0 && actData.body.activities) {
      for (const act of actData.body.activities) {
        if (!aggregated[act.date]) {
          aggregated[act.date] = { steps: 0, calories: 0, hr: 0, hr_count: 0 }
        }
        aggregated[act.date].steps += (act.steps || 0)
        aggregated[act.date].calories += (act.calories || 0)
        if (act.heart_rate) {
          aggregated[act.date].hr += act.heart_rate
          aggregated[act.date].hr_count += 1
        }
      }
    }

    let aAdded = 0
    let sAdded = 0
    let hAdded = 0
    
    for (const [date, data] of Object.entries(aggregated)) {
      const timestamp = `${date}T12:00:00Z`
      
      // Sync Calories
      if (data.calories > 0) {
        const { error } = await supabase.from('exercise').upsert({
          user_id: userId,
          name: 'Withings Activity',
          calories_burned: Math.round(data.calories),
          created_at: timestamp,
          source: 'withings',
          external_id: `with_a_${date}`
        }, { onConflict: 'external_id' })
        if (!error) aAdded++
      }

      // Sync Steps
      if (data.steps > 0) {
        const { error } = await supabase.from('steps').upsert({
          user_id: userId,
          count: data.steps,
          created_at: timestamp,
          source: 'withings',
          external_id: `with_s_${date}`
        }, { onConflict: 'external_id' })
        if (!error) sAdded++
      }

      // Sync Heart Rate
      if (data.hr_count > 0) {
        const avgHr = Math.round(data.hr / data.hr_count)
        const { error } = await supabase.from('heart_rate').upsert({
          user_id: userId,
          bpm: avgHr,
          created_at: timestamp,
          source: 'withings',
          external_id: `with_h_${date}`
        }, { onConflict: 'external_id' })
        if (!error) hAdded++
      }
    }

    return new Response(JSON.stringify({
      status: 'success',
      metrics_synced: mAdded,
      activities_synced: aAdded,
      steps_synced: sAdded,
      hr_synced: hAdded
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })
  }
})
