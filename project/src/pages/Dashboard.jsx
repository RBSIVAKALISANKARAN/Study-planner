import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabase.js';
import { MasteryBadge } from '../lib/mastery.jsx';
import { startOfWeek, endOfWeek, todayLocalISO, formatLocalDate } from '../lib/dates.js';
import { submitStudyEvent } from '../lib/study.js';
import ConfidenceCards from '../components/ConfidenceCards';
import { Flame, Clock, ListChecks, Zap, ArrowRight, X } from 'lucide-react';

export default function Dashboard() {
  const { profile, user, refreshProfile } = useAuth();
  const [reviewQueue, setReviewQueue] = useState([]);
  const [summary, setSummary] = useState({ hours: 0, sessions: 0, topSubject: null });
  const [loading, setLoading] = useState(true);
  const [quickLogOpen, setQuickLogOpen] = useState(false);

 const loadData = useCallback(async () => {
  // If user is not available, stop loading and exit
  if (!user) {
    setLoading(false);
    return;
  }

  try {
    const today = todayLocalISO();

    // Fetch review queue (due topics)
    const { data: queue } = await supabase
      .from('review_states')
      .select('topic_id, next_review_date, topics(id, name, current_mastery, subject_id, subjects(id, name, color))')
      .lte('next_review_date', today)
      .order('next_review_date', { ascending: true })
      .limit(20);

    const filtered = (queue || []).filter((r) => r.topics?.subjects);
    setReviewQueue(filtered);

    // Fetch study events for the current week
    const ws = startOfWeek().toISOString();
    const we = endOfWeek().toISOString();
    const { data: events } = await supabase
      .from('study_events')
      .select('duration_minutes, topic_id, topics(subject_id, subjects(name))')
      .eq('user_id', user.id)
      .gte('created_at', ws)
      .lte('created_at', we);

    // Calculate weekly summary
    const totalMin = (events || []).reduce((s, e) => s + (e.duration_minutes || 0), 0);
    const subjMap = {};
    (events || []).forEach((e) => {
      const name = e.topics?.subjects?.name;
      if (name) subjMap[name] = (subjMap[name] || 0) + (e.duration_minutes || 0);
    });
    const topSubject = Object.entries(subjMap).sort((a, b) => b[1] - a[1])[0];

    setSummary({
      hours: (totalMin / 60).toFixed(1),
      sessions: (events || []).length,
      topSubject: topSubject ? topSubject[0] : null,
    });
  } catch (err) {
    console.error('Dashboard data loading error:', err);
    // You could also show a toast/notification here if desired
  } finally {
    // Always set loading to false, whether success or error
    setLoading(false);
  }
}, [user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Hi, {profile?.display_name || 'there'}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Here's your mastery overview</p>
        </div>
        <button onClick={() => setQuickLogOpen(true)} className="btn-primary">
          <Zap className="w-4 h-4" /> Quick Log
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-1">
            <Flame className="w-4 h-4 text-orange-500" />
            <span className="text-xs font-medium">Streak</span>
          </div>
          <p className="text-2xl font-bold">{profile?.streak_count || 0} <span className="text-sm font-normal text-gray-500">days</span></p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-1">
            <Clock className="w-4 h-4 text-brand-500" />
            <span className="text-xs font-medium">This week</span>
          </div>
          <p className="text-2xl font-bold">{summary.hours}<span className="text-sm font-normal text-gray-500"> hrs</span></p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-1">
            <ListChecks className="w-4 h-4 text-green-500" />
            <span className="text-xs font-medium">Sessions</span>
          </div>
          <p className="text-2xl font-bold">{summary.sessions}</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-1">
            <Zap className="w-4 h-4 text-amber-500" />
            <span className="text-xs font-medium">Top subject</span>
          </div>
          <p className="text-lg font-bold truncate">{summary.topSubject || '—'}</p>
        </div>
      </div>

      {/* Review queue */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-lg">Review Queue</h2>
          <Link to="/review" className="text-sm text-brand-600 dark:text-brand-400 font-medium hover:underline flex items-center gap-1">
            Review all <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        {loading ? (
          <p className="text-sm text-gray-400">Loading...</p>
        ) : reviewQueue.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500 dark:text-gray-400">You're all caught up! No reviews due today.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {reviewQueue.map((r) => (
              <Link
                key={r.topic_id}
                to="/review"
                className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: r.topics.subjects.color }}></span>
                  <div className="min-w-0">
                    <p className="font-medium truncate">{r.topics.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{r.topics.subjects.name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-xs text-gray-400 hidden sm:block">Due {formatLocalDate(r.next_review_date)}</span>
                  <MasteryBadge score={r.topics.current_mastery} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {quickLogOpen && (
        <QuickLogModal
          onClose={() => setQuickLogOpen(false)}
          onDone={() => { setQuickLogOpen(false); loadData(); refreshProfile(); }}
        />
      )}
    </div>
  );
}

function QuickLogModal({ onClose, onDone }) {
  const { user } = useAuth();
  const [subjects, setSubjects] = useState([]);
  const [topics, setTopics] = useState([]);
  const [selectedSubject, setSelectedSubject] = useState('');
  const [selectedTopic, setSelectedTopic] = useState('');
  const [confidence, setConfidence] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    supabase.from('subjects').select('*').eq('user_id', user.id).then(({ data }) => setSubjects(data || []));
  }, [user]);

  useEffect(() => {
    if (selectedSubject) {
      supabase.from('topics').select('*').eq('user_id', user.id).eq('subject_id', selectedSubject).then(({ data }) => setTopics(data || []));
    } else {
      setTopics([]);
    }
    setSelectedTopic('');
  }, [selectedSubject, user]);

  async function handleSubmit() {
    if (!selectedTopic || !confidence) return;
    setSubmitting(true);
    try {
      await submitStudyEvent({
        userId: user.id,
        topicId: selectedTopic,
        eventType: 'quick',
        startTime: null,
        endTime: null,
        durationMinutes: null,
        confidenceRating: confidence,
        focusRating: null,
        pomodoroCycles: 0,
        notes: null,
      });
      onDone();
    } catch (e) {
      alert(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="card p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-lg">Quick Log</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="label">Subject</label>
            <select className="input" value={selectedSubject} onChange={(e) => setSelectedSubject(e.target.value)}>
              <option value="">Select subject</option>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Topic</label>
            <select className="input" value={selectedTopic} onChange={(e) => setSelectedTopic(e.target.value)} disabled={!selectedSubject}>
              <option value="">Select topic</option>
              {topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Confidence</label>
            <ConfidenceCards value={confidence} onChange={setConfidence} />
          </div>
          <button onClick={handleSubmit} className="btn-primary w-full" disabled={!selectedTopic || !confidence || submitting}>
            {submitting ? 'Saving...' : 'Log it'}
          </button>
        </div>
      </div>
    </div>
  );
}
