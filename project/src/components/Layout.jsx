import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard,
  Timer,
  BookOpen,
  RefreshCw,
  BarChart3,
  Target,
  Trophy,
  Settings,
  Brain,
  Moon,
  Sun,
  LogOut,
  Shield,
} from 'lucide-react';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/session', label: 'Session', icon: Timer },
  { to: '/topics', label: 'Topics', icon: BookOpen },
  { to: '/review', label: 'Review', icon: RefreshCw },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/goals', label: 'Goals', icon: Target },
  { to: '/leaderboard', label: 'Leaderboard', icon: Trophy },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export default function Layout() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [dark, setDark] = useState(() => {
    const stored = localStorage.getItem('mm-theme');
    if (stored) return stored === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('mm-theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('mm-theme', 'light');
    }
  }, [dark]);

  async function handleSignOut() {
    await signOut();
    navigate('/login');
  }

  const items = [...navItems];
  if (profile?.is_admin) {
    items.splice(items.length - 1, 0, { to: '/admin', label: 'Admin', icon: Shield });
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex fixed inset-y-0 left-0 w-64 flex-col border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="flex items-center gap-2 px-6 h-16 border-b border-gray-200 dark:border-gray-800">
          <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <span className="text-lg font-bold">MasteryMap</span>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {items.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`
              }
            >
              <Icon className="w-5 h-5" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="px-3 py-4 border-t border-gray-200 dark:border-gray-800 space-y-1">
          <button onClick={() => setDark(!dark)} className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 w-full">
            {dark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            {dark ? 'Light mode' : 'Dark mode'}
          </button>
          <button onClick={handleSignOut} className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 w-full">
            <LogOut className="w-5 h-5" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="md:hidden sticky top-0 z-30 flex items-center justify-between px-4 h-14 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-brand-600 flex items-center justify-center">
            <Brain className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold">MasteryMap</span>
        </div>
        <button onClick={() => setDark(!dark)} className="p-2 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
          {dark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>
      </header>

      {/* Main content */}
      <main className="md:ml-64 pb-20 md:pb-0 min-h-screen">
        <div className="max-w-5xl mx-auto px-4 py-6 md:px-8 md:py-8">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom tab bar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 flex items-center justify-around bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 h-16">
        {items.slice(0, 5).map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-0.5 px-2 py-1 text-xs ${
                isActive ? 'text-brand-600 dark:text-brand-400' : 'text-gray-500 dark:text-gray-400'
              }`
            }
          >
            <Icon className="w-5 h-5" />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
