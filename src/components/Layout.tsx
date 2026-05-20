import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTournamentStore } from '../store/useTournamentStore';
import { Trophy, Users, Calendar, Settings, LayoutDashboard, Home as HomeIcon, Moon, Sun } from 'lucide-react';
import { cn } from '../lib/utils';

export function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const tournaments = useTournamentStore(s => s.tournaments);
  const activeId = useTournamentStore(s => s.activeTournamentId);
  const tournament = tournaments?.find(t => t.id === activeId);
  
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('theme') === 'dark' || 
      (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  const navItems = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { name: 'Players', path: '/players', icon: Users },
    ...(tournament?.isTeamTournament ? [{ name: 'Teams', path: '/teams', icon: Users }] : []),
    { name: 'Rounds', path: '/rounds', icon: Calendar },
    { name: 'Standings', path: '/standings', icon: Trophy },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col md:flex-row transition-colors duration-200">
      {/* Sidebar */}
<aside className="w-full md:w-56 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex-shrink-0 flex flex-col">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
          <h1 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Trophy className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            ChessPair
          </h1>
          <button onClick={() => setDarkMode(!darkMode)} className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400">
            {darkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          </button>
        </div>
        
        <div className="p-3 border-b border-slate-200 dark:border-slate-800">
          <Link to="/" className={cn(
            "flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors",
            location.pathname === '/' ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400" : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          )}>
            <HomeIcon className="w-3.5 h-3.5" />
            All Tournaments
          </Link>
        </div>

        {tournament && (
          <>
            <div className="px-4 py-3">
              <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{tournament.name}</p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 capitalize">{tournament.isTeamTournament ? 'Team' : 'Individual'} {tournament.type} • {tournament.status}</p>
            </div>
            <nav className="p-3 pt-0 space-y-0.5 flex-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={cn(
                      "flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors",
                      isActive
                        ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
                        : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {item.name}
                  </Link>
                );
              })}
            </nav>
          </>
        )}
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-5 overflow-auto">
        <div className="max-w-5xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
