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
    const { foodDescription } = await req.json()

    if (!foodDescription) {
      return new Response(JSON.stringify({ error: 'Food description is required' }), { status: 400 })
    }

    const geminiResponse = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Estimate the number of calories and grams of carbohydrates in the following food description: "${foodDescription}". 
            Return ONLY a JSON object with the following structure: {"calories": integer, "carbs": integer}. 
            If you cannot estimate, return 0 for both values.`
          }]
        }]
      })
    })

    const data = await geminiResponse.json()

    if (data.error) {
      return new Response(JSON.stringify({ error: data.error.message, code: data.error.code }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      })
    }

    const textResult = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}"
    // Extract JSON from potentially markdown-wrapped text
    const jsonMatch = textResult.match(/\{.*\}/);
    const result = jsonMatch ? JSON.parse(jsonMatch[0]) : { calories: 0, carbs: 0 };

    return new Response(JSON.stringify(result), {
      headers: { 
        'Content-Type': 'application/json', 
        'Access-Control-Allow-Origin': '*' 
      },
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })
  }
})
