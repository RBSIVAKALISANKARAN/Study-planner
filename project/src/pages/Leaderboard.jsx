import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabase.js';
import { startOfWeek, endOfWeek } from '../lib/dates.js';
import { Trophy, Flame, Clock, Brain } from 'lucide-react';

export default function Leaderboard() {
  const { user } = useAuth();
  const [tab, setTab] = useState('hours');
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data: optIns } = await supabase
        .from('leaderboard_opt_ins')
        .select('user_id, alias, profiles(display_name, streak_count)')
        .eq('is_visible', true);

      if (!optIns || optIns.length === 0) {
        setEntries([]);
        setLoading(false);
        return;
      }

      if (tab === 'hours') {
        const ws = startOfWeek().toISOString();
        const we = endOfWeek().toISOString();
        const userIds = optIns.map((o) => o.user_id);
        const { data: events } = await supabase
          .from('study_events')
          .select('user_id, duration_minutes')
          .in('user_id', userIds)
          .gte('created_at', ws)
          .lte('created_at', we);
        const hoursMap = {};
        (events || []).forEach((e) => {
          hoursMap[e.user_id] = (hoursMap[e.user_id] || 0) + (e.duration_minutes || 0);
        });
        const ranked = optIns
          .map((o) => ({
            userId: o.user_id,
            name: o.alias || o.profiles?.display_name || 'Anonymous',
            score: (hoursMap[o.user_id] || 0) / 60,
            isMe: o.user_id === user?.id,
          }))
          .sort((a, b) => b.score - a.score);
        setEntries(ranked);

      } else if (tab === 'streak') {
        const ranked = optIns
          .map((o) => ({
            userId: o.user_id,
            name: o.alias || o.profiles?.display_name || 'Anonymous',
            score: o.profiles?.streak_count || 0,
            isMe: o.user_id === user?.id,
          }))
          .sort((a, b) => b.score - a.score);
        setEntries(ranked);

      } else if (tab === 'mastery') {
        // Average mastery across all topics per user
        const userIds = optIns.map((o) => o.user_id);
        const { data: topicsData } = await supabase
          .from('topics')
          .select('user_id, current_mastery')
          .in('user_id', userIds);

        const masteryMap = {};
        const countMap = {};
        (topicsData || []).forEach((t) => {
          masteryMap[t.user_id] = (masteryMap[t.user_id] || 0) + (t.current_mastery || 0);
          countMap[t.user_id] = (countMap[t.user_id] || 0) + 1;
        });

        const ranked = optIns
          .map((o) => ({
            userId: o.user_id,
            name: o.alias || o.profiles?.display_name || 'Anonymous',
            score: countMap[o.user_id] ? Math.round(masteryMap[o.user_id] / countMap[o.user_id]) : 0,
            topicCount: countMap[o.user_id] || 0,
            isMe: o.user_id === user?.id,
          }))
          .sort((a, b) => b.score - a.score);
        setEntries(ranked);
      }

      setLoading(false);
    }
    load();
  }, [tab, user]);

  const tabs = [
    { id: 'hours', label: 'Weekly Hours', icon: Clock },
    { id: 'streak', label: 'Streak', icon: Flame },
    { id: 'mastery', label: 'Avg Mastery', icon: Brain },
  ];

  function formatScore(e) {
    if (tab === 'hours') return `${e.score.toFixed(1)}h`;
    if (tab === 'streak') return `${e.score} days`;
    return `${e.score}%${e.topicCount ? ` (${e.topicCount} topics)` : ''}`;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Leaderboard</h1>
      </div>

      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1 w-fit flex-wrap">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === id ? 'bg-white dark:bg-gray-900 shadow-sm' : 'text-gray-500'}`}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-gray-400">Loading...</p>
      ) : entries.length === 0 ? (
        <div className="card p-12 text-center">
          <Trophy className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400">No one has opted in yet. Enable leaderboard in Settings to appear here.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-800 text-xs font-medium text-gray-400 uppercase">
            <div className="col-span-1">Rank</div>
            <div className="col-span-7">Name</div>
            <div className="col-span-4 text-right">
              {tab === 'hours' ? 'Hours' : tab === 'streak' ? 'Streak' : 'Avg Mastery'}
            </div>
          </div>
          {entries.map((e, i) => (
            <div
              key={e.userId}
              className={`grid grid-cols-12 gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-800 last:border-0 ${e.isMe ? 'bg-brand-50 dark:bg-brand-900/20' : ''}`}
            >
              <div className="col-span-1 flex items-center">
                {i < 3 ? (
                  <span className="text-lg">{['🥇', '🥈', '🥉'][i]}</span>
                ) : (
                  <span className="text-sm font-medium text-gray-400">{i + 1}</span>
                )}
              </div>
              <div className="col-span-7 flex items-center font-medium">
                {e.name}
                {e.isMe && <span className="ml-2 text-xs text-brand-600 dark:text-brand-400 font-medium">(you)</span>}
              </div>
              <div className="col-span-4 text-right font-semibold text-sm">
                {formatScore(e)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
