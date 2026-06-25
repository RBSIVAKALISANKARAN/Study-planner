import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabase.js';
import { Download, Trash2, X } from 'lucide-react';

export default function Settings() {
  const { profile, user, refreshProfile, signOut } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [optIn, setOptIn] = useState(false);
  const [alias, setAlias] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [showDelete, setShowDelete] = useState(false);

  useEffect(() => {
    setDisplayName(profile?.display_name || '');
  }, [profile]);

  useEffect(() => {
    async function loadOptIn() {
      if (!user) return;
      const { data } = await supabase.from('leaderboard_opt_ins').select('*').eq('user_id', user.id).maybeSingle();
      if (data) {
        setOptIn(data.is_visible);
        setAlias(data.alias || '');
      }
    }
    loadOptIn();
  }, [user]);

  async function saveProfile() {
    setSaving(true);
    await supabase.from('profiles').update({ display_name: displayName }).eq('id', user.id);
    await refreshProfile();
    setSaving(false);
    setSavedMsg('Profile saved');
    setTimeout(() => setSavedMsg(''), 2000);
  }

  async function saveOptIn() {
    setSaving(true);
    const payload = { user_id: user.id, is_visible: optIn, alias: alias || null };
    const { data: existing } = await supabase.from('leaderboard_opt_ins').select('user_id').eq('user_id', user.id).maybeSingle();
    if (existing) {
      await supabase.from('leaderboard_opt_ins').update({ is_visible: optIn, alias: alias || null }).eq('user_id', user.id);
    } else {
      await supabase.from('leaderboard_opt_ins').insert(payload);
    }
    setSaving(false);
    setSavedMsg('Leaderboard settings saved');
    setTimeout(() => setSavedMsg(''), 2000);
  }

  async function exportData() {
    const { data: events } = await supabase.from('study_events').select('*').eq('user_id', user.id);
    const blob = new Blob([JSON.stringify(events, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'masterymap_study_events.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function deleteAccount() {
    const { error } = await supabase.auth.admin.deleteUser(user.id);
    if (error) {
      alert('Could not delete account from client. Please contact support.');
      return;
    }
    await signOut();
    navigate('/login');
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">Settings</h1>

      {savedMsg && <div className="card p-3 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 text-sm">{savedMsg}</div>}

      {/* Profile */}
      <div className="card p-5 space-y-4">
        <h2 className="font-semibold">Profile</h2>
        <div>
          <label className="label">Display name</label>
          <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </div>
        <button onClick={saveProfile} className="btn-primary" disabled={saving}>Save profile</button>
      </div>

      {/* Leaderboard opt-in */}
      <div className="card p-5 space-y-4">
        <h2 className="font-semibold">Leaderboard</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Show me on the leaderboard</p>
            <p className="text-xs text-gray-400">Others will see your name and stats</p>
          </div>
          <button
            onClick={() => setOptIn(!optIn)}
            className={`relative w-12 h-6 rounded-full transition-colors ${optIn ? 'bg-brand-600' : 'bg-gray-300 dark:bg-gray-700'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${optIn ? 'translate-x-6' : ''}`}></span>
          </button>
        </div>
        {optIn && (
          <div>
            <label className="label">Alias (optional)</label>
            <input className="input" value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="Leave blank to use display name" />
          </div>
        )}
        <button onClick={saveOptIn} className="btn-primary" disabled={saving}>Save leaderboard settings</button>
      </div>

      {/* Data export */}
      <div className="card p-5 space-y-4">
        <h2 className="font-semibold">Data</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">Download all your study events as JSON.</p>
        <button onClick={exportData} className="btn-secondary">
          <Download className="w-4 h-4" /> Export study events
        </button>
      </div>

      {/* Danger zone */}
      <div className="card p-5 space-y-4 border-red-200 dark:border-red-800">
        <h2 className="font-semibold text-red-600 dark:text-red-400">Danger Zone</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">Permanently delete your account and all study data. This cannot be undone.</p>
        <button onClick={() => setShowDelete(true)} className="btn-danger">
          <Trash2 className="w-4 h-4" /> Delete account
        </button>
      </div>

      {showDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowDelete(false)}>
          <div className="card p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-lg text-red-600">Delete account?</h2>
              <button onClick={() => setShowDelete(false)} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">This will permanently delete your profile, subjects, topics, and all study history. This action cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowDelete(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={deleteAccount} className="btn-danger flex-1">Delete forever</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
