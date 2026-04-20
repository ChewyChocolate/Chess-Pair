import React from 'react';
import { useTournamentStore } from '../store/useTournamentStore';
import { Button } from '../components/ui/Button';
import { useNavigate } from 'react-router-dom';
import { MonitorPlay } from 'lucide-react';

export function Dashboard() {
  const tournaments = useTournamentStore(s => s.tournaments);
  const activeId = useTournamentStore(s => s.activeTournamentId);
  const tournament = tournaments?.find(t => t.id === activeId);
  const navigate = useNavigate();

  if (!tournament) {
    return (
      <div className="text-center py-10">
        <h2 className="text-xl text-slate-600 dark:text-slate-400 mb-4">No active tournament selected.</h2>
        <Button onClick={() => navigate('/')}>Go to Home</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{tournament.name} Dashboard</h2>
        <Button 
          variant="outline" 
          onClick={() => navigate('/tv')} 
          className="gap-2 border-blue-200 hover:bg-blue-50 dark:border-blue-900 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400"
        >
          <MonitorPlay className="w-4 h-4" />
          Launch TV Display
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
          <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">Status</h3>
          <p className="text-3xl font-bold text-slate-900 dark:text-white capitalize">{tournament.status}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
          <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">Round</h3>
          <p className="text-3xl font-bold text-slate-900 dark:text-white">{tournament.currentRound} / {tournament.totalRounds}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
          <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">Players</h3>
          <p className="text-3xl font-bold text-slate-900 dark:text-white">{tournament.players.length}</p>
        </div>
      </div>

      {tournament.status === 'setup' && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-6 rounded-xl">
          <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-2">Ready to start?</h3>
          <p className="text-blue-700 dark:text-blue-300 mb-4">Add all your players, then start the tournament to generate the first round pairings.</p>
          <Button onClick={() => navigate('/players')}>Manage Players</Button>
        </div>
      )}
    </div>
  );
}
