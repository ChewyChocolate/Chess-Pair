import React from 'react';
import { useTournamentStore } from '../store/useTournamentStore';
import { getPlayerStats } from '../lib/playerStats';
import { X } from 'lucide-react';

interface PlayerProfileModalProps {
  playerId: string;
  onClose: () => void;
}

export function PlayerProfileModal({ playerId, onClose }: PlayerProfileModalProps) {
  const tournaments = useTournamentStore(s => s.tournaments);
  const activeId = useTournamentStore(s => s.activeTournamentId);
  const tournament = tournaments?.find(t => t.id === activeId);
  
  if (!tournament) return null;

  const player = tournament.players.find(p => p.id === playerId);
  if (!player) return null;

  const { stats, hasColorWarning, colorDiff, consecutiveColors, lastColor, hasByeWarning, byeCount } = getPlayerStats(tournament, playerId);

  const totalScore = stats.reduce((acc, s) => acc + (s.result === '1' ? 1 : s.result === '0.5' ? 0.5 : 0), 0);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-lg max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              {player.title && <span className="text-slate-500 mr-1">{player.title}</span>}
              {player.name}
            </h2>
            <div className="text-sm text-slate-500 flex gap-2 mt-1">
              {player.rating && <span>Rating: {player.rating}</span>}
              {player.club && <span>Club: {player.club}</span>}
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-500 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto">
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
              <div className="text-sm text-slate-500 mb-1">Current Score</div>
              <div className="text-2xl font-bold text-slate-900">{totalScore - (player.penaltyPoints || 0)}</div>
              {player.penaltyPoints ? <div className="text-xs text-red-500 mt-1">Includes {player.penaltyPoints} pt penalty</div> : null}
            </div>
            <div className={`p-4 rounded-lg border ${hasColorWarning ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
              <div className="text-sm text-slate-500 mb-1">Color Balance</div>
              <div className="text-sm font-medium text-slate-900">
                Diff: {colorDiff > 0 ? `+${colorDiff}W` : colorDiff < 0 ? `${Math.abs(colorDiff)}B` : '0'}
              </div>
              {hasColorWarning && (
                <div className="text-xs text-amber-700 mt-1 font-medium">
                  Warning: {consecutiveColors} {lastColor} in a row
                </div>
              )}
            </div>
          </div>

          {hasByeWarning && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
              <span className="text-red-500 mt-0.5 text-base leading-none">⚠</span>
              <div className="text-sm text-red-700 font-medium">
                Bye warning: this player has received {byeCount} system byes.
              </div>
            </div>
          )}

          <div className="mb-6 p-4 bg-red-50/50 border border-red-100 rounded-lg">
            <h3 className="font-semibold text-slate-900 mb-2">Tournament Penalties</h3>
            <div className="flex items-center gap-3">
              <label htmlFor="penalty-points" className="text-sm text-slate-600">Deduct Points:</label>
              <input 
                id="penalty-points"
                type="number" 
                min="0" 
                step="0.5" 
                value={player.penaltyPoints || 0} 
                onChange={(e) => useTournamentStore.getState().updatePlayer(player.id, { penaltyPoints: Number(e.target.value) || 0 })}
                className="w-20 pl-2 pr-1 py-1 text-sm border-slate-300 rounded-md focus:ring-red-500 focus:border-red-500"
              />
              <span className="text-xs text-slate-500">Applies to total score automatically.</span>
            </div>
          </div>

          <h3 className="font-semibold text-slate-900 mb-3">Tournament History</h3>
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2 w-12 text-center">Rd</th>
                  <th className="px-4 py-2 w-16 text-center">Color</th>
                  <th className="px-4 py-2">Opponent</th>
                  <th className="px-4 py-2 w-16 text-center">Res</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {stats.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-slate-500">No games played yet.</td>
                  </tr>
                ) : (
                  stats.map((s, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-4 py-2 text-center text-slate-500">{s.round}</td>
                      <td className="px-4 py-2 text-center font-medium">
                        {s.color === 'W' ? '♔' : s.color === 'B' ? '♚' : '-'}
                      </td>
                      <td className="px-4 py-2 text-slate-900">{s.opponentName}</td>
                      <td className="px-4 py-2 text-center font-bold">
                        {s.result === '1' ? <span className="text-green-600">1</span> : 
                         s.result === '0' ? <span className="text-red-600">0</span> : 
                         s.result === '0.5' ? <span className="text-slate-600">½</span> : '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
