import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabase.js';
import { submitStudyEvent } from '../lib/study.js';
import { MasteryBadge } from '../lib/mastery.jsx';
import { todayLocalISO, daysBetween, formatLocalDate } from '../lib/dates.js';
import ConfidenceCards from '../components/ConfidenceCards';
import { PartyPopper, ArrowRight, Check } from 'lucide-react';

export default function Review() {
  const { user, refreshProfile } = useAuth();
  const [queue, setQueue] = useState([]);
  const [index, setIndex] = useState(0);
  const [confidence, setConfidence] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reviewedCount, setReviewedCount] = useState(0);

  const loadQueue = useCallback(async () => {
    if (!user) return;
    const today = todayLocalISO();
    const { data } = await supabase
      .from('review_states')
      .select('topic_id, next_review_date, last_review_date, topics(id, name, current_mastery, subject_id, subjects(id, name, color))')
      .lte('next_review_date', today)
      .order('next_review_date', { ascending: true });
    const filtered = (data || []).filter((r) => r.topics?.subjects);
    setQueue(filtered);
    setLoading(false);
  }, [user]);

  useEffect(() => { loadQueue(); }, [loadQueue]);

  const current = queue[index];

  async function handleSubmit() {
    if (!confidence || !current) return;
    setSubmitting(true);
    try {
      await submitStudyEvent({
        userId: user.id,
        topicId: current.topic_id,
        eventType: 'quick',
        startTime: null,
        endTime: null,
        durationMinutes: null,
        confidenceRating: confidence,
        focusRating: null,
        pomodoroCycles: 0,
        notes: null,
      });
      await refreshProfile();
      setReviewedCount((c) => c + 1);
      setConfidence(0);
      setIndex((i) => i + 1);
    } catch (e) {
      alert(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p className="text-gray-400">Loading...</p>;

  if (queue.length === 0 || index >= queue.length) {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-4">
          <PartyPopper className="w-8 h-8 text-green-600 dark:text-green-400" />
        </div>
        <h2 className="text-xl font-bold mb-2">All caught up!</h2>
        <p className="text-gray-500 dark:text-gray-400 mb-2">You've reviewed everything due today.</p>
        {reviewedCount > 0 && <p className="text-sm text-brand-600 dark:text-brand-400 font-medium">{reviewedCount} topic{reviewedCount !== 1 ? 's' : ''} reviewed this session.</p>}
      </div>
    );
  }

  const t = current.topics;
  const s = t.subjects;
  const daysSince = current.last_review_date ? daysBetween(current.last_review_date, todayLocalISO()) : null;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-bold">Review</h1>
          <span className="text-sm text-gray-500 dark:text-gray-400">{reviewedCount} of {queue.length} done</span>
        </div>
        <div className="w-full h-2 rounded-full bg-gray-200 dark:bg-gray-800 overflow-hidden">
          <div className="h-full bg-brand-600 transition-all" style={{ width: `${(reviewedCount / queue.length) * 100}%` }}></div>
        </div>
      </div>

      <div className="card p-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="w-3 h-3 rounded-full" style={{ background: s.color }}></span>
          <span className="text-sm text-gray-500 dark:text-gray-400">{s.name}</span>
        </div>
        <h2 className="text-2xl font-bold mb-4">{t.name}</h2>
        <div className="flex items-center gap-4 mb-6">
          <div>
            <p className="text-xs text-gray-400 mb-1">Mastery</p>
            <MasteryBadge score={t.current_mastery} size="lg" />
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">Last reviewed</p>
            <p className="text-sm font-medium">{daysSince !== null ? `${daysSince} day${daysSince !== 1 ? 's' : ''} ago` : 'Never'}</p>
          </div>
        </div>

        <div className="border-t border-gray-200 dark:border-gray-800 pt-6">
          <p className="text-sm font-medium mb-3">Recall this topic, then rate your confidence:</p>
          <ConfidenceCards value={confidence} onChange={setConfidence} size="lg" />
          <button onClick={handleSubmit} className="btn-primary w-full mt-6" disabled={!confidence || submitting}>
            {submitting ? 'Saving...' : 'Submit & next'} <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
