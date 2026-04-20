import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTournamentStore } from '../store/useTournamentStore';
import { calculateStandings, calculateTeamStandings } from '../lib/tiebreaks';
import { ArrowLeft, MonitorPlay } from 'lucide-react';

const ITEMS_PER_PAGE = 12;
const CYCLE_INTERVAL_MS = 10000; // 10 seconds

export function TvDisplay() {
  const navigate = useNavigate();
  const activeId = useTournamentStore(s => s.activeTournamentId);
  const tournaments = useTournamentStore(s => s.tournaments);
  const tournament = tournaments.find(t => t.id === activeId);

  const [currentMode, setCurrentMode] = useState<'pairings' | 'standings'>('pairings');
  const [pageIndex, setPageIndex] = useState(0);

  // Auto-enable dark mode for TV Display
  useEffect(() => {
    document.documentElement.classList.add('dark');
    return () => {
      // Revert based on local storage when leaving
      const isDark = localStorage.getItem('theme') === 'dark';
      if (!isDark) document.documentElement.classList.remove('dark');
    };
  }, []);

  const standings = useMemo(() => {
    if (!tournament || tournament.isTeamTournament) return []; // Simplification, handle teams separately if needed
    return calculateStandings(tournament);
  }, [tournament]);

  const teamStandings = useMemo(() => {
    if (!tournament || !tournament.isTeamTournament) return [];
    return calculateTeamStandings(tournament);
  }, [tournament]);

  if (!tournament) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400">
        <MonitorPlay className="w-16 h-16 mb-4 opacity-50" />
        <h2 className="text-2xl font-bold">No Active Tournament</h2>
        <button onClick={() => navigate('/')} className="mt-6 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Go Back</button>
      </div>
    );
  }

  const roundMatches = tournament.matches.filter(m => m.round === tournament.currentRound);
  
  // Calculate total pages for current mode
  const totalPairingPages = Math.ceil(roundMatches.length / ITEMS_PER_PAGE) || 1;
  const totalStandingsPages = tournament.isTeamTournament 
    ? Math.ceil(teamStandings.length / ITEMS_PER_PAGE) || 1
    : Math.ceil(standings.length / ITEMS_PER_PAGE) || 1;

  useEffect(() => {
    const interval = setInterval(() => {
      setPageIndex((prevPage) => {
        const totalPages = currentMode === 'pairings' ? totalPairingPages : totalStandingsPages;
        
        if (prevPage + 1 < totalPages) {
          return prevPage + 1;
        } else {
          // Switch mode
          setCurrentMode(prev => prev === 'pairings' ? 'standings' : 'pairings');
          return 0; // Reset page
        }
      });
    }, CYCLE_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [currentMode, totalPairingPages, totalStandingsPages]);

  const getPlayerName = (id: string | null) => {
    if (!id) return 'BYE';
    return tournament.players.find(p => p.id === id)?.name || 'Unknown';
  };

  // Content rendering based on mode
  const renderPairings = () => {
    const startIndex = pageIndex * ITEMS_PER_PAGE;
    const currentMatches = roundMatches.slice(startIndex, startIndex + ITEMS_PER_PAGE);

    return (
      <table className="w-full text-left text-2xl table-fixed">
        <thead className="bg-slate-900 border-b border-slate-800 text-slate-400 uppercase tracking-wider text-xl">
          <tr>
            <th className="px-6 py-4 w-24 text-center">Bd</th>
            <th className="px-6 py-4 text-right w-5/12">White</th>
            <th className="px-6 py-4 text-center w-2/12">Result</th>
            <th className="px-6 py-4 w-5/12">Black</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/50 text-white">
          {currentMatches.map(match => (
            <tr key={match.id} className={match.result ? "opacity-60" : ""}>
              <td className="px-6 py-5 text-center font-mono text-slate-500">{match.boardNumber === 999 ? '-' : match.boardNumber}</td>
              <td className="px-6 py-5 text-right font-semibold">{getPlayerName(match.whiteId)}</td>
              <td className="px-6 py-5 text-center font-bold text-yellow-400">
                {match.result === 'bye' ? 'BYE' : match.result || 'vs'}
              </td>
              <td className="px-6 py-5 font-semibold">{getPlayerName(match.blackId)}</td>
            </tr>
          ))}
          {currentMatches.length === 0 && (
            <tr>
              <td colSpan={4} className="px-6 py-12 text-center text-slate-500">No matches for this round.</td>
            </tr>
          )}
        </tbody>
      </table>
    );
  };

  const renderStandings = () => {
    const startIndex = pageIndex * ITEMS_PER_PAGE;
    
    if (tournament.isTeamTournament) {
      const currentTeams = teamStandings.slice(startIndex, startIndex + ITEMS_PER_PAGE);
      return (
        <table className="w-full text-left text-2xl table-fixed">
          <thead className="bg-slate-900 border-b border-slate-800 text-slate-400 uppercase tracking-wider text-xl">
            <tr>
              <th className="px-6 py-4 w-24 text-center">Rk</th>
              <th className="px-6 py-4">Team</th>
              <th className="px-6 py-4 text-center w-32">MP</th>
              <th className="px-6 py-4 text-center w-32">GP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50 text-white">
            {currentTeams.map((team, idx) => (
              <tr key={team.id}>
                <td className="px-6 py-5 text-center font-mono text-slate-500">{startIndex + idx + 1}</td>
                <td className="px-6 py-5 font-semibold">{team.name}</td>
                <td className="px-6 py-5 text-center font-bold text-blue-400">{team.matchPoints}</td>
                <td className="px-6 py-5 text-center text-slate-400">{team.gamePoints}</td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }

    const currentPlayers = standings.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    return (
      <table className="w-full text-left text-2xl table-fixed">
        <thead className="bg-slate-900 border-b border-slate-800 text-slate-400 uppercase tracking-wider text-xl">
          <tr>
            <th className="px-6 py-4 w-24 text-center">Rk</th>
            <th className="px-6 py-4">Player</th>
            <th className="px-6 py-4 text-center w-32">Pts</th>
            <th className="px-6 py-4 text-center w-32" title="Buchholz">BH</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/50 text-white">
          {currentPlayers.map((player, idx) => (
            <tr key={player.id}>
              <td className="px-6 py-5 text-center font-mono text-slate-500">{startIndex + idx + 1}</td>
              <td className="px-6 py-5 font-semibold truncate pr-4">
                {player.title && <span className="text-yellow-600 mr-2 opacity-80">{player.title}</span>}
                {player.name}
              </td>
              <td className="px-6 py-5 text-center font-bold text-blue-400">{player.score}</td>
              <td className="px-6 py-5 text-center text-slate-500">{player.buchholz}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col font-sans overflow-hidden">
      {/* Top Banner */}
      <header className="bg-slate-900 border-b border-slate-800 px-8 py-6 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-4xl font-black text-white tracking-tight flex items-center gap-4">
            {tournament.name}
            {tournament.section && <span className="text-2xl font-bold px-3 py-1 bg-slate-800 text-blue-400 rounded-lg">{tournament.section}</span>}
          </h1>
          <div className="flex items-center gap-4 mt-2">
            <p className="text-xl text-slate-400 font-medium">
              {currentMode === 'pairings' ? `Round ${tournament.currentRound} Pairings` : 'Current Standings'}
            </p>
            <span className="w-2 h-2 rounded-full bg-slate-700"></span>
            <p className="text-lg text-slate-500">{tournament.timeControl}</p>
          </div>
        </div>
        
        {/* Floating actions (hide mouse on real TV by default, but useful for config) */}
        <div className="flex items-center gap-6 opacity-0 hover:opacity-100 transition-opacity duration-300">
          <button onClick={() => navigate('/dashboard')} className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700">
            <ArrowLeft className="w-5 h-5" /> Exit TV Mode
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden p-8 flex flex-col">
        <div className="bg-slate-900/50 rounded-2xl border border-slate-800/80 shadow-2xl flex-1 overflow-hidden flex flex-col relative">
          
          {/* Progress Bar */}
          <div className="absolute top-0 left-0 h-1 bg-blue-600/20 w-full overflow-hidden">
            <div 
              className="h-full bg-blue-500"
              style={{
                width: '100%',
                animation: `shrink ${CYCLE_INTERVAL_MS}ms linear infinite`
              }}
            ></div>
          </div>
          <style>{`
            @keyframes shrink {
              0% { width: 100%; }
              100% { width: 0%; }
            }
          `}</style>
          
          {currentMode === 'pairings' ? renderPairings() : renderStandings()}
        </div>
      </main>

      {/* Footer / Pagination Indicator */}
      <footer className="px-8 py-4 bg-slate-950 flex justify-between items-center text-slate-500 text-lg shrink-0">
        <div>
          Showing {currentMode === 'pairings' ? 'Pairings' : 'Standings'}: Page {pageIndex + 1} of {currentMode === 'pairings' ? totalPairingPages : totalStandingsPages}
        </div>
        <div className="flex items-center gap-3">
          <span className={`w-3 h-3 rounded-full ${currentMode === 'pairings' ? 'bg-blue-500' : 'bg-slate-800'}`}></span>
          <span className={`w-3 h-3 rounded-full ${currentMode === 'standings' ? 'bg-blue-500' : 'bg-slate-800'}`}></span>
        </div>
      </footer>
    </div>
  );
}
