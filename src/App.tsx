import { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, Flame, Utensils, Scale, Activity, TrendingUp, Settings as SettingsIcon, LogOut, ChevronLeft, Save, User as UserIcon, RefreshCw, Sparkles, Wheat, Footprints, Heart, Zap, Dumbbell, Apple, Pill, ClipboardList, MessageSquare, Send, X } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, AreaChart, Area
} from 'recharts';
import './App.css';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

interface FoodEntry {
  id: number;
  name: string;
  calories: number;
  carbs: number;
  created_at: string;
}

interface ExerciseEntry {
  id: number;
  name: string;
  calories_burned: number;
  created_at: string;
}

interface MetricsEntry {
  id: number;
  weight: number;
  height: number;
  bmi: number;
  created_at: string;
}

interface StepsEntry {
  id: number;
  count: number;
  created_at: string;
}

interface HeartRateEntry {
  id: number;
  bpm: number;
  created_at: string;
}

interface Profile {
  id?: string;
  full_name: string;
  height: number;
  goal_weight: number;
  units: 'metric' | 'imperial';
  birthday?: string;
  gender?: 'male' | 'female';
}

// Unit Helpers (Database always stores metric: kg, cm)
const toLbs = (kg: number) => kg * 2.20462;
const fromLbs = (lbs: number) => lbs / 2.20462;
const toIn = (cm: number) => cm / 2.54;
const fromIn = (inches: number) => inches * 2.54;

const calculateAge = (birthday: string) => {
  if (!birthday) return 0;
  const birthDate = new Date(birthday);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
};

const calculateBMR = (weight: number, height: number, birthday: string, gender: 'male' | 'female' | undefined) => {
  if (!weight || !height || !birthday || !gender) return null;
  const age = calculateAge(birthday);
  if (gender === 'male') {
    return Math.round(10 * weight + 6.25 * height - 5 * age + 5);
  } else {
    return Math.round(10 * weight + 6.25 * height - 5 * age - 161);
  }
};

function AuthForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    
    if (error) alert(error.message);
    setLoading(false);
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1><Activity /> Fitness Tracker</h1>
        <p>Sign in to your account</p>
        <form onSubmit={handleAuth} className="auth-form">
          <div className="form-group">
            <label>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
          </div>
          <button type="submit" disabled={loading}>
            {loading ? 'Signing In...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

function App() {
  const [session, setSession] = useState<any>(null);
  const [view, setView] = useState<'dashboard' | 'settings' | 'trainer'>('dashboard');
  const [food, setFood] = useState<FoodEntry[]>([]);
  const [exercise, setExercise] = useState<ExerciseEntry[]>([]);
  const [metrics, setMetrics] = useState<MetricsEntry[]>([]);
  const [steps, setSteps] = useState<StepsEntry[]>([]);
  const [heartRate, setHeartRate] = useState<HeartRateEntry[]>([]);
  const [profile, setProfile] = useState<Profile>({ full_name: '', height: 0, goal_weight: 0, units: 'metric', birthday: '', gender: undefined });
  
  const [recommendations, setRecommendations] = useState<{ exercises: string, nutrition: string, supplements: string, diet: string } | null>(null);
  const [isGeneratingRecommendations, setIsGeneratingRecommendations] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ id: string, message: string, is_ai: boolean, created_at: string }[]>([]);
  const [currentChatMessage, setCurrentChatMessage] = useState('');
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [isChatVisible, setIsChatVisible] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const [foodName, setFoodName] = useState('');
  const [foodCals, setFoodCals] = useState('');
  const [foodCarbs, setFoodCarbs] = useState('');
  const [exerciseName, setExerciseName] = useState('');
  const [exerciseCals, setExerciseCals] = useState('');
  const [weightInput, setWeightInput] = useState('');
  const [heightInput, setHeightInput] = useState('');
  const [goalWeightInput, setGoalWeightInput] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isEstimating, setIsEstimating] = useState(false);
  const [isEstimatingExercise, setIsEstimatingExercise] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) {
      fetchData();
      fetchProfile();
      fetchRecommendations();
      fetchChatHistory();
    }
  }, [session]);

  const fetchData = async () => {
    const { data: foodData } = await supabase.from('food').select('*').order('created_at', { ascending: false });
    const { data: exerciseData } = await supabase.from('exercise').select('*').order('created_at', { ascending: false });
    const { data: metricsData } = await supabase.from('metrics').select('*').order('created_at', { ascending: false });
    const { data: stepsData } = await supabase.from('steps').select('*').order('created_at', { ascending: false });
    const { data: hrData } = await supabase.from('heart_rate').select('*').order('created_at', { ascending: false });

    if (foodData) setFood(foodData);
    if (exerciseData) setExercise(exerciseData);
    if (metricsData) setMetrics(metricsData);
    if (stepsData) setSteps(stepsData);
    if (hrData) setHeartRate(hrData);
  };

  const fetchProfile = async () => {
    const { data, error } = await supabase.from('profiles').select('*').maybeSingle();
    if (data) {
      setProfile(data);
      if (data.height) {
        const h = data.units === 'imperial' ? toIn(data.height) : data.height;
        setHeightInput(h.toFixed(1));
      }
      if (data.goal_weight) {
        const w = data.units === 'imperial' ? toLbs(data.goal_weight) : data.goal_weight;
        setGoalWeightInput(w.toFixed(1));
      }
    } else if (!error && session) {
      const newProfile = { id: session.user.id, full_name: '', height: 0, goal_weight: 0, units: 'metric' as const, birthday: '', gender: undefined };
      await supabase.from('profiles').upsert(newProfile);
      setProfile(newProfile);
    }
  };

  const fetchRecommendations = async () => {
    const { data, error } = await supabase.from('trainer_recommendations').select('*').maybeSingle();
    if (data && !error) {
      setRecommendations(data);
    }
  };

  const fetchChatHistory = async () => {
    const { data, error } = await supabase.from('trainer_chat').select('*').order('created_at', { ascending: true });
    if (data && !error) {
      setChatMessages(data);
    }
  };

  const sendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentChatMessage.trim() || isSendingChat) return;

    const userMsg = currentChatMessage;
    setCurrentChatMessage('');
    setIsSendingChat(true);

    // Optimistically add user message
    const tempId = Math.random().toString();
    setChatMessages(prev => [...prev, { id: tempId, message: userMsg, is_ai: false, created_at: new Date().toISOString() }]);

    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      const response = await fetch(`${supabaseUrl}/functions/v1/trainer-chat`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': `Bearer ${currentSession?.access_token}`,
          'apikey': supabaseAnonKey
        },
        body: JSON.stringify({ message: userMsg })
      });
      const data = await response.json();
      if (data.message) {
        setChatMessages(prev => [...prev.filter(m => m.id !== tempId), { id: Math.random().toString(), message: userMsg, is_ai: false, created_at: new Date().toISOString() }, { id: Math.random().toString(), message: data.message, is_ai: true, created_at: new Date().toISOString() }]);
        // Refetch to get actual IDs and timestamps from DB
        fetchChatHistory();
      } else {
        alert('Failed to send message: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      console.error('Chat failed', err);
      alert('Failed to connect to the Personal Trainer chat.');
    } finally {
      setIsSendingChat(false);
    }
  };

  const addFood = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!foodName || !foodCals) return;
    await supabase.from('food').insert([{ 
      name: foodName, 
      calories: parseInt(foodCals),
      carbs: parseInt(foodCarbs || '0')
    }]);
    setFoodName('');
    setFoodCals('');
    setFoodCarbs('');
    fetchData();
  };

  const estimateCalories = async () => {
    if (!foodName) return;
    setIsEstimating(true);
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/estimate-calories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
        body: JSON.stringify({ foodDescription: foodName })
      });
      const data = await response.json();
      if (data.calories !== undefined) setFoodCals(data.calories.toString());
      if (data.carbs !== undefined) setFoodCarbs(data.carbs.toString());
    } catch (err) {
      console.error('Estimation failed', err);
    } finally {
      setIsEstimating(false);
    }
  };

  const estimateExercise = async () => {
    if (!exerciseName) return;
    setIsEstimatingExercise(true);
    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      const response = await fetch(`${supabaseUrl}/functions/v1/estimate-exercise`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentSession?.access_token}` },
        body: JSON.stringify({ activityDescription: exerciseName })
      });
      const data = await response.json();
      if (data.calories !== undefined) setExerciseCals(data.calories.toString());
    } catch (err) {
      console.error('Estimation failed', err);
    } finally {
      setIsEstimatingExercise(false);
    }
  };

  const addExercise = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!exerciseName || !exerciseCals) return;
    await supabase.from('exercise').insert([{ name: exerciseName, calories_burned: parseInt(exerciseCals) }]);
    setExerciseName('');
    setExerciseCals('');
    fetchData();
  };

  const addMetrics = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!weightInput) return;
    
    const wKg = profile.units === 'imperial' ? fromLbs(parseFloat(weightInput)) : parseFloat(weightInput);
    const hCm = profile.height || 0;
    
    let bmi = 0;
    if (hCm > 0) {
      const hM = hCm / 100;
      bmi = parseFloat((wKg / (hM * hM)).toFixed(1));
    }
    
    await supabase.from('metrics').insert([{ 
      weight: wKg, 
      height: hCm, 
      bmi: bmi 
    }]);
    setWeightInput('');
    fetchData();
  };

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from('profiles').upsert({
      id: session.user.id,
      ...profile,
      updated_at: new Date().toISOString()
    });
    if (!error) alert('Profile saved!');
  };

  const syncWithings = async () => {
    setIsSyncing(true);
    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      const response = await fetch(`${supabaseUrl}/functions/v1/withings-sync?user_id=${session.user.id}`, {
        headers: {
          'Authorization': `Bearer ${currentSession?.access_token}`
        }
      });
      const data = await response.json();
      if (data.status === 'success') {
        alert(`Sync complete! Metrics: ${data.metrics_synced}, Activities: ${data.activities_synced}, Steps: ${data.steps_synced}, Heart Rate: ${data.hr_synced}`);
        fetchData();
      } else {
        if (data.error === 'Auth not found') {
          alert('Sync failed: Withings account not connected. Please go to Settings to connect.');
        } else {
          alert('Sync failed: ' + (data.error || 'Unknown error'));
        }
      }
    } catch (err) {
      console.error('Sync failed', err);
      alert('Sync failed. Please check your internet connection and try again.');
    } finally {
      setIsSyncing(false);
    }
  };

  const generateRecommendations = async () => {
    setIsGeneratingRecommendations(true);
    try {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (!currentSession) {
        alert('Your session has expired. Please log in again.');
        return;
      }
      
      const response = await fetch(`${supabaseUrl}/functions/v1/personal-trainer`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': `Bearer ${currentSession.access_token}`,
          'apikey': supabaseAnonKey
        }
      });
      
      const data = await response.json();
      if (data.exercises) {
        setRecommendations(data);
      } else {
        console.error('Trainer error:', data);
        alert('Failed to generate recommendations: ' + (data.error || data.message || 'Unknown error'));
      }
    } catch (err) {
      console.error('Generation failed', err);
      alert('Failed to connect to the Personal Trainer. Please try again later.');
    } finally {
      setIsGeneratingRecommendations(false);
    }
  };

  const isToday = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    return date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear();
  };

  const todayFood = food.filter(f => isToday(f.created_at));
  const todayExercise = exercise.filter(ex => isToday(ex.created_at));
  const todayStepsRecord = steps.find(s => isToday(s.created_at));
  const todayHRRecord = heartRate.find(h => isToday(h.created_at));

  const totalEatenToday = todayFood.reduce((acc, curr) => acc + curr.calories, 0);
  const totalCarbsToday = todayFood.reduce((acc, curr) => acc + (curr.carbs || 0), 0);
  const totalBurnedToday = todayExercise.reduce((acc, curr) => acc + curr.calories_burned, 0);
  const totalStepsToday = todayStepsRecord ? todayStepsRecord.count : 0;
  const latestMetrics = metrics[0];
  const latestHR = heartRate[0];
  const getBMI = (m: MetricsEntry | undefined) => {
    if (!m) return null;
    if (m.bmi && m.bmi > 0) return m.bmi;
    if (profile.height > 0) {
      const hM = profile.height / 100;
      return parseFloat((m.weight / (hM * hM)).toFixed(1));
    }
    return null;
  };

  const displayWeight = (kg: number) => {
    if (!kg) return '--';
    const val = profile.units === 'imperial' ? toLbs(kg) : kg;
    return val.toFixed(1);
  };

  const weightUnit = profile.units === 'imperial' ? 'lb' : 'kg';
  const heightUnit = profile.units === 'imperial' ? 'in' : 'cm';

  const chartData = useMemo(() => {
    const last30Days = Array.from({ length: 30 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (29 - i));
      // Use local date string YYYY-MM-DD
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });

    return last30Days.map(date => {
      const dayFood = food.filter(f => {
        const fDate = new Date(f.created_at);
        const fStr = `${fDate.getFullYear()}-${String(fDate.getMonth() + 1).padStart(2, '0')}-${String(fDate.getDate()).padStart(2, '0')}`;
        return fStr === date;
      });
      const dayExercise = exercise.filter(ex => {
        const exDate = new Date(ex.created_at);
        const exStr = `${exDate.getFullYear()}-${String(exDate.getMonth() + 1).padStart(2, '0')}-${String(exDate.getDate()).padStart(2, '0')}`;
        return exStr === date;
      });
      const dayMetrics = metrics.find(m => {
        const mDate = new Date(m.created_at);
        const mStr = `${mDate.getFullYear()}-${String(mDate.getMonth() + 1).padStart(2, '0')}-${String(mDate.getDate()).padStart(2, '0')}`;
        return mStr === date;
      });

      const daySteps = steps.find(s => {
        const sDate = new Date(s.created_at);
        const sStr = `${sDate.getFullYear()}-${String(sDate.getMonth() + 1).padStart(2, '0')}-${String(sDate.getDate()).padStart(2, '0')}`;
        return sStr === date;
      });

      const dayHR = heartRate.find(h => {
        const hDate = new Date(h.created_at);
        const hStr = `${hDate.getFullYear()}-${String(hDate.getMonth() + 1).padStart(2, '0')}-${String(hDate.getDate()).padStart(2, '0')}`;
        return hStr === date;
      });
      
      const weightVal = dayMetrics ? (profile.units === 'imperial' ? toLbs(dayMetrics.weight) : dayMetrics.weight) : null;

      // Use a consistent label format
      const [y, m, d] = date.split('-');
      const labelDate = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));

      return {
        date: labelDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        calories: dayFood.reduce((acc, curr) => acc + curr.calories, 0),
        carbs: dayFood.reduce((acc, curr) => acc + (curr.carbs || 0), 0),
        burned: dayExercise.reduce((acc, curr) => acc + curr.calories_burned, 0),
        weight: weightVal ? parseFloat(weightVal.toFixed(1)) : null,
        steps: daySteps ? daySteps.count : 0,
        hr: dayHR ? dayHR.bpm : null
      };
    });
  }, [food, exercise, metrics, steps, heartRate, profile.units]);

  if (!session) {
    return <AuthForm />;
  }

  const latestBMI = getBMI(latestMetrics);
  const bmr = calculateBMR(latestMetrics?.weight, profile.height, profile.birthday || '', profile.gender);

  return (
    <div className="container">
      <header className="main-header">
        <div className="header-top">
          <h1><Activity className="header-icon" /> Fitness Tracker</h1>
          <div className="header-actions">
            {view === 'dashboard' && (
              <button className="icon-btn sync-btn" onClick={syncWithings} disabled={isSyncing}>
                <RefreshCw className={isSyncing ? 'spin' : ''} size={18} />
                <span>{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
              </button>
            )}
            <button className={`icon-btn ${view === 'trainer' ? 'trainer-btn' : ''}`} onClick={() => setView(view === 'trainer' ? 'dashboard' : 'trainer')}>
              <Sparkles size={18} />
              <span>Personal Trainer</span>
            </button>
            <button className="icon-btn" onClick={() => setView(view === 'dashboard' || view === 'trainer' ? 'settings' : 'dashboard')}>
              {view === 'dashboard' || view === 'trainer' ? <SettingsIcon size={18} /> : <ChevronLeft size={18} />}
              <span>{view === 'settings' ? 'Dashboard' : 'Settings'}</span>
            </button>
            <button className="icon-btn logout-btn" onClick={() => supabase.auth.signOut()}>
              <LogOut size={18} />
              <span>Logout</span>
            </button>
          </div>
        </div>
        <p className="user-welcome">Welcome back, {profile.full_name || session.user.email}</p>
      </header>

      <main>
        {view === 'dashboard' ? (
          <>
            <div className="dashboard">
              <div className="card stat-card">
                <Utensils className="icon food-icon" />
                <div className="stat-content">
                  <h3>Calories Eaten</h3>
                  <p className="stat-value">{totalEatenToday}</p>
                  <p className="stat-label">kcal today</p>
                </div>
              </div>

              <div className="card stat-card">
                <Wheat className="icon carb-icon" />
                <div className="stat-content">
                  <h3>Carbs</h3>
                  <p className="stat-value">{totalCarbsToday}</p>
                  <p className="stat-label">g today</p>
                </div>
              </div>

              <div className="card stat-card">
                <Flame className="icon burn-icon" />
                <div className="stat-content">
                  <h3>Calories Burned</h3>
                  <p className="stat-value">{totalBurnedToday}</p>
                  <p className="stat-label">kcal today</p>
                </div>
              </div>

              <div className="card stat-card">
                <Scale className="icon weight-icon" />
                <div className="stat-content">
                  <h3>Current Weight</h3>
                  <p className="stat-value">{displayWeight(latestMetrics?.weight)}</p>
                  <p className="stat-label">{weightUnit} ({latestBMI ? `BMI: ${latestBMI}` : 'Set height in settings'})</p>
                </div>
              </div>

              <div className="card stat-card">
                <TrendingUp className="icon net-icon" />
                <div className="stat-content">
                  <h3>Net Calories</h3>
                  <p className="stat-value">{totalEatenToday - totalBurnedToday}</p>
                  <p className="stat-label">kcal today</p>
                </div>
              </div>

              <div className="card stat-card">
                <Zap className="icon bmr-icon" />
                <div className="stat-content">
                  <h3>BMR</h3>
                  <p className="stat-value">{bmr || '--'}</p>
                  <p className="stat-label">kcal/day (estimated)</p>
                </div>
              </div>

              <div className="card stat-card">
                <Footprints className="icon steps-icon" />
                <div className="stat-content">
                  <h3>Steps</h3>
                  <p className="stat-value">{totalStepsToday.toLocaleString()}</p>
                  <p className="stat-label">steps today</p>
                </div>
              </div>

              <div className="card stat-card">
                <Heart className="icon hr-icon" />
                <div className="stat-content">
                  <h3>Heart Rate</h3>
                  <p className="stat-value">{todayHRRecord ? todayHRRecord.bpm : (latestHR ? latestHR.bpm : '--')}</p>
                  <p className="stat-label">avg bpm</p>
                </div>
              </div>
            </div>

            <div className="forms-grid">
              <section className="card">
                <h2>Add Food</h2>
                <form onSubmit={addFood}>
                  <div className="input-with-action">
                    <input type="text" placeholder="What did you eat?" value={foodName} onChange={e => setFoodName(e.target.value)} />
                    <button type="button" className="action-btn" onClick={estimateCalories} disabled={!foodName || isEstimating} title="Estimate calories & carbs with AI">
                      <Sparkles className={isEstimating ? 'pulse' : ''} size={18} />
                    </button>
                  </div>
                  <div className="input-row">
                    <input type="number" placeholder="Calories" value={foodCals} onChange={e => setFoodCals(e.target.value)} />
                    <input type="number" placeholder="Carbs (g)" value={foodCarbs} onChange={e => setFoodCarbs(e.target.value)} />
                  </div>
                  <button type="submit"><Plus size={18} /> Add Entry</button>
                </form>
                <div className="log-list">
                  {todayFood.slice(0, 5).map(f => (
                    <div key={f.id} className="log-item">
                      <div className="log-info">
                        <span>{f.name}</span>
                        {f.carbs > 0 && <span className="log-subvalue">{f.carbs}g carbs</span>}
                      </div>
                      <span className="log-value">{f.calories} kcal</span>
                    </div>
                  ))}
                  {todayFood.length === 0 && <p className="empty-msg">No entries for today</p>}
                </div>
              </section>

              <section className="card">
                <h2>Add Exercise</h2>
                <form onSubmit={addExercise}>
                  <div className="input-with-action">
                    <input type="text" placeholder="What activity?" value={exerciseName} onChange={e => setExerciseName(e.target.value)} />
                    <button type="button" className="action-btn" onClick={estimateExercise} disabled={!exerciseName || isEstimatingExercise} title="Estimate calories with AI">
                      <Sparkles className={isEstimatingExercise ? 'pulse' : ''} size={18} />
                    </button>
                  </div>
                  <input type="number" placeholder="Calories Burned" value={exerciseCals} onChange={e => setExerciseCals(e.target.value)} />
                  <button type="submit"><Plus size={18} /> Add Entry</button>
                </form>
                <div className="log-list">
                  {todayExercise.slice(0, 5).map(ex => (
                    <div key={ex.id} className="log-item">
                      <span>{ex.name}</span>
                      <span className="log-value-negative">-{ex.calories_burned} kcal</span>
                    </div>
                  ))}
                  {todayExercise.length === 0 && <p className="empty-msg">No entries for today</p>}
                </div>
              </section>

              <section className="card">
                <h2>Track Metrics</h2>
                <form onSubmit={addMetrics}>
                  <input type="number" step="0.1" placeholder={`Daily Weight (${weightUnit})`} value={weightInput} onChange={e => setWeightInput(e.target.value)} />
                  <button type="submit" className="metrics-btn"><Scale size={18} /> Log Weight</button>
                </form>
                {!profile.height && <p className="empty-msg" style={{marginTop: '1rem'}}>Note: BMI will be calculated once you set your height in settings.</p>}
                {metrics.length > 0 && (
                  <div className="metrics-summary">
                    <div className="metric-row">
                      <span>Last Weight:</span>
                      <strong>{displayWeight(latestMetrics.weight)} {weightUnit}</strong>
                    </div>
                    <div className="metric-row">
                      <span>Last BMI:</span>
                      <strong className={latestBMI && latestBMI > 25 ? 'bmi-high' : 'bmi-normal'}>{latestBMI || '--'}</strong>
                    </div>
                  </div>
                )}
              </section>
            </div>

            <section className="card chart-section">
              <h2>Last 30 Days</h2>
              <div className="charts-container">
                <div className="chart-wrapper">
                  <h3>Calories, Activity & Carbs</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="colorCals" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.1}/>
                          <stop offset="95%" stopColor="var(--primary)" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorBurned" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--danger)" stopOpacity={0.1}/>
                          <stop offset="95%" stopColor="var(--danger)" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorCarbs" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.1}/>
                          <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                      <XAxis dataKey="date" tick={{fontSize: 12}} />
                      <YAxis tick={{fontSize: 12}} />
                      <Tooltip />
                      <Legend />
                      <Area type="monotone" dataKey="calories" name="Eaten (kcal)" stroke="var(--primary)" fillOpacity={1} fill="url(#colorCals)" />
                      <Area type="monotone" dataKey="burned" name="Burned (kcal)" stroke="var(--danger)" fillOpacity={1} fill="url(#colorBurned)" />
                      <Line type="monotone" dataKey="carbs" name="Carbs (g)" stroke="#f59e0b" strokeWidth={2} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                <div className="chart-wrapper">
                  <h3>Weight Progress ({weightUnit})</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={chartData.filter(d => d.weight !== null)}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                      <XAxis dataKey="date" tick={{fontSize: 12}} />
                      <YAxis domain={['auto', 'auto']} tick={{fontSize: 12}} />
                      <Tooltip />
                      <Line type="monotone" dataKey="weight" name={`Weight (${weightUnit})`} stroke="var(--secondary)" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div className="chart-wrapper">
                  <h3>Steps Progress</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="colorSteps" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                      <XAxis dataKey="date" tick={{fontSize: 12}} />
                      <YAxis tick={{fontSize: 12}} />
                      <Tooltip />
                      <Area type="monotone" dataKey="steps" name="Steps" stroke="#10b981" fillOpacity={1} fill="url(#colorSteps)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                <div className="chart-wrapper">
                  <h3>Heart Rate Progress (bpm)</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={chartData.filter(d => d.hr !== null)}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                      <XAxis dataKey="date" tick={{fontSize: 12}} />
                      <YAxis domain={['auto', 'auto']} tick={{fontSize: 12}} />
                      <Tooltip />
                      <Line type="monotone" dataKey="hr" name="Avg HR (bpm)" stroke="#ec4899" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </section>
          </>
        ) : view === 'trainer' ? (
          <div className="trainer-view">
            <header className="trainer-hero">
              <h2><Sparkles size={32} /> Your Personal AI Trainer</h2>
              <p>Get personalized exercise, nutrition, and supplement advice based on your recent activity and health metrics.</p>
              <button 
                className="generate-btn" 
                onClick={generateRecommendations} 
                disabled={isGeneratingRecommendations}
              >
                {isGeneratingRecommendations ? (
                  <><RefreshCw className="spin" size={20} /> Analyzing your data...</>
                ) : (
                  <><Sparkles size={20} /> {recommendations ? 'Refresh Recommendations' : 'Get My Recommendations'}</>
                )}
              </button>
            </header>

            {recommendations && (
              <div className="recommendations-grid">
                <div className="card rec-card rec-exercises">
                  <div className="icon-wrapper">
                    <Dumbbell size={24} />
                  </div>
                  <h3>Exercises</h3>
                  <p className="rec-content">{recommendations.exercises}</p>
                </div>

                <div className="card rec-card rec-nutrition">
                  <div className="icon-wrapper">
                    <Apple size={24} />
                  </div>
                  <h3>Nutrition</h3>
                  <p className="rec-content">{recommendations.nutrition}</p>
                </div>

                <div className="card rec-card rec-supplements">
                  <div className="icon-wrapper">
                    <Pill size={24} />
                  </div>
                  <h3>Supplements</h3>
                  <p className="rec-content">{recommendations.supplements}</p>
                </div>

                <div className="card rec-card rec-diet">
                  <div className="icon-wrapper">
                    <ClipboardList size={24} />
                  </div>
                  <h3>Daily Diet Plan</h3>
                  <p className="rec-content">{recommendations.diet}</p>
                </div>
              </div>
            )}
            
            {!recommendations && !isGeneratingRecommendations && (
              <div className="card" style={{ textAlign: 'center', padding: '3rem', marginBottom: '2rem' }}>
                <Activity size={48} color="var(--border)" style={{ marginBottom: '1rem' }} />
                <p style={{ color: 'var(--text-muted)' }}>No recommendations yet. Click the button above to generate your personalized plan!</p>
              </div>
            )}
          </div>
        ) : (
          <div className="settings-view">
            <section className="card">
              <h2><UserIcon className="section-icon" /> Profile Settings</h2>
              <form onSubmit={saveProfile}>
                <div className="form-group">
                  <label>Full Name</label>
                  <input 
                    type="text" 
                    value={profile.full_name} 
                    onChange={e => setProfile({...profile, full_name: e.target.value})}
                    placeholder="John Doe"
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Birthday</label>
                    <input 
                      type="date" 
                      value={profile.birthday || ''} 
                      onChange={e => setProfile({...profile, birthday: e.target.value})}
                    />
                  </div>
                  <div className="form-group">
                    <label>Gender</label>
                    <select 
                      value={profile.gender || ''} 
                      onChange={e => setProfile({...profile, gender: e.target.value as 'male' | 'female'})}
                    >
                      <option value="">Select Gender</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                    </select>
                  </div>
                </div>
                
                <div className="form-group">
                  <label>Units</label>
                  <div className="unit-toggle">
                    <button 
                      type="button" 
                      className={profile.units === 'metric' ? 'active' : ''}
                      onClick={() => {
                        const currentUnits = profile.units;
                        if (currentUnits === 'metric') {
                          if (heightInput) setHeightInput(toIn(parseFloat(heightInput)).toFixed(1));
                          if (goalWeightInput) setGoalWeightInput(toLbs(parseFloat(goalWeightInput)).toFixed(1));
                        } else {
                          if (heightInput) setHeightInput(fromIn(parseFloat(heightInput)).toFixed(1));
                          if (goalWeightInput) setGoalWeightInput(fromLbs(parseFloat(goalWeightInput)).toFixed(1));
                        }
                        setProfile({...profile, units: 'metric'});
                      }}
                    >
                      Metric (kg, cm)
                    </button>
                    <button 
                      type="button" 
                      className={profile.units === 'imperial' ? 'active' : ''}
                      onClick={() => {
                        const currentUnits = profile.units;
                        if (currentUnits === 'metric') {
                          if (heightInput) setHeightInput(toIn(parseFloat(heightInput)).toFixed(1));
                          if (goalWeightInput) setGoalWeightInput(toLbs(parseFloat(goalWeightInput)).toFixed(1));
                        }
                        setProfile({...profile, units: 'imperial'});
                      }}
                    >
                      Imperial (lb, in)
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label>Height ({heightUnit})</label>
                  <input 
                    type="number" 
                    step="0.1"
                    value={heightInput} 
                    onChange={e => {
                      setHeightInput(e.target.value);
                      const val = parseFloat(e.target.value);
                      const hCm = profile.units === 'imperial' ? fromIn(val) : val;
                      setProfile({...profile, height: hCm});
                    }}
                    placeholder={profile.units === 'imperial' ? "70" : "180"}
                  />
                </div>
                <div className="form-group">
                  <label>Goal Weight ({weightUnit})</label>
                  <input 
                    type="number" 
                    step="0.1"
                    value={goalWeightInput} 
                    onChange={e => {
                      setGoalWeightInput(e.target.value);
                      const val = parseFloat(e.target.value);
                      const wKg = profile.units === 'imperial' ? fromLbs(val) : val;
                      setProfile({...profile, goal_weight: wKg});
                    }}
                    placeholder={profile.units === 'imperial' ? "165" : "75"}
                  />
                </div>
                <button type="submit" className="save-btn"><Save size={18} /> Save Settings</button>
              </form>
            </section>

            <section className="card">
              <h2>Withings Integration</h2>
              <p className="settings-info">Connect your Withings account to sync weight and activity automatically.</p>
              <button 
                onClick={() => {
                  const url = `https://account.withings.com/oauth2_user/authorize2?response_type=code&client_id=${import.meta.env.VITE_WITHINGS_CLIENT_ID}&scope=user.metrics,user.activity&redirect_uri=${import.meta.env.VITE_WITHINGS_REDIRECT_URI}&state=${session.user.id}`;
                  window.location.href = url;
                }}
                className="connect-btn"
              >
                Reconnect Withings Account
              </button>
            </section>
          </div>
        )}
      </main>

      {view === 'trainer' && (
        <>
          <button 
            className={`chat-toggle-btn ${isChatVisible ? 'active' : ''}`}
            onClick={() => setIsChatVisible(!isChatVisible)}
            title={isChatVisible ? "Close Chat" : "Chat with Trainer"}
          >
            {isChatVisible ? <X size={24} /> : <MessageSquare size={24} />}
          </button>

          {isChatVisible && (
            <section className="chat-section">
              <div className="chat-header" onClick={() => setIsChatVisible(false)}>
                <div className="chat-header-left">
                  <Sparkles size={20} color="var(--primary)" />
                  <h3>Trainer Chat</h3>
                </div>
                <X size={20} color="var(--text-muted)" />
              </div>
              <div className="chat-history" ref={chatScrollRef}>
                {chatMessages.length === 0 && (
                  <p className="empty-msg" style={{ marginTop: '2rem' }}>
                    Ask me anything! For example: "How can I improve my cardio?" or "What should I eat after my workout?"
                  </p>
                )}
                {chatMessages.map(msg => (
                  <div key={msg.id} className={`chat-message ${msg.is_ai ? 'ai' : 'user'}`}>
                    {msg.message}
                  </div>
                ))}
                {isSendingChat && (
                  <div className="typing-indicator">Trainer is thinking...</div>
                )}
              </div>
              <form onSubmit={sendChatMessage} className="chat-input-area">
                <input 
                  type="text" 
                  placeholder="Ask your trainer..." 
                  value={currentChatMessage}
                  onChange={e => setCurrentChatMessage(e.target.value)}
                  disabled={isSendingChat}
                  autoFocus
                />
                <button type="submit" className="send-btn" disabled={!currentChatMessage.trim() || isSendingChat}>
                  <Send size={20} />
                </button>
              </form>
            </section>
          )}
        </>
      )}
    </div>
  );
}

export default App;
