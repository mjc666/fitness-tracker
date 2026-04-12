import { memo, useState } from 'react';
import { Plus, Sparkles, Trash2 } from 'lucide-react';

interface ExerciseEntry {
  id: number;
  name: string;
  calories_burned: number;
  created_at: string;
}

interface AddExerciseFormProps {
  todayExercise: ExerciseEntry[];
  onAddExercise: (name: string, cals: number) => Promise<void>;
  onDeleteExercise: (id: number) => Promise<void>;
  estimateCalories: (name: string) => Promise<{ calories?: number }>;
}

export const AddExerciseForm = memo(({
  todayExercise,
  onAddExercise,
  onDeleteExercise,
  estimateCalories
}: AddExerciseFormProps) => {
  const [exerciseName, setExerciseName] = useState('');
  const [exerciseCals, setExerciseCals] = useState('');
  const [isEstimating, setIsEstimating] = useState(false);

  const handleEstimate = async () => {
    if (!exerciseName) return;
    setIsEstimating(true);
    try {
      const data = await estimateCalories(exerciseName);
      if (data.calories !== undefined) setExerciseCals(data.calories.toString());
    } finally {
      setIsEstimating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!exerciseName || !exerciseCals) return;
    await onAddExercise(exerciseName, parseInt(exerciseCals));
    setExerciseName('');
    setExerciseCals('');
  };

  return (
    <section className="card">
      <h2>Add Exercise</h2>
      <form onSubmit={handleSubmit}>
        <div className="input-with-action">
          <input 
            type="text" 
            placeholder="What activity?" 
            value={exerciseName} 
            onChange={e => setExerciseName(e.target.value)} 
          />
          <button 
            type="button" 
            className="action-btn" 
            onClick={handleEstimate} 
            disabled={!exerciseName || isEstimating} 
            title="Estimate calories with AI"
          >
            <Sparkles className={isEstimating ? 'pulse' : ''} size={18} />
          </button>
        </div>
        <input 
          type="number" 
          placeholder="Calories Burned" 
          value={exerciseCals} 
          onChange={e => setExerciseCals(e.target.value)} 
        />
        <button type="submit"><Plus size={18} /> Add Entry</button>
      </form>

      <div className="log-list" style={{ marginTop: '2rem' }}>
        {todayExercise.map(ex => (
          <div key={ex.id} className="log-item">
            <span>{ex.name}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className="log-value-negative">-{ex.calories_burned} kcal</span>
              <button className="delete-btn" onClick={() => onDeleteExercise(ex.id)} title="Delete entry">
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
        {todayExercise.length === 0 && <p className="empty-msg">No entries for today</p>}
      </div>
    </section>
  );
});
