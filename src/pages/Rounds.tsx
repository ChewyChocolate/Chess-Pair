import React, { useState, useMemo } from 'react';
import { useTournamentStore, MatchResult, Match } from '../store/useTournamentStore';
import { Button } from '../components/ui/Button';
import { generateSwiss, generateRoundRobin, generateTeamSwiss, generateTeamRoundRobin, generateKnockout, generateTeamKnockout } from '../lib/pairing';
import { Printer, Undo2, ArrowLeftRight, X, FileText } from 'lucide-react';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { jsPDF } from 'jspdf';

import { StandingsTable } from './Standings';
import { calculateStandings } from '../lib/tiebreaks';

import { PlayerProfileModal } from '../components/PlayerProfileModal';
import { PgnViewerModal } from '../components/PgnViewerModal';
import { Presentation } from 'lucide-react';

export function Rounds() {
  const tournaments = useTournamentStore(s => s.tournaments);
  const activeId = useTournamentStore(s => s.activeTournamentId);
  const tournament = tournaments?.find(t => t.id === activeId);
  const { 
    startTournament, 
    generatePairings, 
    updateMatchResult, 
    completeRound, 
    rollbackRound, 
    swapPlayers,
    addForcedPairing,
    removeForcedPairing
  } = useTournamentStore();
  
  const [selectedRound, setSelectedRound] = useState<number>(tournament?.currentRound || 1);
  const [swapMode, setSwapMode] = useState(false);
  const [selectedForSwap, setSelectedForSwap] = useState<{ matchId: string, isWhite: boolean } | null>(null);
  const [dialogConfig, setDialogConfig] = useState<{ isOpen: boolean, title?: string, message: string, isAlert?: boolean, onConfirm: () => void } | null>(null);
  const [splitView, setSplitView] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [pgnMatchId, setPgnMatchId] = useState<string | null>(null);

  // Added logic to calculate localized standings
  const activeStandings = useMemo(() => {
    if (!tournament) return [];
    return calculateStandings(tournament, selectedRound);
  }, [tournament, selectedRound, tournament?.matches]);

  if (!tournament) {
    return <div className="text-center text-slate-500 mt-10">Please create a tournament first.</div>;
  }

  if (tournament.status === 'setup') {
    return (
      <div className="text-center mt-10 space-y-4">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Tournament Setup</h2>
        <p className="text-slate-600 dark:text-slate-400">You have {tournament.players.length} players registered.</p>
        <Button 
          size="lg" 
          onClick={() => {
            if (tournament.isTeamTournament && tournament.teams.length < 2) {
              setDialogConfig({
                isOpen: true,
                title: 'Cannot Start',
                message: 'You need at least 2 teams to start a team tournament.',
                isAlert: true,
                onConfirm: () => {}
              });
              return;
            }
            if (!tournament.isTeamTournament && tournament.players.length < 2) {
              setDialogConfig({
                isOpen: true,
                title: 'Cannot Start',
                message: 'You need at least 2 players to start.',
                isAlert: true,
                onConfirm: () => {}
              });
              return;
            }
            startTournament();
            // Generate round 1
            let matches: Match[] = [];
            if (tournament.isTeamTournament) {
              if (tournament.type === 'swiss') {
                matches = generateTeamSwiss(tournament, 1);
              } else if (tournament.type === 'round-robin') {
                matches = generateTeamRoundRobin(tournament, 1);
              } else if (tournament.type === 'knockout') {
                matches = generateTeamKnockout(tournament, 1);
              }
            } else {
              if (tournament.type === 'swiss') {
                matches = generateSwiss(tournament, 1);
              } else if (tournament.type === 'round-robin') {
                matches = generateRoundRobin(tournament.players, 1);
              } else if (tournament.type === 'knockout') {
                matches = generateKnockout(tournament, 1);
              }
            }
            generatePairings(1, matches);
            setSelectedRound(1);
          }}
        >
          Start Tournament & Generate Round 1
        </Button>
      </div>
    );
  }

  const roundMatches = tournament.matches.filter(m => m.round === selectedRound).sort((a, b) => (a.boardNumber || 0) - (b.boardNumber || 0));
  const isCurrentRound = selectedRound === tournament.currentRound;
  const missingResults = roundMatches.filter(m => m.result === null).length;
  const allResultsEntered = roundMatches.length > 0 && missingResults === 0;

  const handleGenerateNextRound = () => {
    setDialogConfig({
      isOpen: true,
      title: 'Generate Next Round',
      message: 'Are you sure you want to complete this round and generate the next one?',
      onConfirm: () => {
        completeRound();
        const nextRound = tournament.currentRound + 1;
        if (nextRound <= tournament.totalRounds) {
          let matches: Match[] = [];
          if (tournament.isTeamTournament) {
            if (tournament.type === 'swiss') {
              matches = generateTeamSwiss(tournament, nextRound);
            } else if (tournament.type === 'round-robin') {
              matches = generateTeamRoundRobin(tournament, nextRound);
            } else if (tournament.type === 'knockout') {
              matches = generateTeamKnockout(tournament, nextRound);
            }
          } else {
            if (tournament.type === 'swiss') {
              matches = generateSwiss(tournament, nextRound);
            } else if (tournament.type === 'round-robin') {
              matches = generateRoundRobin(tournament.players, nextRound);
            } else if (tournament.type === 'knockout') {
              matches = generateKnockout(tournament, nextRound);
            }
          }
          generatePairings(nextRound, matches);
          setSelectedRound(nextRound);
        }
      }
    });
  };

  const handleRollback = () => {
    setDialogConfig({
      isOpen: true,
      title: 'Rollback Round',
      message: 'Are you sure you want to rollback this round? This will delete the current pairings.',
      onConfirm: () => {
        rollbackRound();
        setSelectedRound(Math.max(1, tournament.currentRound - 1));
      }
    });
  };

  const handlePlayerClick = (matchId: string, isWhite: boolean) => {
    if (!swapMode || !isCurrentRound || tournament.status === 'completed') return;
    
    if (!selectedForSwap) {
      setSelectedForSwap({ matchId, isWhite });
    } else {
      if (selectedForSwap.matchId !== matchId || selectedForSwap.isWhite !== isWhite) {
        swapPlayers(selectedForSwap.matchId, selectedForSwap.isWhite, matchId, isWhite);
      }
      setSelectedForSwap(null);
      setSwapMode(false);
    }
  };

  const getPlayerName = (id: string | null) => {
    if (!id) return 'BYE';
    return tournament.players.find(p => p.id === id)?.name || 'Unknown';
  };

  const printScoreSheets = () => {
    const doc = new jsPDF();
    const matchesToPrint = roundMatches.filter(m => m.result !== 'bye');
    
    matchesToPrint.forEach((match, index) => {
      const isSecondOnPage = index % 2 === 1;
      const yOffset = isSecondOnPage ? 145 : 0;

      if (index > 0 && !isSecondOnPage) {
        doc.addPage();
      }

      // Border for score sheet
      doc.setDrawColor(200);
      doc.rect(10, 10 + yOffset, 190, 130);

      // Header
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text(tournament.name, 105, 20 + yOffset, { align: 'center' });
      
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.text(`Round: ${selectedRound}    Board: ${match.boardNumber === 999 ? '-' : match.boardNumber}`, 105, 28 + yOffset, { align: 'center' });
      if (tournament.timeControl) {
        doc.text(`Time Control: ${tournament.timeControl}`, 105, 34 + yOffset, { align: 'center' });
      }

      // Players
      doc.setFontSize(12);
      doc.text('WHITE:', 20, 45 + yOffset);
      doc.setFont('helvetica', 'bold');
      doc.text(getPlayerName(match.whiteId), 40, 45 + yOffset);
      
      doc.setFont('helvetica', 'normal');
      doc.text('BLACK:', 110, 45 + yOffset);
      doc.setFont('helvetica', 'bold');
      doc.text(getPlayerName(match.blackId), 130, 45 + yOffset);

      // Score Grid (Simplified)
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setDrawColor(180);
      
      const gridStartY = 55 + yOffset;
      const colWidth = 45;
      const rowHeight = 6;
      const rows = 10;

      for (let i = 0; i <= rows; i++) {
        const y = gridStartY + i * rowHeight;
        doc.line(20, y, 20 + colWidth * 4, y);
      }
      for (let i = 0; i <= 4; i++) {
        const x = 20 + i * colWidth;
        doc.line(x, gridStartY, x, gridStartY + rows * rowHeight);
      }

      doc.text('Move', 22, gridStartY - 2);
      doc.text('White', 20 + colWidth + 2, gridStartY - 2);
      doc.text('Move', 20 + colWidth * 2 + 2, gridStartY - 2);
      doc.text('Black', 20 + colWidth * 3 + 2, gridStartY - 2);

      for (let i = 1; i <= rows; i++) {
        doc.text(`${i}.`, 22, gridStartY + i * rowHeight - 2);
        doc.text(`${i + rows}.`, 20 + colWidth * 2 + 2, gridStartY + i * rowHeight - 2);
      }

      // Result Section
      doc.setFontSize(11);
      doc.text('RESULT:  [  ] 1-0    [  ] 0-1    [  ] ½-½', 20, 125 + yOffset);

      // Signatures
      doc.line(20, 135 + yOffset, 80, 135 + yOffset);
      doc.text('White Signature', 20, 139 + yOffset);
      
      doc.line(110, 135 + yOffset, 170, 135 + yOffset);
      doc.text('Black Signature', 110, 139 + yOffset);
      
      // Cut line if first on page
      if (!isSecondOnPage && index < matchesToPrint.length - 1) {
        doc.setLineDashPattern([2, 2], 0);
        doc.line(0, 148, 210, 148);
        doc.setLineDashPattern([], 0);
      }
    });

    doc.save(`${tournament.name.replace(/\s+/g, '_')}_Round${selectedRound}_ScoreSheets.pdf`);
  };

  // Group matches by teamMatchId if it's a team tournament
  const groupedMatches: Record<string, Match[]> = {};
  if (tournament.isTeamTournament) {
    roundMatches.forEach(m => {
      const key = m.teamMatchId || 'individual';
      if (!groupedMatches[key]) groupedMatches[key] = [];
      groupedMatches[key].push(m);
    });
  }

  const renderMatchRow = (match: Match) => {
    const isWhiteSelected = selectedForSwap?.matchId === match.id && selectedForSwap?.isWhite;
    const isBlackSelected = selectedForSwap?.matchId === match.id && !selectedForSwap?.isWhite;
    
    return (
      <tr key={match.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
        <td className="px-6 py-4 text-center font-medium text-slate-500 dark:text-slate-400">{match.boardNumber === 999 ? '-' : match.boardNumber}</td>
        <td className="px-6 py-4 text-right">
          <button
            onClick={() => swapMode ? handlePlayerClick(match.id, true) : (match.whiteId && setSelectedPlayerId(match.whiteId))}
            disabled={swapMode && match.result === 'bye'}
            className={`inline-flex items-center gap-2 font-medium ${
              isWhiteSelected ? 'bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100 px-2 py-1 rounded' : 
              swapMode && match.result !== 'bye' ? 'hover:bg-slate-200 dark:hover:bg-slate-700 px-2 py-1 rounded cursor-pointer' : 'text-slate-900 dark:text-white hover:underline'
            }`}
          >
            {getPlayerName(match.whiteId)}
            <span className="text-lg leading-none" title="White">♔</span>
          </button>
        </td>
        <td className="px-6 py-4 text-center">
          {match.result === 'bye' ? (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
              BYE
            </span>
          ) : (
            <select
              className="h-8 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 dark:text-white"
              value={match.result || ''}
              onChange={(e) => updateMatchResult(match.id, (e.target.value || null) as MatchResult)}
              disabled={!isCurrentRound || tournament.status === 'completed' || swapMode}
            >
              <option value="">-</option>
              <option value="1-0">1 - 0</option>
              <option value="0-1">0 - 1</option>
              <option value="0.5-0.5">½ - ½</option>
              <option value="forfeit-white">0F - 1</option>
              <option value="forfeit-black">1 - 0F</option>
            </select>
          )}
        </td>
        <td className="px-6 py-4">
          {match.result !== 'bye' && (
            <button
              onClick={() => swapMode ? handlePlayerClick(match.id, false) : (match.blackId && setSelectedPlayerId(match.blackId))}
              disabled={swapMode}
              className={`inline-flex items-center gap-2 font-medium ${
                isBlackSelected ? 'bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100 px-2 py-1 rounded' : 
                swapMode ? 'hover:bg-slate-200 dark:hover:bg-slate-700 px-2 py-1 rounded cursor-pointer' : 'text-slate-900 dark:text-white hover:underline'
              }`}
            >
              <span className="text-lg leading-none" title="Black">♚</span>
              {getPlayerName(match.blackId)}
            </button>
          )}
        </td>
        <td className="px-4 py-4 text-center print:hidden">
            {match.result !== 'bye' && (
              <button 
                onClick={() => setPgnMatchId(match.id)}
                className={`p-1.5 rounded-md transition-colors ${match.pgn ? 'text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/50 bg-blue-50 dark:bg-blue-900/20' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-300'}`}
                title={match.pgn ? 'View PGN' : 'Add PGN'}
              >
                <Presentation className="w-4 h-4" />
              </button>
            )}
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Rounds</h2>
          {tournament.timeControl && (
            <div className="text-sm text-slate-500 dark:text-slate-400 mt-1 print:block">
              Time Control: {tournament.timeControl}
            </div>
          )}
        </div>
        <div className="flex gap-2 print:hidden">
          {Array.from({ length: tournament.currentRound }).map((_, i) => (
            <Button 
              key={i + 1} 
              variant={selectedRound === i + 1 ? 'default' : 'outline'}
              onClick={() => setSelectedRound(i + 1)}
            >
              R{i + 1}
            </Button>
          ))}
        </div>
      </div>

      {isCurrentRound && tournament.status === 'active' && roundMatches.length === 0 && (
        <div className="bg-white dark:bg-slate-800 p-8 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 text-center">
          
          {tournament.type === 'swiss' && !tournament.isTeamTournament && (
            <div className="max-w-md mx-auto mb-8 text-left bg-slate-50 dark:bg-slate-900/50 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
              <h4 className="font-semibold text-slate-900 dark:text-white mb-3">Forced Pairings (Optional)</h4>
              <div className="space-y-2 mb-3">
                {tournament.forcedPairings?.map((fp, idx) => {
                  const w = tournament.players.find(p => p.id === fp.whiteId)?.name;
                  const b = tournament.players.find(p => p.id === fp.blackId)?.name;
                  return (
                    <div key={idx} className="flex justify-between items-center bg-white dark:bg-slate-800 p-2 rounded border border-slate-200 dark:border-slate-700 text-sm">
                      <span className="dark:text-white"><span title="White">♔</span> {w} vs <span title="Black">♚</span> {b}</span>
                      <button onClick={() => removeForcedPairing(idx)} className="text-red-500 hover:text-red-700"><X className="w-4 h-4"/></button>
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-2">
                <select id="force-white" className="flex-1 h-8 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-xs dark:text-white">
                  <option value="">White...</option>
                  {tournament.players.filter(p => p.active).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <select id="force-black" className="flex-1 h-8 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-xs dark:text-white">
                  <option value="">Black...</option>
                  {tournament.players.filter(p => p.active).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <Button size="sm" variant="outline" onClick={() => {
                  const w = document.getElementById('force-white') as HTMLSelectElement;
                  const b = document.getElementById('force-black') as HTMLSelectElement;
                  if (w.value && b.value && w.value !== b.value) {
                    addForcedPairing(w.value, b.value);
                    w.value = ''; b.value = '';
                  }
                }}>Add</Button>
              </div>
            </div>
          )}

          <Button onClick={handleGenerateNextRound} size="lg">
            Generate Round {selectedRound} Pairings
          </Button>
        </div>
      )}

      <div className={`grid gap-6 items-start ${splitView ? 'grid-cols-1 xl:grid-cols-[1fr_minmax(400px,_1fr)]' : 'grid-cols-1'}`}>
        <div className={`bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden w-full ${roundMatches.length === 0 ? 'hidden' : ''}`}>
          <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex justify-between items-center">
            <h3 className="font-semibold text-slate-900 dark:text-white">Round {selectedRound} Pairings</h3>
            <div className="flex gap-2 print:hidden items-center flex-wrap">
              {isCurrentRound && tournament.status === 'active' && (
                <Button 
                  variant={swapMode ? 'default' : 'outline'} 
                  onClick={() => {
                    setSwapMode(!swapMode);
                    setSelectedForSwap(null);
                  }} 
                  className="gap-2"
                >
                  <ArrowLeftRight className="w-4 h-4" />
                  <span className="hidden xl:inline">
                    {swapMode ? 'Cancel Swap' : 'Swap Players'}
                  </span>
                </Button>
              )}
              <Button variant="outline" onClick={() => window.print()} className="gap-2 hidden lg:flex">
                <Printer className="w-4 h-4" />
                Print
              </Button>
              <Button variant="outline" onClick={printScoreSheets} className="gap-2 hidden xl:flex">
                <FileText className="w-4 h-4" />
                Score Sheets
              </Button>
              <Button 
                variant={splitView ? "default" : "outline"} 
                onClick={() => setSplitView(!splitView)} 
                className="gap-2"
                title="Toggle Split View"
              >
                Split View
              </Button>
              {isCurrentRound && (
                <Button variant="outline" onClick={handleRollback} className="gap-2 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20">
                  <Undo2 className="w-4 h-4" />
                  <span className="hidden lg:inline">Rollback</span>
                </Button>
              )}
              {isCurrentRound && tournament.status === 'active' && (
                <Button 
                  onClick={handleGenerateNextRound} 
                  disabled={!allResultsEntered}
                  className="relative"
                >
                  <span className="hidden lg:inline">
                    {tournament.currentRound === tournament.totalRounds ? 'Complete Tournament' : 'Generate Next Round'}
                  </span>
                  <span className="lg:hidden">Next</span>
                  {!allResultsEntered && roundMatches.length > 0 && (
                    <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] w-5 h-5 flex items-center justify-center rounded-full border-2 border-white dark:border-slate-800 font-bold">
                      {missingResults}
                    </span>
                  )}
                </Button>
              )}
            </div>
          </div>
          
          {swapMode && (
            <div className="bg-blue-50 dark:bg-blue-900/20 p-3 text-sm text-blue-800 dark:text-blue-200 border-b border-blue-100 dark:border-blue-800 text-center print:hidden">
              {selectedForSwap ? 'Select the second player to swap with.' : 'Select the first player to swap.'}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-600 dark:text-slate-400 font-medium border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="px-6 py-3 w-16 text-center">Board</th>
                  <th className="px-6 py-3 text-right w-1/3">White</th>
                  <th className="px-6 py-3 text-center">Result</th>
                  <th className="px-6 py-3 w-1/3">Black</th>
                  <th className="px-6 py-3 text-center w-12 print:hidden"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {tournament.isTeamTournament ? (
                  Object.entries(groupedMatches).map(([teamMatchId, matches]) => {
                    if (teamMatchId === 'individual') {
                      return matches.map(renderMatchRow);
                    }
                    
                    // Find team names
                    const m1 = matches[0];
                    const teamWhite = tournament.teams.find(t => t.playerIds.includes(m1.whiteId!))?.name || 'Team A';
                    const teamBlack = m1.blackId ? tournament.teams.find(t => t.playerIds.includes(m1.blackId!))?.name || 'Team B' : 'BYE';

                    return (
                      <React.Fragment key={teamMatchId}>
                        <tr className="bg-slate-100 dark:bg-slate-800/80">
                          <td colSpan={5} className="px-6 py-2 font-bold text-center text-slate-700 dark:text-slate-300">
                            {teamWhite} vs {teamBlack}
                          </td>
                        </tr>
                        {matches.map(renderMatchRow)}
                      </React.Fragment>
                    );
                  })
                ) : (
                  roundMatches.map(renderMatchRow)
                )}
                {roundMatches.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-slate-500 dark:text-slate-400">No pairings generated for this round.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          
          {isCurrentRound && tournament.status === 'active' && (
            <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 print:hidden overflow-x-auto">
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Manual Pairing</h4>
              <div className="flex gap-2 items-center min-w-[500px]">
                <select id="manual-white" className="flex-1 h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1 text-sm dark:text-white">
                  <option value="">Select White...</option>
                  {tournament.players.filter(p => p.active).map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <span className="text-slate-500">vs</span>
                <select id="manual-black" className="flex-1 h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1 text-sm dark:text-white">
                  <option value="">Select Black (or leave empty for BYE)...</option>
                  {tournament.players.filter(p => p.active).map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <Button 
                  variant="outline"
                  onClick={() => {
                    const whiteSelect = document.getElementById('manual-white') as HTMLSelectElement;
                    const blackSelect = document.getElementById('manual-black') as HTMLSelectElement;
                    if (whiteSelect.value) {
                      useTournamentStore.getState().addManualMatch(selectedRound, whiteSelect.value, blackSelect.value || null);
                      whiteSelect.value = '';
                      blackSelect.value = '';
                    }
                  }}
                >
                  Add Board
                </Button>
              </div>
            </div>
          )}
        </div>

        {splitView && (
          <div className="hidden xl:block w-full print:hidden">
             <div className="flex justify-between items-end mb-4 px-2">
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white">Live Standings</h3>
                  <p className="text-xs text-slate-500">Updates as results are entered</p>
                </div>
                <div className="text-xs bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200 px-2.5 py-1 rounded-full font-medium">
                  Round {selectedRound}
                </div>
            </div>
            <StandingsTable 
              tournament={tournament} 
              standings={activeStandings} 
              compact={true}
              onPlayerClick={setSelectedPlayerId}
            />
          </div>
        )}
      </div>

      {selectedPlayerId && (
        <PlayerProfileModal 
          playerId={selectedPlayerId} 
          onClose={() => setSelectedPlayerId(null)} 
        />
      )}

      {pgnMatchId && (
        <PgnViewerModal
          matchId={pgnMatchId}
          onClose={() => setPgnMatchId(null)}
        />
      )}
      
      {dialogConfig && (
        <ConfirmDialog
          isOpen={dialogConfig.isOpen}
          title={dialogConfig.title}
          message={dialogConfig.message}
          isAlert={dialogConfig.isAlert}
          onConfirm={dialogConfig.onConfirm}
          onCancel={() => setDialogConfig(null)}
        />
      )}
    </div>
  );
}
