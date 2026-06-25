import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabase.js';
import { Users, BarChart3, Clock } from 'lucide-react';

export default function Admin() {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState([]);
  const [emails, setEmails] = useState({});
  const [totals, setTotals] = useState({ users: 0, events: 0, hours: 0 });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data: profs } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    setProfiles(profs || []);

    const { count: eventCount } = await supabase.from('study_events').select('*', { count: 'exact', head: true });
    const { data: allEvents } = await supabase.from('study_events').select('duration_minutes');
    const totalHours = (allEvents || []).reduce((s, e) => s + (e.duration_minutes || 0), 0) / 60;

    setTotals({ users: (profs || []).length, events: eventCount || 0, hours: totalHours.toFixed(1) });

    // Fetch emails via edge function
    const { data: session } = await supabase.auth.getSession();
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-users`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.ok) {
      const { users } = await res.json();
      const map = {};
      users.forEach((u) => { map[u.id] = u.email; });
      setEmails(map);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggleAdmin(id, current) {
    await supabase.from('profiles').update({ is_admin: !current }).eq('id', id);
    load();
  }

  if (loading) return <p className="text-gray-400">Loading...</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Admin</h1>

      {/* Site totals */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4">
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-1">
            <Users className="w-4 h-4" />
            <span className="text-xs font-medium">Users</span>
          </div>
          <p className="text-2xl font-bold">{totals.users}</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-1">
            <BarChart3 className="w-4 h-4" />
            <span className="text-xs font-medium">Study events</span>
          </div>
          <p className="text-2xl font-bold">{totals.events}</p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-1">
            <Clock className="w-4 h-4" />
            <span className="text-xs font-medium">Total hours</span>
          </div>
          <p className="text-2xl font-bold">{totals.hours}</p>
        </div>
      </div>

      {/* Profiles table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800 text-xs uppercase text-gray-400">
                <th className="text-left px-4 py-3 font-medium">Email</th>
                <th className="text-left px-4 py-3 font-medium">Display name</th>
                <th className="text-left px-4 py-3 font-medium">Streak</th>
                <th className="text-left px-4 py-3 font-medium">Joined</th>
                <th className="text-left px-4 py-3 font-medium">Admin</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((p) => (
                <tr key={p.id} className="border-b border-gray-100 dark:border-gray-800 last:border-0">
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{emails[p.id] || '—'}</td>
                  <td className="px-4 py-3 font-medium">{p.display_name || '—'}</td>
                  <td className="px-4 py-3">{p.streak_count || 0}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{new Date(p.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleAdmin(p.id, p.is_admin)}
                      className={`px-2 py-1 rounded-md text-xs font-medium ${p.is_admin ? 'bg-brand-100 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300' : 'bg-gray-100 dark:bg-gray-800 text-gray-500'}`}
                    >
                      {p.is_admin ? 'Admin' : 'User'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
