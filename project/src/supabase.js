import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// In-memory mutex lock — replaces the default navigator.locks implementation.
// This prevents the getSession deadlock caused by React 18 StrictMode's
// double-invoke of useEffect unmounting the first effect mid-lock-acquisition,
// which orphans the navigator.locks Web Lock forever and blocks all subsequent
// auth calls (signIn, signUp, getSession) in that browser tab.
const memoryLock = (() => {
  let queue = Promise.resolve();

  return function lock(_name, _acquireTimeout, fn) {
    // Chain onto the queue: wait for previous call to finish (ignoring its
    // rejection so the chain never breaks), then call fn(). The returned
    // promise resolves/rejects with fn()'s own result — not swallowed.
    const run = queue.catch(() => {}).then(() => fn());
    // Store the bare run promise (not caught) as the new tail; a future call's
    // .catch(()=>{}) will handle any rejection for sequencing purposes.
    queue = run;
    return run;
  };
})();

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    lock: memoryLock,
  },
});
