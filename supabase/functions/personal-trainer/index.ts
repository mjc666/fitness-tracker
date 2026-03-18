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

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
      global: { headers: { Authorization: authHeader } }
    })

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      console.error('Auth error:', authError)
      return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: corsHeaders })
    }

    const userId = user.id;
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString();

    // Fetch user profile
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    
    // Fetch latest metrics
    const { data: latestMetrics } = await supabase.from('metrics').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle();

    // Fetch recent food
    const { data: recentFood } = await supabase.from('food').select('*').eq('user_id', userId).gte('created_at', sevenDaysAgoStr);

    // Fetch recent exercise
    const { data: recentExercise } = await supabase.from('exercise').select('*').eq('user_id', userId).gte('created_at', sevenDaysAgoStr);

    // Fetch recent steps
    const { data: recentSteps } = await supabase.from('steps').select('*').eq('user_id', userId).gte('created_at', sevenDaysAgoStr);

    // Fetch recent HR
    const { data: recentHR } = await supabase.from('heart_rate').select('*').eq('user_id', userId).gte('created_at', sevenDaysAgoStr);

    // Prepare data for Gemini
    const userSummary = {
      profile: {
        name: profile?.full_name,
        height: profile?.height,
        goal_weight: profile?.goal_weight,
        birthday: profile?.birthday,
        gender: profile?.gender,
        units: profile?.units
      },
      latest_weight: latestMetrics?.weight,
      latest_bmi: latestMetrics?.bmi,
      recent_food: recentFood?.map(f => ({ name: f.name, calories: f.calories, carbs: f.carbs, date: f.created_at })),
      recent_exercise: recentExercise?.map(e => ({ name: e.name, burned: e.calories_burned, date: e.created_at })),
      recent_steps: recentSteps?.map(s => ({ count: s.count, date: s.created_at })),
      recent_hr: recentHR?.map(h => ({ bpm: h.bpm, date: h.created_at }))
    };

    const prompt = `
      You are an expert Personal Trainer and Nutritionist. Based on the following user health data from the last 7 days, provide a personalized fitness and nutrition plan.
      
      User Data:
      ${JSON.stringify(userSummary, null, 2)}
      
      Provide recommendations for:
      1. Exercises: Specific routines or activities to focus on.
      2. Nutrition: General advice on macro balance or specific food groups.
      3. Supplements: Suggested supplements (e.g., protein, vitamins).
      4. Diet: A sample daily meal plan or dietary approach.
      
      Return the response in JSON format with exactly these keys:
      {
        "exercises": "string",
        "nutrition": "string",
        "supplements": "string",
        "diet": "string"
      }
      The strings should be concise and supportive. Do not use Markdown inside the JSON strings.
    `;

    const geminiResponse = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "object",
            properties: {
              exercises: { type: "string" },
              nutrition: { type: "string" },
              supplements: { type: "string" },
              diet: { type: "string" }
            },
            required: ["exercises", "nutrition", "supplements", "diet"]
          }
        }
      })
    })

    const geminiData = await geminiResponse.json()
    if (geminiData.error) {
      return new Response(JSON.stringify({ error: geminiData.error.message }), { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const textResult = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "{}"
    const result = JSON.parse(textResult);

    // Save to database
    const { error: saveError } = await supabase.from('trainer_recommendations').upsert({
      user_id: userId,
      exercises: result.exercises,
      nutrition: result.nutrition,
      supplements: result.supplements,
      diet: result.diet,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });

    if (saveError) {
      console.error('Error saving recommendations:', saveError);
    }

    return new Response(JSON.stringify(result), {
      headers: { 
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
    })

  } catch (err) {
    console.error('Personal trainer error:', err);
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
