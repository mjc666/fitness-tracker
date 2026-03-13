// Follow this setup guide to integrate the Withings API:
// https://developer.withings.com/api-reference/

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CLIENT_ID = Deno.env.get('WITHINGS_CLIENT_ID')
const CLIENT_SECRET = Deno.env.get('WITHINGS_CLIENT_SECRET')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

Deno.serve(async (req) => {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')

  if (!code) {
    return new Response(JSON.stringify({ error: 'No code provided' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // 1. Exchange code for access/refresh tokens
  const tokenResponse = await fetch('https://wbsapi.withings.net/v2/oauth2', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      action: 'requesttoken',
      grant_type: 'authorization_code',
      client_id: CLIENT_ID!,
      client_secret: CLIENT_SECRET!,
      code: code,
      redirect_uri: `https://${new URL(req.url).hostname}/functions/v1/withings-oauth`,
    }),
  })

  const tokenData = await tokenResponse.json()

  if (tokenData.status !== 0) {
    return new Response(JSON.stringify({ error: 'Withings token error', details: tokenData }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { access_token, refresh_token, expires_in, userid } = tokenData.body

  // 2. Store tokens in withings_auth table
  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)
  
  const expires_at = new Date()
  expires_at.setSeconds(expires_at.getSeconds() + expires_in)

  const { error: upsertError } = await supabase
    .from('withings_auth')
    .upsert({
      userid: userid.toString(),
      access_token,
      refresh_token,
      expires_at: expires_at.toISOString(),
    }, { onConflict: 'userid' })

  if (upsertError) {
    return new Response(JSON.stringify({ error: 'Database error', details: upsertError }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // 3. Success! Redirect or show a success message
  return new Response(`
    <html>
      <body style="font-family: sans-serif; text-align: center; padding-top: 50px;">
        <h1 style="color: #10b981;">Successfully Connected!</h1>
        <p>Your Withings account is now linked to your Fitness Tracker.</p>
        <p>You can close this window now.</p>
      </body>
    </html>
  `, {
    headers: { 'Content-Type': 'text/html' },
  })
})
