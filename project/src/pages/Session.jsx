import { useEffect, useState, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabase.js';
import { submitStudyEvent } from '../lib/study.js';
import ConfidenceCards from '../components/ConfidenceCards';
import { Timer, Coffee, Zap, Square, ArrowRight, Check, Settings2 } from 'lucide-react';

export default function Session() {
  const { user, refreshProfile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [subjects, setSubjects] = useState([]);
  const [topics, setTopics] = useState([]);
  const [selectedSubject, setSelectedSubject] = useState('');
  const [selectedTopic, setSelectedTopic] = useState('');
  const [selectedTopicData, setSelectedTopicData] = useState(null);
  const [step, setStep] = useState(1);
  const [eventType, setEventType] = useState('');
  const [phase, setPhase] = useState('setup');
  const [confidence, setConfidence] = useState(0);
  const [focus, setFocus] = useState(3);
  const [velocity, setVelocity] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  // Custom Pomodoro durations
  const [showPomodoroSettings, setShowPomodoroSettings] = useState(false);
  const [workMinutes, setWorkMinutes] = useState(25);
  const [breakMinutes, setBreakMinutes] = useState(5);
  const [pendingWork, setPendingWork] = useState(25);
  const [pendingBreak, setPendingBreak] = useState(5);

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

  useEffect(() => {
    if (preselectTopic && subjects.length > 0) {
      supabase.from('topics').select('*, subjects(id)').eq('id', preselectTopic).single().then(({ data }) => {
        if (data) {
          setSelectedSubject(data.subjects.id);
          setSelectedTopic(data.id);
          setSelectedTopicData(data);
          setStep(2);
        }
      });
    }
  }, [preselectTopic, subjects]);

  function pickSubject(id) {
    setSelectedSubject(id);
    setSelectedTopic('');
    setSelectedTopicData(null);
    setTopics([]);
  }

  function pickTopic(t) {
    setSelectedTopic(t.id);
    setSelectedTopicData(t);
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

  function applyPomodoroSettings() {
    setWorkMinutes(pendingWork);
    setBreakMinutes(pendingBreak);
    setPomodoroSeconds(pendingWork * 60);
    setShowPomodoroSettings(false);
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
        velocityUnits: velocity ? Number(velocity) : null,
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
  const [pomodoroPhase, setPomodoroPhase] = useState('work');
  const [pomodoroSeconds, setPomodoroSeconds] = useState(workMinutes * 60);
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
              setPomodoroWorkMinutes((m) => m + workMinutes);
              setPomodoroPhase('break');
              return breakMinutes * 60;
            } else {
              setPomodoroPhase('work');
              return workMinutes * 60;
            }
          }
          return s - 1;
        });
      }, 1000);
      return () => clearInterval(pomoRef.current);
    }
  }, [phase, eventType, pomodoroPhase, workMinutes, breakMinutes]);

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
    setSelectedTopicData(null);
    setEventType('');
    setPhase('setup');
    setConfidence(0);
    setFocus(3);
    setVelocity('');
    setNotes('');
    setDone(false);
    setElapsed(0);
    elapsedRef.current = 0;
    setPomodoroPhase('work');
    setPomodoroSeconds(workMinutes * 60);
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
                    onClick={() => pickTopic(t)}
                    className="flex items-center justify-between p-3 rounded-lg border-2 border-gray-200 dark:border-gray-700 hover:border-brand-400 transition-all text-sm text-left"
                  >
                    <div className="min-w-0">
                      <span className="font-medium block truncate">{t.name}</span>
                      {t.description && (
                        <span className="text-xs text-gray-400 truncate block">{t.description}</span>
                      )}
                    </div>
                    <span className="text-xs text-gray-400 flex-shrink-0 ml-2">{t.current_mastery}%</span>
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

          {/* Show topic notes if present */}
          {selectedTopicData?.description && (
            <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
              <p className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-1">Topic notes</p>
              <p className="text-sm text-blue-800 dark:text-blue-200">{selectedTopicData.description}</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button onClick={() => pickEventType('timer')} className="card p-5 text-center hover:border-brand-400 transition-all">
              <Timer className="w-8 h-8 mx-auto mb-2 text-brand-500" />
              <p className="font-medium">Timer</p>
              <p className="text-xs text-gray-400 mt-1">Live stopwatch</p>
            </button>

            <div className="relative">
              <button onClick={() => pickEventType('pomodoro')} className="card p-5 text-center hover:border-brand-400 transition-all w-full">
                <Coffee className="w-8 h-8 mx-auto mb-2 text-orange-500" />
                <p className="font-medium">Pomodoro</p>
                <p className="text-xs text-gray-400 mt-1">{workMinutes} min work / {breakMinutes} min break</p>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setPendingWork(workMinutes); setPendingBreak(breakMinutes); setShowPomodoroSettings(true); }}
                className="absolute top-2 right-2 p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600"
                title="Customize durations"
              >
                <Settings2 className="w-3.5 h-3.5" />
              </button>
            </div>

            <button onClick={() => pickEventType('quick')} className="card p-5 text-center hover:border-brand-400 transition-all">
              <Zap className="w-8 h-8 mx-auto mb-2 text-amber-500" />
              <p className="font-medium">Quick</p>
              <p className="text-xs text-gray-400 mt-1">No timer, just rate</p>
            </button>
          </div>
        </div>
      )}

      {/* Pomodoro settings modal */}
      {showPomodoroSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowPomodoroSettings(false)}>
          <div className="card p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-semibold text-lg mb-4">Pomodoro Settings</h2>
            <div className="space-y-4">
              <div>
                <label className="label">Work duration (minutes)</label>
                <input
                  type="number" min={1} max={120} className="input"
                  value={pendingWork} onChange={(e) => setPendingWork(Math.max(1, parseInt(e.target.value) || 1))}
                />
              </div>
              <div>
                <label className="label">Break duration (minutes)</label>
                <input
                  type="number" min={1} max={60} className="input"
                  value={pendingBreak} onChange={(e) => setPendingBreak(Math.max(1, parseInt(e.target.value) || 1))}
                />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowPomodoroSettings(false)} className="btn-secondary flex-1">Cancel</button>
                <button onClick={applyPomodoroSettings} className="btn-primary flex-1">Apply</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Running phase: timer */}
      {phase === 'running' && eventType === 'timer' && (
        <div className="card p-8 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Timer running</p>
          <p className="text-5xl font-mono font-bold mb-6">{fmtTime(elapsed)}</p>
          <button onClick={stopTimer} className="btn-danger mx-auto">
            <Square className="w-4 h-4" /> Stop
          </button>
        </div>
      )}

      {/* Running phase: pomodoro */}
      {phase === 'running' && eventType === 'pomodoro' && (
        <div className="card p-8 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
            {pomodoroPhase === 'work' ? 'Focus time' : 'Break time'} · Cycles: {pomodoroCycles}
          </p>
          <p className="text-5xl font-mono font-bold mb-2">{fmtTime(pomodoroSeconds)}</p>
          <p className="text-xs text-gray-400 mb-6">
            {pomodoroPhase === 'work' ? `${workMinutes} min work` : `${breakMinutes} min break`}
          </p>
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
            <label className="label">Velocity — How many pages, problems, or concepts did you cover?</label>
            <input
              type="number" min={1} className="input"
              value={velocity} onChange={(e) => setVelocity(e.target.value)}
              placeholder="e.g. 5 pages or 3 problems"
            />
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
