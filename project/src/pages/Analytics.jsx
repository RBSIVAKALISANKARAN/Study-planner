import { useEffect, useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabase.js';
import { localDateKey, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from '../lib/dates.js';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  ScatterChart, Scatter, ZAxis,
} from 'recharts';
import { AlertTriangle, ArrowRight } from 'lucide-react';

const RANGES = {
  week: { label: 'This week', getStart: () => startOfWeek(), getEnd: () => endOfWeek() },
  month: { label: 'This month', getStart: () => startOfMonth(), getEnd: () => endOfMonth() },
  all: { label: 'All time', getStart: () => null, getEnd: () => null },
};

export default function Analytics() {
  const { user } = useAuth();
  const [range, setRange] = useState('week');
  const [events, setEvents] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [topics, setTopics] = useState([]);
  const [frictionTopics, setFrictionTopics] = useState([]);
  const [selectedTopicId, setSelectedTopicId] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    const { data: subs } = await supabase.from('subjects').select('*').eq('user_id', user.id);
    setSubjects(subs || []);
    const { data: tops } = await supabase.from('topics').select('*').eq('user_id', user.id);
    setTopics(tops || []);

    let query = supabase.from('study_events').select('*, topics(id, name, subject_id, subjects(id, name, color))').eq('user_id', user.id);
    const r = RANGES[range];
    if (r.getStart()) query = query.gte('created_at', r.getStart().toISOString());
    if (r.getEnd()) query = query.lte('created_at', r.getEnd().toISOString());
    const { data: evts } = await query;
    setEvents(evts || []);

    // Friction: topics where last 3 events all had confidence <= 2
    const { data: allEvents } = await supabase
      .from('study_events')
      .select('id, topic_id, confidence_rating, created_at, topics(id, name, subjects(id, name, color))')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    const byTopic = {};
    (allEvents || []).forEach((e) => {
      if (!byTopic[e.topic_id]) byTopic[e.topic_id] = [];
      if (byTopic[e.topic_id].length < 3) byTopic[e.topic_id].push(e);
    });
    const friction = [];
    Object.entries(byTopic).forEach(([tid, evs]) => {
      if (evs.length === 3 && evs.every((e) => e.confidence_rating <= 2) && evs[0].topics) {
        friction.push(evs[0].topics);
      }
    });
    setFrictionTopics(friction);
    setLoading(false);
  }, [user, range]);

  useEffect(() => { load(); }, [load]);

  // Chart 1: Heatmap calendar (last 12 weeks)
  const heatmapData = useMemo(() => {
    const map = {};
    events.forEach((e) => {
      if (!e.start_time) return;
      const key = localDateKey(new Date(e.start_time));
      map[key] = (map[key] || 0) + (e.duration_minutes || 0);
    });
    const weeks = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(today);
    start.setDate(start.getDate() - (11 * 7 + start.getDay()));
    for (let w = 0; w < 12; w++) {
      const week = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(start);
        date.setDate(start.getDate() + w * 7 + d);
        const key = localDateKey(date);
        week.push({ date, key, minutes: map[key] || 0 });
      }
      weeks.push(week);
    }
    return weeks;
  }, [events]);

  // Chart 2: Subject time pie
  const pieData = useMemo(() => {
    const map = {};
    events.forEach((e) => {
      const s = e.topics?.subjects;
      if (!s) return;
      if (!map[s.id]) map[s.id] = { name: s.name, value: 0, color: s.color };
      map[s.id].value += e.duration_minutes || 0;
    });
    return Object.values(map).filter((d) => d.value > 0);
  }, [events]);

  // Chart 3: Mastery trend for selected topic
  const trendData = useMemo(() => {
    if (!selectedTopicId) return [];
    return events
      .filter((e) => e.topic_id === selectedTopicId)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .map((e, i) => ({
        date: new Date(e.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        mastery: i + 1,
        confidence: e.confidence_rating,
      }));
  }, [events, selectedTopicId]);

  // Chart 4: Productivity heatmap (7 days x 24 hours)
  const productivityData = useMemo(() => {
    const map = {};
    events.forEach((e) => {
      if (!e.start_time) return;
      const d = new Date(e.start_time);
      const day = d.getDay();
      const hour = d.getHours();
      const key = `${day}-${hour}`;
      map[key] = (map[key] || 0) + 1;
    });
    return map;
  }, [events]);

  // Chart 5: Focus vs confidence scatter
  const scatterData = useMemo(() => {
    const bySubject = {};
    events.forEach((e) => {
      if (!e.focus_rating) return;
      const s = e.topics?.subjects;
      if (!s) return;
      if (!bySubject[s.id]) bySubject[s.id] = { name: s.name, color: s.color, data: [] };
      bySubject[s.id].data.push({ x: e.focus_rating, y: e.confidence_rating });
    });
    return Object.values(bySubject);
  }, [events]);

  if (loading) return <p className="text-gray-400">Loading...</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Analytics</h1>
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
          {Object.entries(RANGES).map(([key, r]) => (
            <button
              key={key}
              onClick={() => setRange(key)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                range === key ? 'bg-white dark:bg-gray-900 shadow-sm' : 'text-gray-500'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Friction alert */}
      {frictionTopics.length > 0 && (
        <div className="card p-4 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            <h2 className="font-semibold text-amber-800 dark:text-amber-200">Needs attention</h2>
          </div>
          <p className="text-sm text-amber-700 dark:text-amber-300 mb-3">These topics had low confidence in the last 3 sessions:</p>
          <div className="flex flex-wrap gap-2">
            {frictionTopics.map((t) => (
              <Link
                key={t.id}
                to={`/session?topic=${t.id}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-gray-900 border border-amber-200 dark:border-amber-700 text-sm font-medium hover:bg-amber-50 dark:hover:bg-amber-900/30"
              >
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: t.subjects?.color }}></span>
                {t.name}
                <ArrowRight className="w-3 h-3" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Chart 1: Heatmap calendar */}
      <div className="card p-5">
        <h2 className="font-semibold mb-4">Study Heatmap (last 12 weeks)</h2>
        <div className="flex gap-1 overflow-x-auto pb-2">
          <div className="flex flex-col gap-1 mr-1 text-xs text-gray-400 justify-around">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <span key={d} className="h-4 leading-4">{d}</span>
            ))}
          </div>
          {heatmapData.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-1">
              {week.map((day) => {
                const color = day.minutes === 0 ? 'bg-gray-100 dark:bg-gray-800'
                  : day.minutes <= 30 ? 'bg-green-200 dark:bg-green-900'
                  : day.minutes <= 60 ? 'bg-green-400 dark:bg-green-700'
                  : 'bg-green-600 dark:bg-green-500';
                return (
                  <div
                    key={day.key}
                    className={`w-4 h-4 rounded-sm ${color}`}
                    title={`${day.key}: ${day.minutes} min`}
                  ></div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 mt-3 text-xs text-gray-400">
          <span>Less</span>
          <div className="w-3 h-3 rounded-sm bg-gray-100 dark:bg-gray-800"></div>
          <div className="w-3 h-3 rounded-sm bg-green-200 dark:bg-green-900"></div>
          <div className="w-3 h-3 rounded-sm bg-green-400 dark:bg-green-700"></div>
          <div className="w-3 h-3 rounded-sm bg-green-600 dark:bg-green-500"></div>
          <span>More</span>
        </div>
      </div>

      {/* Chart 2: Subject time pie */}
      <div className="card p-5">
        <h2 className="font-semibold mb-4">Time by Subject</h2>
        {pieData.length === 0 ? (
          <p className="text-sm text-gray-400 py-8 text-center">No data for this range.</p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} innerRadius={50}>
                {pieData.map((d) => <Cell key={d.name} fill={d.color} />)}
              </Pie>
              <Tooltip formatter={(v) => `${(v / 60).toFixed(1)} hrs`} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Chart 3: Mastery trend */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="font-semibold">Mastery Trend</h2>
          <select className="input max-w-xs" value={selectedTopicId} onChange={(e) => setSelectedTopicId(e.target.value)}>
            <option value="">Select a topic</option>
            {topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        {!selectedTopicId ? (
          <p className="text-sm text-gray-400 py-8 text-center">Pick a topic to see its trend.</p>
        ) : trendData.length === 0 ? (
          <p className="text-sm text-gray-400 py-8 text-center">No sessions for this topic in this range.</p>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis domain={[0, 5]} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Line type="monotone" dataKey="confidence" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Chart 4: Productivity heatmap */}
      <div className="card p-5">
        <h2 className="font-semibold mb-4">Productivity by Hour & Day</h2>
        <div className="overflow-x-auto">
          <div className="inline-grid gap-0.5" style={{ gridTemplateColumns: 'auto repeat(24, 1fr)' }}>
            <div></div>
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="text-[10px] text-gray-400 text-center w-6">{h}</div>
            ))}
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, di) => (
              <>
                <div key={day} className="text-xs text-gray-400 pr-2 leading-6">{day}</div>
                {Array.from({ length: 24 }, (_, h) => {
                  const count = productivityData[`${di}-${h}`] || 0;
                  const color = count === 0 ? 'bg-gray-100 dark:bg-gray-800'
                    : count === 1 ? 'bg-green-200 dark:bg-green-900'
                    : count === 2 ? 'bg-green-400 dark:bg-green-700'
                    : 'bg-green-600 dark:bg-green-500';
                  return <div key={`${day}-${h}`} className={`w-6 h-6 rounded-sm ${color}`} title={`${day} ${h}:00 — ${count} sessions`}></div>;
                })}
              </>
            ))}
          </div>
        </div>
      </div>

      {/* Chart 5: Focus vs confidence scatter */}
      <div className="card p-5">
        <h2 className="font-semibold mb-4">Focus vs Confidence</h2>
        {scatterData.length === 0 ? (
          <p className="text-sm text-gray-400 py-8 text-center">No data for this range.</p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
              <XAxis type="number" dataKey="x" name="Focus" domain={[0, 6]} tick={{ fontSize: 12 }} label={{ value: 'Focus', position: 'bottom', offset: 0 }} />
              <YAxis type="number" dataKey="y" name="Confidence" domain={[0, 6]} tick={{ fontSize: 12 }} />
              <ZAxis range={[60, 60]} />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} />
              <Legend />
              {scatterData.map((s) => (
                <Scatter key={s.name} name={s.name} data={s.data} fill={s.color} />
              ))}
            </ScatterChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
