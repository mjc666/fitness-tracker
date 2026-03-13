import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Flame, Utensils, Scale, Activity, TrendingUp } from 'lucide-react';
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

function App() {
  const [food, setFood] = useState<FoodEntry[]>([]);
  const [exercise, setExercise] = useState<ExerciseEntry[]>([]);
  const [metrics, setMetrics] = useState<MetricsEntry[]>([]);
  
  const [foodName, setFoodName] = useState('');
  const [foodCals, setFoodCals] = useState('');
  const [exerciseName, setExerciseName] = useState('');
  const [exerciseCals, setExerciseCals] = useState('');
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const { data: foodData } = await supabase.from('food').select('*').order('created_at', { ascending: false });
    const { data: exerciseData } = await supabase.from('exercise').select('*').order('created_at', { ascending: false });
    const { data: metricsData } = await supabase.from('metrics').select('*').order('created_at', { ascending: false });

    if (foodData) setFood(foodData);
    if (exerciseData) setExercise(exerciseData);
    if (metricsData) setMetrics(metricsData);
  };

  const addFood = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!foodName || !foodCals) return;
    await supabase.from('food').insert([{ name: foodName, calories: parseInt(foodCals) }]);
    setFoodName('');
    setFoodCals('');
    fetchData();
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
    if (!weight || !height) return;
    const w = parseFloat(weight);
    const h = parseFloat(height) / 100;
    const bmi = w / (h * h);
    await supabase.from('metrics').insert([{ 
      weight: w, 
      height: parseFloat(height), 
      bmi: parseFloat(bmi.toFixed(1)) 
    }]);
    setWeight('');
    setHeight('');
    fetchData();
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
  
  const totalEatenToday = todayFood.reduce((acc, curr) => acc + curr.calories, 0);
  const totalBurnedToday = todayExercise.reduce((acc, curr) => acc + curr.calories_burned, 0);
  const latestMetrics = metrics[0];

  const chartData = useMemo(() => {
    const last30Days = Array.from({ length: 30 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (29 - i));
      return d.toISOString().split('T')[0];
    });

    return last30Days.map(date => {
      const dayFood = food.filter(f => f.created_at.startsWith(date));
      const dayExercise = exercise.filter(ex => ex.created_at.startsWith(date));
      const dayMetrics = metrics.find(m => m.created_at.startsWith(date));

      return {
        date: new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        calories: dayFood.reduce((acc, curr) => acc + curr.calories, 0),
        burned: dayExercise.reduce((acc, curr) => acc + curr.calories_burned, 0),
        weight: dayMetrics?.weight || null
      };
    });
  }, [food, exercise, metrics]);

  return (
    <div className="container">
      <header>
        <h1><Activity className="header-icon" /> Fitness Tracker</h1>
        <p>Your Health Dashboard (Supabase Powered)</p>
      </header>

      <main>
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
              <p className="stat-value">{latestMetrics?.weight || '--'}</p>
              <p className="stat-label">kg ({latestMetrics?.bmi ? `BMI: ${latestMetrics.bmi}` : 'Set height/weight'})</p>
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
        </div>

        <div className="forms-grid">
          <section className="card">
            <h2>Add Food</h2>
            <form onSubmit={addFood}>
              <input type="text" placeholder="What did you eat?" value={foodName} onChange={e => setFoodName(e.target.value)} />
              <input type="number" placeholder="Calories" value={foodCals} onChange={e => setFoodCals(e.target.value)} />
              <button type="submit"><Plus size={18} /> Add Entry</button>
            </form>
            <div className="log-list">
              {todayFood.slice(0, 5).map(f => (
                <div key={f.id} className="log-item">
                  <span>{f.name}</span>
                  <span className="log-value">{f.calories} kcal</span>
                </div>
              ))}
              {todayFood.length === 0 && <p className="empty-msg">No entries for today</p>}
            </div>
          </section>

          <section className="card">
            <h2>Add Exercise</h2>
            <form onSubmit={addExercise}>
              <input type="text" placeholder="What activity?" value={exerciseName} onChange={e => setExerciseName(e.target.value)} />
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
              <input type="number" step="0.1" placeholder="Weight (kg)" value={weight} onChange={e => setWeight(e.target.value)} />
              <input type="number" placeholder="Height (cm)" value={height} onChange={e => setHeight(e.target.value)} />
              <button type="submit" className="metrics-btn"><Scale size={18} /> Update Metrics</button>
            </form>
            {metrics.length > 0 && (
              <div className="metrics-summary">
                <div className="metric-row">
                  <span>Last Weight:</span>
                  <strong>{latestMetrics.weight} kg</strong>
                </div>
                <div className="metric-row">
                  <span>Last BMI:</span>
                  <strong className={latestMetrics.bmi > 25 ? 'bmi-high' : 'bmi-normal'}>{latestMetrics.bmi}</strong>
                </div>
              </div>
            )}
          </section>
        </div>

        <section className="card chart-section">
          <h2>Last 30 Days</h2>
          <div className="charts-container">
            <div className="chart-wrapper">
              <h3>Calories & Activity</h3>
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
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{fontSize: 12}} />
                  <YAxis tick={{fontSize: 12}} />
                  <Tooltip />
                  <Legend />
                  <Area type="monotone" dataKey="calories" name="Eaten (kcal)" stroke="var(--primary)" fillOpacity={1} fill="url(#colorCals)" />
                  <Area type="monotone" dataKey="burned" name="Burned (kcal)" stroke="var(--danger)" fillOpacity={1} fill="url(#colorBurned)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="chart-wrapper">
              <h3>Weight Progress (kg)</h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData.filter(d => d.weight !== null)}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{fontSize: 12}} />
                  <YAxis domain={['auto', 'auto']} tick={{fontSize: 12}} />
                  <Tooltip />
                  <Line type="monotone" dataKey="weight" name="Weight (kg)" stroke="var(--secondary)" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
