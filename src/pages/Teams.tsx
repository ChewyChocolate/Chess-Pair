import React, { useState } from 'react';
import { useTournamentStore } from '../store/useTournamentStore';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Users } from 'lucide-react';

export function Teams() {
  const tournaments = useTournamentStore(s => s.tournaments);
  const activeId = useTournamentStore(s => s.activeTournamentId);
  const tournament = tournaments?.find(t => t.id === activeId);
  const { addTeam, assignPlayerToTeam } = useTournamentStore();
  const [teamName, setTeamName] = useState('');

  if (!tournament) return null;
  if (!tournament.isTeamTournament) {
    return <div className="text-center text-slate-500 mt-10 dark:text-slate-400">This is not a team tournament.</div>;
  }

  const handleAddTeam = (e: React.FormEvent) => {
    e.preventDefault();
    if (teamName.trim()) {
      addTeam(teamName.trim());
      setTeamName('');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Teams</h2>
      </div>

      {tournament.status === 'setup' && (
        <form onSubmit={handleAddTeam} className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Team Name</label>
            <Input value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="e.g. Chess Club A" required className="dark:bg-slate-900 dark:border-slate-700 dark:text-white" />
          </div>
          <Button type="submit">Create Team</Button>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {tournament.teams.map(team => (
          <div key={team.id} className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-500" />
              {team.name}
            </h3>
            
            <div className="space-y-2 mb-4 min-h-[100px]">
              {team.playerIds.map((pid, idx) => {
                const p = tournament.players.find(pl => pl.id === pid);
                return (
                  <div key={pid} className="text-sm text-slate-700 dark:text-slate-300 flex justify-between">
                    <span>Board {idx + 1}: {p?.name}</span>
                    <span className="text-slate-500">{p?.rating}</span>
                  </div>
                );
              })}
              {team.playerIds.length === 0 && (
                <div className="text-sm text-slate-500 italic">No players assigned</div>
              )}
            </div>

            {tournament.status === 'setup' && (
              <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                <select 
                  className="w-full h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1 text-sm dark:text-white"
                  onChange={(e) => {
                    if (e.target.value) {
                      assignPlayerToTeam(team.id, e.target.value);
                      e.target.value = '';
                    }
                  }}
                  defaultValue=""
                >
                  <option value="" disabled>Assign player to Board {team.playerIds.length + 1}...</option>
                  {tournament.players
                    .filter(p => !tournament.teams.some(t => t.playerIds.includes(p.id)))
                    .map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.rating || 'UR'})</option>
                    ))
                  }
                </select>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
