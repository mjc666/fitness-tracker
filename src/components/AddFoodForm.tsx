import { memo, useState, type ChangeEvent } from 'react';
import { Plus, Sparkles, Trash2 } from 'lucide-react';

interface FoodEntry {
  id: number;
  name: string;
  calories: number;
  carbs: number;
  created_at: string;
}

interface AddFoodFormProps {
  foodSuggestions: Record<string, { calories: number, carbs: number }>;
  todayFood: FoodEntry[];
  onAddFood: (name: string, cals: number, carbs: number) => Promise<void>;
  onDeleteFood: (id: number) => Promise<void>;
  estimateCalories: (foodName: string) => Promise<{ calories?: number, carbs?: number }>;
}

export const AddFoodForm = memo(({
  foodSuggestions,
  todayFood,
  onAddFood,
  onDeleteFood,
  estimateCalories
}: AddFoodFormProps) => {
  const [foodName, setFoodName] = useState('');
  const [foodCals, setFoodCals] = useState('');
  const [foodCarbs, setFoodCarbs] = useState('');
  const [isEstimating, setIsEstimating] = useState(false);

  const handleFoodNameChange = (e: ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    setFoodName(name);
    if (foodSuggestions[name]) {
      setFoodCals(foodSuggestions[name].calories.toString());
      setFoodCarbs(foodSuggestions[name].carbs.toString());
    }
  };

  const handleEstimate = async () => {
    if (!foodName) return;
    setIsEstimating(true);
    try {
      const data = await estimateCalories(foodName);
      if (data.calories !== undefined) setFoodCals(data.calories.toString());
      if (data.carbs !== undefined) setFoodCarbs(data.carbs.toString());
    } finally {
      setIsEstimating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!foodName || !foodCals) return;
    await onAddFood(foodName, parseInt(foodCals), parseInt(foodCarbs || '0'));
    setFoodName('');
    setFoodCals('');
    setFoodCarbs('');
  };

  return (
    <section className="card">
      <h2>Add Food</h2>
      <form onSubmit={handleSubmit}>
        <div className="input-with-action">
          <input 
            type="text" 
            placeholder="What did you eat?" 
            list="food-suggestions" 
            value={foodName} 
            onChange={handleFoodNameChange} 
          />
          <datalist id="food-suggestions">
            {Object.keys(foodSuggestions).map(meal => (
              <option key={meal} value={meal} />
            ))}
          </datalist>
          <button type="button" className="action-btn" onClick={handleEstimate} disabled={!foodName || isEstimating} title="Estimate calories & carbs with AI">
            <Sparkles className={isEstimating ? 'pulse' : ''} size={18} />
          </button>
        </div>
        <div className="input-row">
          <input type="number" placeholder="Calories" value={foodCals} onChange={e => setFoodCals(e.target.value)} />
          <input type="number" placeholder="Carbs (g)" value={foodCarbs} onChange={e => setFoodCarbs(e.target.value)} />
        </div>
        <button type="submit"><Plus size={18} /> Add Entry</button>
      </form>

      <div className="log-list" style={{ marginTop: '2rem' }}>
        {todayFood.map(f => (
          <div key={f.id} className="log-item">
            <div className="log-info">
              <span>{f.name}</span>
              {f.carbs > 0 && <span className="log-subvalue">{f.carbs}g carbs</span>}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className="log-value">{f.calories} kcal</span>
              <button className="delete-btn" onClick={() => onDeleteFood(f.id)} title="Delete entry">
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
        {todayFood.length === 0 && <p className="empty-msg">No entries for today</p>}
      </div>
    </section>
  );
});
