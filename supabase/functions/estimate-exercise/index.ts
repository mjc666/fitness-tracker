import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GEMINI_API_KEY = Deno.env.get('GOOGLE_AI_API_KEY')
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent"
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Manual Auth Check
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), { status: 401, headers: corsHeaders })
    }
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: corsHeaders })
    }

    const { activityDescription } = await req.json()

    if (!activityDescription) {
      return new Response(JSON.stringify({ error: 'Activity description is required' }), { status: 400, headers: corsHeaders })
    }

    const geminiResponse = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Estimate calories burned for: "${activityDescription}". Consider typical duration and intensity if not specified. Return JSON.`
          }]
        }],
        generationConfig: {
          responseMimeType: "application/json",
          maxOutputTokens: 1024,
          responseSchema: {
            type: "object",
            properties: {
              calories: { type: "number" }
            },
            required: ["calories"]
          }
        }
      })
    })

    const data = await geminiResponse.json()
    if (data.error) {
      return new Response(JSON.stringify({ error: data.error.message }), { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const candidate = data.candidates?.[0];
    const textResult = candidate?.content?.parts?.map((p: any) => p.text).join('') || "{}";
    const result = JSON.parse(textResult);

    return new Response(JSON.stringify({
      calories: Math.round(result.calories || 0)
    }), {
      headers: { 
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
    })

  } catch (err) {
    console.error('Estimation error:', err);
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
