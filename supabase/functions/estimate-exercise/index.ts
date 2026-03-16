import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const GEMINI_API_KEY = Deno.env.get('GOOGLE_AI_API_KEY')
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    }})
  }

  try {
    const { activityDescription } = await req.json()

    if (!activityDescription) {
      return new Response(JSON.stringify({ error: 'Activity description is required' }), { status: 400 })
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
    console.log('Gemini raw response:', JSON.stringify(data))

    if (data.error) {
      return new Response(JSON.stringify({ error: data.error.message }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      })
    }

    const textResult = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}"
    const result = JSON.parse(textResult);

    return new Response(JSON.stringify({
      calories: Math.round(result.calories || 0)
    }), {
      headers: { 
        'Content-Type': 'application/json', 
        'Access-Control-Allow-Origin': '*' 
      },
    })

  } catch (err) {
    console.error('Estimation error:', err);
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })
  }
})
