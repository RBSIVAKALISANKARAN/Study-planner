import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../supabase.js';
import { todayLocalISO } from '../lib/dates.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkAndResetStreak = useCallback(async (userId) => {
    try {
      const { data: prof } = await supabase
        .from('profiles')
        .select('streak_count, last_active_date')
        .eq('id', userId)
        .single();

      if (!prof || !prof.last_active_date || prof.streak_count === 0) return;

      const today = todayLocalISO();
      const diff = Math.round(
        (new Date(today + 'T00:00:00') - new Date(prof.last_active_date + 'T00:00:00')) / 86400000
      );

      // If more than 1 day has passed since last activity, streak is broken
      if (diff > 1) {
        await supabase
          .from('profiles')
          .update({ streak_count: 0 })
          .eq('id', userId);
      }
    } catch (err) {
      console.error("Error updating streak tracker:", err);
    }
  }, []);

  const fetchProfile = useCallback(async (userId) => {
    if (!userId) {
      setProfile(null);
      return;
    }
    try {
      // Check streak validity safely
      await checkAndResetStreak(userId);
      
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      setProfile(data);
    } catch (err) {
      console.error("Error fetching user profile data:", err);
    }
  }, [checkAndResetStreak]);

  useEffect(() => {
    let mounted = true;

  async function initializeAuth() {
  try {
    // Race getSession against a 5-second timeout
    const sessionPromise = supabase.auth.getSession();
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('getSession timeout')), 30000)
    );
    const { data: { session: s } } = await Promise.race([sessionPromise, timeoutPromise]);

    if (!mounted) return;
    setSession(s);
    if (s?.user?.id) {
      await fetchProfile(s.user.id);
    }
  } catch (error) {
    console.error("Auth initialization failed:", error);
    // Optionally set a fallback session state here
  } finally {
    if (mounted) setLoading(false);
  }
}

    initializeAuth();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, s) => {
      if (!mounted) return;
      setSession(s);
      if (s?.user?.id) {
        try {
          await fetchProfile(s.user.id);
        } catch (error) {
          console.error("Profile sync failed safely:", error);
        }
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