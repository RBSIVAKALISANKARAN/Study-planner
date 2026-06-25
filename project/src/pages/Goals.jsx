import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabase.js';
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth } from '../lib/dates.js';
import { Plus, X, Target, Calendar, CalendarDays } from 'lucide-react';

export default function Goals() {
  const { user } = useAuth();
  const [goalType, setGoalType] = useState('weekly'); // 'weekly' | 'monthly'
  const [goals, setGoals] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [progress, setProgress] = useState({});
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);

  const getPeriodBounds = useCallback(() => {
    if (goalType === 'monthly') {
      return {
        start: startOfMonth().toISOString().split('T')[0],
        end: endOfMonth().toISOString().split('T')[0],
        startIso: startOfMonth().toISOString(),
        endIso: endOfMonth().toISOString(),
      };
    }
    return {
      start: startOfWeek().toISOString().split('T')[0],
      end: endOfWeek().toISOString().split('T')[0],
      startIso: startOfWeek().toISOString(),
      endIso: endOfWeek().toISOString(),
    };
  }, [goalType]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data: subs } = await supabase.from('subjects').select('*').eq('user_id', user.id);
    setSubjects(subs || []);

    const { start, end, startIso, endIso } = getPeriodBounds();

    const { data: gs } = await supabase
      .from('goals')
      .select('*, subjects(id, name, color)')
      .eq('user_id', user.id)
      .eq('week_start', start);
    setGoals(gs || []);

    const { data: events } = await supabase
      .from('study_events')
      .select('duration_minutes, topic_id, topics(subject_id)')
      .eq('user_id', user.id)
      .gte('created_at', startIso)
      .lte('created_at', endIso);

    const subjMinutes = {};
    (events || []).forEach((e) => {
      const sid = e.topics?.subject_id;
      if (sid) subjMinutes[sid] = (subjMinutes[sid] || 0) + (e.duration_minutes || 0);
    });

    const progMap = {};
    (gs || []).forEach((g) => {
      const actualHours = (subjMinutes[g.subject_id] || 0) / 60;
      progMap[g.id] = { actualHours, pct: Math.min(100, (actualHours / parseFloat(g.target_hours)) * 100) };
    });
    setProgress(progMap);
    setLoading(false);
  }, [user, getPeriodBounds]);

  useEffect(() => { load(); }, [load]);

  async function createGoal(subjectId, targetHours) {
    const { start, end } = getPeriodBounds();
    await supabase.from('goals').insert({
      user_id: user.id,
      subject_id: subjectId,
      target_hours: targetHours,
      week_start: start,
      week_end: end,
    });
    setShowModal(false);
    load();
  }

  async function deleteGoal(id) {
    await supabase.from('goals').delete().eq('id', id);
    load();
  }

  const dayOfWeek = new Date().getDay();
  const dayOfMonth = new Date().getDate();
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const monthProgress = dayOfMonth / daysInMonth;

  function isBehind(pct) {
    if (goalType === 'weekly') return dayOfWeek >= 3 && pct < 50;
    return monthProgress > 0.6 && pct < 50;
  }

  const periodLabel = goalType === 'weekly' ? 'This Week' : 'This Month';

  if (loading) return <p className="text-gray-400">Loading...</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Goals</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Set study hour targets per subject</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary">
          <Plus className="w-4 h-4" /> New goal
        </button>
      </div>

      {/* Period toggle */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1 w-fit">
        <button
          onClick={() => setGoalType('weekly')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${goalType === 'weekly' ? 'bg-white dark:bg-gray-900 shadow-sm' : 'text-gray-500'}`}
        >
          <Calendar className="w-4 h-4" /> Weekly
        </button>
        <button
          onClick={() => setGoalType('monthly')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${goalType === 'monthly' ? 'bg-white dark:bg-gray-900 shadow-sm' : 'text-gray-500'}`}
        >
          <CalendarDays className="w-4 h-4" /> Monthly
        </button>
      </div>

      {goals.length === 0 ? (
        <div className="card p-12 text-center">
          <Target className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400 mb-4">No {goalType} goals set yet.</p>
          <button onClick={() => setShowModal(true)} className="btn-primary mx-auto">
            <Plus className="w-4 h-4" /> Create a goal
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {goals.map((g) => {
            const p = progress[g.id] || { actualHours: 0, pct: 0 };
            const isComplete = p.pct >= 100;
            const behind = isBehind(p.pct);
            const barColor = isComplete ? 'bg-green-500' : behind ? 'bg-red-500' : 'bg-amber-500';
            return (
              <div key={g.id} className="card p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full" style={{ background: g.subjects?.color }}></span>
                    <span className="font-semibold">{g.subjects?.name}</span>
                    <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">{periodLabel}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {p.actualHours.toFixed(1)} / {parseFloat(g.target_hours)} hrs
                    </span>
                    <button onClick={() => deleteGoal(g.id)} className="text-red-400 hover:text-red-600 text-sm">Delete</button>
                  </div>
                </div>
                <div className="w-full h-3 rounded-full bg-gray-200 dark:bg-gray-800 overflow-hidden">
                  <div className={`h-full transition-all ${barColor}`} style={{ width: `${p.pct}%` }}></div>
                </div>
                <p className="text-xs mt-2 font-medium" style={{ color: isComplete ? '#10b981' : behind ? '#ef4444' : '#f59e0b' }}>
                  {isComplete ? 'Goal complete!' : behind ? 'Behind schedule — needs attention' : 'On track'}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {showModal && <CreateGoalModal subjects={subjects} goalType={goalType} onClose={() => setShowModal(false)} onCreate={createGoal} />}
    </div>
  );
}

function CreateGoalModal({ subjects, goalType, onClose, onCreate }) {
  const [subjectId, setSubjectId] = useState('');
  const [hours, setHours] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="card p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-lg">New {goalType} goal</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="label">Subject</label>
            <select className="input" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              <option value="">Select subject</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Target hours {goalType === 'monthly' ? 'this month' : 'this week'}</label>
            <input type="number" step="0.5" min="0.5" className="input" value={hours} onChange={(e) => setHours(e.target.value)} placeholder={goalType === 'monthly' ? 'e.g. 20' : 'e.g. 5'} />
          </div>
          <button onClick={() => subjectId && hours && onCreate(subjectId, parseFloat(hours))} className="btn-primary w-full" disabled={!subjectId || !hours}>
            Create goal
          </button>
        </div>
      </div>
    </div>
  );
}
