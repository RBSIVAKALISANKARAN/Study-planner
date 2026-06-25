import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../supabase.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (userId) => {
    if (!userId) {
      setProfile(null);
      return;
    }
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    setProfile(data);
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      if (!mounted) return;
      setSession(s);
      if (s?.user?.id) await fetchProfile(s.user.id);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, s) => {
      if (!mounted) return;
      setSession(s);
      if (s?.user?.id) {
        await fetchProfile(s.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const refreshProfile = useCallback(async () => {
    if (session?.user?.id) await fetchProfile(session.user.id);
  }, [session, fetchProfile]);

  const signUp = useCallback(async (email, password, displayName) => {
    return supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    });
  }, []);

  const signIn = useCallback(async (email, password) => {
    return supabase.auth.signInWithPassword({ email, password });
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = {
    session,
    profile,
    loading,
    refreshProfile,
    signUp,
    signIn,
    signOut,
    user: session?.user ?? null,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
