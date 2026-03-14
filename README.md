# Fitness Tracker

A modern health dashboard powered by React, Supabase, and Google Gemini AI. Features AI-powered calorie estimation, Withings integration, and real-time fitness tracking.

## ✨ Features

- **AI Calorie Estimator:** Describe what you ate in natural language (e.g., "a handful of almonds") and let **Gemini 2.5 Flash** estimate the calories for you.
- **Withings Integration:** Automatically sync weight and physical activity data from your Withings "Body+" scale and wearables.
- **Dynamic Dashboard:** Real-time totals for calories eaten, burned, and net energy balance.
- **Progress Charts:** Visual 30-day trends for weight and activity using **Recharts**.
- **User Profiles:** Support for both **Metric (kg/cm)** and **Imperial (lb/in)** units with automatic conversion.
- **Secure Authentication:** Multi-user support with Supabase Auth and Row Level Security (RLS).

## 🚀 Tech Stack

- **Frontend:** React 19, Vite, TypeScript, Lucide Icons, Recharts.
- **Backend:** Supabase (Database, Auth, Edge Functions).
- **AI:** Google Gemini 2.5 Flash API.
- **API Integrations:** Withings OAuth 2.0.

## 🛠️ Setup & Installation

### 1. Database & Auth
- Run the commands in `setup.sql` in your **Supabase SQL Editor** to create the tables and enable RLS policies.
- **Security:** New sign-ups are disabled by a database trigger for security. To add your own account:
  1. Go to **Authentication > Users** in the Supabase Dashboard.
  2. Click **Add User** and create your account manually.
  3. Alternatively, you can temporarily disable the `block_new_users` trigger in the SQL editor.

### 2. Environment Variables
Create a `.env` file in the root directory:
```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_WITHINGS_CLIENT_ID=your_withings_client_id
VITE_WITHINGS_REDIRECT_URI=https://your-project.supabase.co/functions/v1/withings-oauth
```

### 3. Supabase Edge Functions
Set the following secrets in your Supabase project:
```bash
npx supabase secrets set GOOGLE_AI_API_KEY=your_gemini_key
npx supabase secrets set WITHINGS_CLIENT_ID=your_withings_id
npx supabase secrets set WITHINGS_CLIENT_SECRET=your_withings_secret
```
Deploy the functions:
```bash
npx supabase functions deploy withings-oauth --no-verify-jwt
npx supabase functions deploy withings-sync --no-verify-jwt
npx supabase functions deploy estimate-calories --no-verify-jwt
```

### 4. Frontend Development
```bash
npm install
npm run dev
```

## ⚖️ License
MIT
