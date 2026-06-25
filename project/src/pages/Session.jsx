import { useEffect, useState, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabase.js';
import { submitStudyEvent } from '../lib/study.js';
import ConfidenceCards from '../components/ConfidenceCards';
import { Timer, Coffee, Zap, Play, Square, ArrowRight, Check } from 'lucide-react';

export default function Session() {
  const { user, refreshProfile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [subjects, setSubjects] = useState([]);
  const [topics, setTopics] = useState([]);
  const [selectedSubject, setSelectedSubject] = useState('');
  const [selectedTopic, setSelectedTopic] = useState('');
  const [step, setStep] = useState(1);
  const [eventType, setEventType] = useState('');
  const [phase, setPhase] = useState('setup');
  const [confidence, setConfidence] = useState(0);
  const [focus, setFocus] = useState(3);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const preselectTopic = searchParams.get('topic');

  useEffect(() => {
    supabase.from('subjects').select('*').eq('user_id', user.id).then(({ data }) => setSubjects(data || []));
  }, [user]);

  const loadTopics = useCallback(async (subjectId) => {
    if (!subjectId) return;
    const { data } = await supabase.from('topics').select('*').eq('user_id', user.id).eq('subject_id', subjectId);
    setTopics(data || []);
  }, [user]);

  useEffect(() => {
    if (selectedSubject) loadTopics(selectedSubject);
  }, [selectedSubject, loadTopics]);

  // Pre-select topic from query param
  useEffect(() => {
    if (preselectTopic && subjects.length > 0) {
      supabase.from('topics').select('*, subjects(id)').eq('id', preselectTopic).single().then(({ data }) => {
        if (data) {
          setSelectedSubject(data.subjects.id);
          setSelectedTopic(data.id);
          setStep(2);
        }
      });
    }
  }, [preselectTopic, subjects]);

  function pickSubject(id) {
    setSelectedSubject(id);
    setSelectedTopic('');
    setTopics([]);
  }

  function pickTopic(id) {
    setSelectedTopic(id);
    setStep(2);
  }

  function pickEventType(type) {
    setEventType(type);
    if (type === 'quick') {
      setPhase('rating');
    } else {
      setPhase('running');
    }
  }

  async function handleSubmit() {
    if (!confidence) return;
    setSubmitting(true);
    const now = new Date().toISOString();
    let durationMinutes = null;
    let startTime = null;
    let endTime = null;
    let cycles = 0;

    if (eventType === 'timer') {
      durationMinutes = Math.max(1, Math.round(elapsedRef.current / 60));
      startTime = startRef.current;
      endTime = now;
    } else if (eventType === 'pomodoro') {
      durationMinutes = pomodoroWorkMinutes;
      startTime = startRef.current;
      endTime = now;
      cycles = pomodoroCycles;
    }

    try {
      await submitStudyEvent({
        userId: user.id,
        topicId: selectedTopic,
        eventType,
        startTime,
        endTime,
        durationMinutes,
        confidenceRating: confidence,
        focusRating: focus,
        pomodoroCycles: cycles,
        notes: notes || null,
      });
      await refreshProfile();
      setDone(true);
    } catch (e) {
      alert(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  // Timer state
  const [elapsed, setElapsed] = useState(0);
  const elapsedRef = useRef(0);
  const startRef = useRef(null);
  const timerRef = useRef(null);

  // Pomodoro state
  const [pomodoroPhase, setPomodoroPhase] = useState('work'); // work | break
  const [pomodoroSeconds, setPomodoroSeconds] = useState(25 * 60);
  const [pomodoroCycles, setPomodoroCycles] = useState(0);
  const [pomodoroWorkMinutes, setPomodoroWorkMinutes] = useState(0);
  const pomoRef = useRef(null);

  useEffect(() => {
    if (phase !== 'running') return;
    if (eventType === 'timer') {
      startRef.current = new Date().toISOString();
      timerRef.current = setInterval(() => {
        elapsedRef.current += 1;
        setElapsed(elapsedRef.current);
      }, 1000);
      return () => clearInterval(timerRef.current);
    }
    if (eventType === 'pomodoro') {
      startRef.current = new Date().toISOString();
      pomoRef.current = setInterval(() => {
        setPomodoroSeconds((s) => {
          if (s <= 1) {
            if (pomodoroPhase === 'work') {
              setPomodoroCycles((c) => c + 1);
              setPomodoroWorkMinutes((m) => m + 25);
              setPomodoroPhase('break');
              return 5 * 60;
            } else {
              setPomodoroPhase('work');
              return 25 * 60;
            }
          }
          return s - 1;
        });
      }, 1000);
      return () => clearInterval(pomoRef.current);
    }
  }, [phase, eventType, pomodoroPhase]);

  function stopTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    if (pomoRef.current) clearInterval(pomoRef.current);
    setPhase('rating');
  }

  function fmtTime(totalSec) {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function reset() {
    setStep(1);
    setSelectedSubject('');
    setSelectedTopic('');
    setEventType('');
    setPhase('setup');
    setConfidence(0);
    setFocus(3);
    setNotes('');
    setDone(false);
    setElapsed(0);
    elapsedRef.current = 0;
    setPomodoroPhase('work');
    setPomodoroSeconds(25 * 60);
    setPomodoroCycles(0);
    setPomodoroWorkMinutes(0);
    setSearchParams({});
  }

  if (done) {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-4">
          <Check className="w-8 h-8 text-green-600 dark:text-green-400" />
        </div>
        <h2 className="text-xl font-bold mb-2">Session logged!</h2>
        <p className="text-gray-500 dark:text-gray-400 mb-6">Your mastery and streak have been updated.</p>
        <div className="flex gap-3 justify-center">
          <button onClick={reset} className="btn-primary">Log another</button>
          <button onClick={() => navigate('/dashboard')} className="btn-secondary">Dashboard</button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Study Session</h1>

      {/* Step indicator */}
      <div className="flex items-center gap-2 text-sm">
        <span className={step >= 1 ? 'text-brand-600 dark:text-brand-400 font-medium' : 'text-gray-400'}>1. Topic</span>
        <ArrowRight className="w-3 h-3 text-gray-400" />
        <span className={step >= 2 ? 'text-brand-600 dark:text-brand-400 font-medium' : 'text-gray-400'}>2. Mode</span>
        <ArrowRight className="w-3 h-3 text-gray-400" />
        <span className={phase === 'rating' ? 'text-brand-600 dark:text-brand-400 font-medium' : 'text-gray-400'}>3. Rate</span>
      </div>

      {/* Step 1: pick subject + topic */}
      {step === 1 && (
        <div className="card p-5 space-y-4">
          <div>
            <label className="label">Subject</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {subjects.map((s) => (
                <button
                  key={s.id}
                  onClick={() => pickSubject(s.id)}
                  className={`flex items-center gap-2 p-3 rounded-lg border-2 text-sm font-medium transition-all ${
                    selectedSubject === s.id ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                  }`}
                >
                  <span className="w-3 h-3 rounded-full" style={{ background: s.color }}></span>
                  <span className="truncate">{s.name}</span>
                </button>
              ))}
            </div>
            {subjects.length === 0 && <p className="text-sm text-gray-400 py-4">No subjects yet. Create some in Topics.</p>}
          </div>
          {selectedSubject && (
            <div>
              <label className="label">Topic</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {topics.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => pickTopic(t.id)}
                    className="flex items-center justify-between p-3 rounded-lg border-2 border-gray-200 dark:border-gray-700 hover:border-brand-400 transition-all text-sm"
                  >
                    <span className="font-medium truncate">{t.name}</span>
                    <span className="text-xs text-gray-400">{t.current_mastery}%</span>
                  </button>
                ))}
              </div>
              {topics.length === 0 && <p className="text-sm text-gray-400 py-2">No topics in this subject.</p>}
            </div>
          )}
        </div>
      )}

      {/* Step 2: pick event type */}
      {step === 2 && phase === 'setup' && (
        <div className="card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Choose your mode</h2>
            <button onClick={() => setStep(1)} className="text-sm text-gray-500 hover:text-gray-700">Back</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button onClick={() => pickEventType('timer')} className="card p-5 text-center hover:border-brand-400 transition-all">
              <Timer className="w-8 h-8 mx-auto mb-2 text-brand-500" />
              <p className="font-medium">Timer</p>
              <p className="text-xs text-gray-400 mt-1">Live stopwatch</p>
            </button>
            <button onClick={() => pickEventType('pomodoro')} className="card p-5 text-center hover:border-brand-400 transition-all">
              <Coffee className="w-8 h-8 mx-auto mb-2 text-orange-500" />
              <p className="font-medium">Pomodoro</p>
              <p className="text-xs text-gray-400 mt-1">25 min work / 5 min break</p>
            </button>
            <button onClick={() => pickEventType('quick')} className="card p-5 text-center hover:border-brand-400 transition-all">
              <Zap className="w-8 h-8 mx-auto mb-2 text-amber-500" />
              <p className="font-medium">Quick</p>
              <p className="text-xs text-gray-400 mt-1">No timer, just rate</p>
            </button>
          </div>
        </div>
      )}

      {/* Running phase: timer or pomodoro */}
      {phase === 'running' && eventType === 'timer' && (
        <div className="card p-8 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Timer running</p>
          <p className="text-5xl font-mono font-bold mb-6">{fmtTime(elapsed)}</p>
          <button onClick={stopTimer} className="btn-danger mx-auto">
            <Square className="w-4 h-4" /> Stop
          </button>
        </div>
      )}

      {phase === 'running' && eventType === 'pomodoro' && (
        <div className="card p-8 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
            {pomodoroPhase === 'work' ? 'Focus time' : 'Break time'} · Cycles: {pomodoroCycles}
          </p>
          <p className="text-5xl font-mono font-bold mb-6">{fmtTime(pomodoroSeconds)}</p>
          <button onClick={stopTimer} className="btn-danger mx-auto">
            <Square className="w-4 h-4" /> Finish
          </button>
        </div>
      )}

      {/* Rating phase */}
      {phase === 'rating' && (
        <div className="card p-5 space-y-5">
          <h2 className="font-semibold text-lg">Rate your session</h2>
          <div>
            <label className="label">Confidence — how well did you know this?</label>
            <ConfidenceCards value={confidence} onChange={setConfidence} size="lg" />
          </div>
          <div>
            <label className="label">Focus — how focused were you? ({focus}/5)</label>
            <input type="range" min={1} max={5} value={focus} onChange={(e) => setFocus(Number(e.target.value))} />
          </div>
          <div>
            <label className="label">Notes (optional)</label>
            <textarea className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What did you cover?" />
          </div>
          <button onClick={handleSubmit} className="btn-primary w-full" disabled={!confidence || submitting}>
            {submitting ? 'Saving...' : 'Submit session'}
          </button>
        </div>
      )}
    </div>
  );
}
