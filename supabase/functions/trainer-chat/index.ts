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
      supabase.from('trainer_chat').select('*').eq('user_id', userId).order('created_at', { ascending: false }).order('is_ai', { ascending: false }).limit(30)
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
    const systemPrompt = `You are a world-class AI Personal Trainer and Health Coach. 
Your goal is to provide deep, actionable, and science-based advice.

USER HEALTH DATA:
${JSON.stringify(userSummary, null, 2)}

CORE DIRECTIVE:
When the user asks a question, PROVIDE A COMPLETE AND DETAILED ANSWER. 
Do not just acknowledge the question. Explain the "why" and "how".
For example, if asked about alcohol, explain its caloric density (7kcal/g), how it pauses fat oxidation (lipolysis), and how it affects sleep/recovery.

RESPONSE GUIDELINES:
- Give at least 3-4 paragraphs of detailed information when asked about complex topics.
- Use the user's data to make it relevant.
- Use formatting (bolding, bullets) to make it readable.
- If the user hasn't logged any alcohol, explain the general science first, then ask them if they'd like to start tracking it.
- DO NOT TRUNCATE. Provide the full scientific explanation requested.`;
    const geminiResponse = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          { role: "user", parts: [{ text: systemPrompt }] },
          { role: "model", parts: [{ text: "Understood. I am your expert AI Health Coach. I will provide detailed, science-based, and data-driven responses to help you optimize your health. I'm ready for your questions." }] },
          ...history,
          { role: "user", parts: [{ text: message }] }
        ],
        generationConfig: {
          maxOutputTokens: 4096,
          temperature: 0.7,
        }
      })
    })

    const geminiData = await geminiResponse.json()
    if (geminiData.error) {
      throw new Error(geminiData.error.message)
    }

    const aiMessage = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "I'm sorry, I couldn't generate a response."

    // 4. Save Chat History sequentially to ensure distinct timestamps or at least correct order
    await supabase.from('trainer_chat').insert({ user_id: userId, message, is_ai: false });
    await supabase.from('trainer_chat').insert({ user_id: userId, message: aiMessage, is_ai: true });

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
