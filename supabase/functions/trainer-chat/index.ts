import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GEMINI_API_KEY = Deno.env.get('GOOGLE_AI_API_KEY')
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), { status: 401, headers: corsHeaders })
    }

    const { message } = await req.json()
    if (!message) {
      return new Response(JSON.stringify({ error: 'Message is required' }), { status: 400, headers: corsHeaders })
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
      global: { headers: { Authorization: authHeader } }
    })

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: corsHeaders })
    }

    const userId = user.id;

    // 1. Fetch User Data (Context)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString();

    const [
      { data: profile },
      { data: latestMetrics },
      { data: recentFood },
      { data: recentExercise },
      { data: recentSteps },
      { data: recentHR },
      { data: recentChat }
    ] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      supabase.from('metrics').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('food').select('*').eq('user_id', userId).gte('created_at', sevenDaysAgoStr),
      supabase.from('exercise').select('*').eq('user_id', userId).gte('created_at', sevenDaysAgoStr),
      supabase.from('steps').select('*').eq('user_id', userId).gte('created_at', sevenDaysAgoStr),
      supabase.from('heart_rate').select('*').eq('user_id', userId).gte('created_at', sevenDaysAgoStr),
      supabase.from('trainer_chat').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(10)
    ]);

    const userSummary = {
      profile,
      latestMetrics,
      recentFood,
      recentExercise,
      recentSteps,
      recentHR
    };

    // 2. Prepare Conversation History
    const history = recentChat?.reverse().map(c => ({
      role: c.is_ai ? "model" : "user",
      parts: [{ text: c.message }]
    })) || [];

    // 3. Prompt Gemini
    const systemInstruction = `
      You are an expert AI Personal Trainer. Use the user's health data and recent activity for context. 
      Be supportive, direct, and evidence-based. If asked about exercises, nutrition, or health metrics, 
      refer to the data provided. 
      User Data: ${JSON.stringify(userSummary)}
    `;

    const geminiResponse = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          { role: "user", parts: [{ text: systemInstruction }] },
          ...history,
          { role: "user", parts: [{ text: message }] }
        ],
        generationConfig: {
          maxOutputTokens: 500,
        }
      })
    })

    const geminiData = await geminiResponse.json()
    if (geminiData.error) {
      throw new Error(geminiData.error.message)
    }

    const aiMessage = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "I'm sorry, I couldn't generate a response."

    // 4. Save Chat History
    await Promise.all([
      supabase.from('trainer_chat').insert({ user_id: userId, message, is_ai: false }),
      supabase.from('trainer_chat').insert({ user_id: userId, message: aiMessage, is_ai: true })
    ]);

    return new Response(JSON.stringify({ message: aiMessage }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('Trainer chat error:', err);
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
