import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useTournamentStore, MatchResult, Match } from '../store/useTournamentStore';
import { Button } from '../components/ui/Button';
import { generateSwiss, generateRoundRobin, generateTeamSwiss, generateTeamRoundRobin, generateKnockout, generateTeamKnockout, calculateScores } from '../lib/pairing';
import { Printer, Undo2, ArrowLeftRight, X, FileText, AlertTriangle } from 'lucide-react';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { jsPDF } from 'jspdf';

import { StandingsTable } from './Standings';
import { calculateStandings } from '../lib/tiebreaks';

import { PlayerProfileModal } from '../components/PlayerProfileModal';

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
  const [splitRatio, setSplitRatio] = useState(0.75);
  const [isDragging, setIsDragging] = useState(false);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const [showWarnings, setShowWarnings] = useState(true);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [liveStandings, setLiveStandings] = useState(true);

  // Added logic to calculate localized standings
  const activeStandings = useMemo(() => {
    if (!tournament) return [];
    const round = liveStandings ? selectedRound : selectedRound - 1;
    return calculateStandings(tournament, round);
  }, [tournament, selectedRound, liveStandings, tournament?.matches]);

  const previousScores = useMemo(() => {
    if (!tournament) return {};
    return calculateScores(tournament, selectedRound - 1).scores;
  }, [tournament, selectedRound, tournament?.matches]);

  const roundMatches = tournament?.matches.filter(m => m.round === selectedRound).sort((a, b) => (a.boardNumber || 0) - (b.boardNumber || 0)) || [];

  const displayRoundMatches = roundMatches;

  const getTeamMatchScore = (matches: Match[]) => {
    let w = 0;
    let b = 0;
    matches.forEach(m => {
      if (m.result === '1-0' || m.result === 'forfeit-black') w++;
      else if (m.result === '0-1' || m.result === 'forfeit-white') b++;
      else if (m.result === '0.5-0.5') { w += 0.5; b += 0.5; }
    });
    return `${w} - ${b}`;
  };

  const getPlayerName = (id: string | null) => {
    if (!id) return 'BYE';
    return tournament?.players.find(p => p.id === id)?.name || 'Unknown';
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!splitContainerRef.current) return;
      const rect = splitContainerRef.current.getBoundingClientRect();
      const newRatio = (e.clientX - rect.left) / rect.width;
      setSplitRatio(Math.max(0.25, Math.min(0.75, newRatio)));
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  // Clear swap state when navigating between rounds
  useEffect(() => {
    setSwapMode(false);
    setSelectedForSwap(null);
  }, [selectedRound]);

  const startAndGenerate = () => {
    startTournament();
    const state = useTournamentStore.getState();
    const freshTournament = state.tournaments.find(t => t.id === activeId);
    if (!freshTournament) return;
    let matches: Match[] = [];
    if (freshTournament.isTeamTournament) {
      if (freshTournament.type === 'swiss') {
        matches = generateTeamSwiss(freshTournament, 1);
      } else if (freshTournament.type === 'round-robin') {
        matches = generateTeamRoundRobin(freshTournament, 1);
      } else if (freshTournament.type === 'knockout') {
        matches = generateTeamKnockout(freshTournament, 1);
      }
    } else {
      if (freshTournament.type === 'swiss') {
        matches = generateSwiss(freshTournament, 1);
      } else if (freshTournament.type === 'round-robin') {
        matches = generateRoundRobin(freshTournament.players, 1);
      } else if (freshTournament.type === 'knockout') {
        matches = generateKnockout(freshTournament, 1);
      }
    }
    generatePairings(1, matches);
    setSelectedRound(1);
  };

  if (!tournament) {
    return <div className="text-center text-slate-500 mt-10">Please create a tournament first.</div>;
  }

  if (tournament.status === 'setup') {
    return (
      <>
      <div className="text-center mt-10 space-y-4">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Tournament Setup</h2>
        <p className="text-slate-600 dark:text-slate-400">You have {tournament.players.length} players registered.</p>
        <Button 
          size="lg" 
          onClick={() => {
            const activePlayers = tournament.players.filter(p => p.active && !p.withdrawn).length;
            const isTeam = tournament.isTeamTournament;
            const type = tournament.type;

            // Minimum player/team checks
            if (isTeam && tournament.teams.length < 2) {
              setDialogConfig({
                isOpen: true, title: 'Cannot Start',
                message: 'You need at least 2 teams to start a team tournament.',
                isAlert: true, onConfirm: () => {}
              });
              return;
            }
            if (!isTeam && activePlayers < 2) {
              setDialogConfig({
                isOpen: true, title: 'Cannot Start',
                message: 'You need at least 2 players to start.',
                isAlert: true, onConfirm: () => {}
              });
              return;
            }
            if (!isTeam && type === 'swiss' && activePlayers < 4) {
              setDialogConfig({
                isOpen: true, title: 'Cannot Start',
                message: `Swiss needs at least 4 active players (${activePlayers} available).`,
                isAlert: true, onConfirm: () => {}
              });
              return;
            }
            if (!isTeam && type === 'round-robin' && activePlayers < 3) {
              setDialogConfig({
                isOpen: true, title: 'Cannot Start',
                message: `Round-robin needs at least 3 active players (${activePlayers} available).`,
                isAlert: true, onConfirm: () => {}
              });
              return;
            }

            // Knockout power-of-2 advisory
            if (!isTeam && type === 'knockout') {
              const isPowerOfTwo = (activePlayers & (activePlayers - 1)) === 0;
              if (!isPowerOfTwo) {
                const nextPow2 = Math.pow(2, Math.ceil(Math.log2(activePlayers)));
                setDialogConfig({
                  isOpen: true, title: 'Knockout Advisory',
                  message: `${activePlayers} players is not a power of 2. ${nextPow2 - activePlayers} byes will be assigned to fill the bracket. Continue?`,
                  onConfirm: () => startAndGenerate(),
                });
                return;
              }
            }

            // Round-robin round count advisory
            if (!isTeam && type === 'round-robin') {
              const rounds = activePlayers % 2 === 0 ? activePlayers - 1 : activePlayers;
              setDialogConfig({
                isOpen: true, title: 'Start Tournament',
                message: `Round-robin with ${activePlayers} players will run for ${rounds} rounds. Start?`,
                onConfirm: () => startAndGenerate(),
              });
              return;
            }

            startAndGenerate();
          }}
        >
          Start Tournament & Generate Round 1
        </Button>
      </div>
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
      </>
    );
  }

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
        const state = useTournamentStore.getState();
        const freshTournament = state.tournaments.find(t => t.id === activeId);
        if (!freshTournament) return;

        const activeCount = freshTournament.players.filter(p => p.active && !p.withdrawn).length;
        if (activeCount < 2) {
          setDialogConfig({
            isOpen: true, title: 'Tournament Complete',
            message: `Only ${activeCount} active player${activeCount === 1 ? '' : 's'} remain${activeCount === 0 ? '' : 's'}. The tournament cannot continue.`,
            isAlert: true, onConfirm: () => {}
          });
          return;
        }

        if (freshTournament.status === 'active') {
          const nextRound = freshTournament.currentRound;
          let matches: Match[] = [];
          if (freshTournament.isTeamTournament) {
            if (freshTournament.type === 'swiss') {
              matches = generateTeamSwiss(freshTournament, nextRound);
            } else if (freshTournament.type === 'round-robin') {
              matches = generateTeamRoundRobin(freshTournament, nextRound);
            } else if (freshTournament.type === 'knockout') {
              matches = generateTeamKnockout(freshTournament, nextRound);
            }
          } else {
            if (freshTournament.type === 'swiss') {
              matches = generateSwiss(freshTournament, nextRound);
            } else if (freshTournament.type === 'round-robin') {
              matches = generateRoundRobin(freshTournament.players, nextRound);
            } else if (freshTournament.type === 'knockout') {
              matches = generateKnockout(freshTournament, nextRound);
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

    const clickedMatch = roundMatches.find(m => m.id === matchId);
    if (!clickedMatch || clickedMatch.result === 'bye' || clickedMatch.result !== null) return;

    if (!selectedForSwap) {
      setSelectedForSwap({ matchId, isWhite });
    } else {
      // Deselect if clicking the same player again
      if (selectedForSwap.matchId === matchId && selectedForSwap.isWhite === isWhite) {
        setSelectedForSwap(null);
        return;
      }
      const prevMatch = roundMatches.find(m => m.id === selectedForSwap.matchId);
      if (!prevMatch || prevMatch.result !== null) {
        setSelectedForSwap(null);
        return;
      }
      swapPlayers(selectedForSwap.matchId, selectedForSwap.isWhite, matchId, isWhite);
      setSelectedForSwap(null);
      setSwapMode(false);
    }
  };

  const printScoreSheets = () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const matchesToPrint = roundMatches.filter(m => m.result !== 'bye');
    const pageH = 297;
    const sheetH = 94; // 3 sheets fit in 297mm with small margins
    const sheetW = 190;
    const marginX = 10;

    const getPlayerInfo = (id: string | null) => {
      if (!id) return { name: 'BYE', rating: '' };
      const p = tournament.players.find(pl => pl.id === id);
      return { name: p?.name || 'Unknown', rating: p?.rating ? `(${p.rating})` : '' };
    };

    matchesToPrint.forEach((match, index) => {
      const slot = index % 3;
      const yBase = marginX + slot * sheetH;

      if (index > 0 && slot === 0) doc.addPage();

      const white = getPlayerInfo(match.whiteId);
      const black = getPlayerInfo(match.blackId);

      // Outer border
      doc.setDrawColor(160);
      doc.setLineWidth(0.4);
      doc.rect(marginX, yBase, sheetW, sheetH - 2);

      // ── Header band ──
      doc.setFillColor(51, 65, 85);
      doc.rect(marginX, yBase, sheetW, 9, 'F');
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text(tournament.name, 105, yBase + 6, { align: 'center' });

      // Round / Board / Time control
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(80);
      const boardLabel = match.boardNumber === 999 ? '-' : String(match.boardNumber);
      const tcText = tournament.timeControl ? `  ·  TC: ${tournament.timeControl}` : '';
      doc.text(`Round ${selectedRound}  ·  Board ${boardLabel}${tcText}`, 105, yBase + 14, { align: 'center' });

      // ── Player row ──
      const playerY = yBase + 20;
      doc.setDrawColor(200);
      doc.setLineWidth(0.3);
      doc.line(marginX, playerY, marginX + sheetW, playerY);

      // White
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30);
      doc.text('WHITE', marginX + 3, playerY + 5.5);
      doc.setFont('helvetica', 'normal');
      doc.text(`${white.name} ${white.rating}`.trim(), marginX + 3, playerY + 11);

      // divider
      doc.line(marginX + sheetW / 2, playerY, marginX + sheetW / 2, playerY + 14);

      // Black
      doc.setFont('helvetica', 'bold');
      doc.text('BLACK', marginX + sheetW / 2 + 3, playerY + 5.5);
      doc.setFont('helvetica', 'normal');
      doc.text(`${black.name} ${black.rating}`.trim(), marginX + sheetW / 2 + 3, playerY + 11);

      doc.line(marginX, playerY + 14, marginX + sheetW, playerY + 14);

      // ── Move grid ──
      // Two side-by-side grids (moves 1-20 left, 21-40 right)
      const gridTop = playerY + 17;
      const colW = [8, 28, 28]; // Move# | White | Black
      const rowH = 4.2;
      const rows = 20;
      const gridW = colW[0] + colW[1] + colW[2]; // 64mm per grid
      const gap = 6; // gap between the two grids
      const leftX = marginX + (sheetW - gridW * 2 - gap) / 2;
      const rightX = leftX + gridW + gap;

      const drawGrid = (startX: number, moveOffset: number) => {
        // Header row
        doc.setFillColor(230, 234, 240);
        doc.rect(startX, gridTop, gridW, rowH, 'F');
        doc.setFontSize(6);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(60);
        doc.text('#', startX + colW[0] / 2, gridTop + rowH - 1, { align: 'center' });
        doc.text('White', startX + colW[0] + colW[1] / 2, gridTop + rowH - 1, { align: 'center' });
        doc.text('Black', startX + colW[0] + colW[1] + colW[2] / 2, gridTop + rowH - 1, { align: 'center' });

        // Grid lines
        doc.setDrawColor(200);
        doc.setLineWidth(0.2);
        for (let r = 0; r <= rows; r++) {
          doc.line(startX, gridTop + rowH + r * rowH, startX + gridW, gridTop + rowH + r * rowH);
        }
        for (let c = 0, x = startX; c <= 3; c++) {
          doc.line(x, gridTop, x, gridTop + rowH * (rows + 1));
          if (c < 3) x += colW[c];
        }

        // Move numbers
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(5.5);
        doc.setTextColor(100);
        for (let r = 1; r <= rows; r++) {
          doc.text(`${r + moveOffset}.`, startX + colW[0] - 1, gridTop + rowH * r + rowH - 1, { align: 'right' });
        }
      };

      drawGrid(leftX, 0);
      drawGrid(rightX, 20);

      // ── Result & signatures ──
      const bottomY = gridTop + rowH * (rows + 1) + 4;
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(30);
      doc.text('Result:', marginX + 3, bottomY + 4);
      doc.setFont('helvetica', 'normal');
      doc.text('[ ] 1-0     [ ] 0-1     [ ] ½-½     [ ] Adjourned', marginX + 18, bottomY + 4);

      // Signature lines
      const sigY = bottomY + 10;
      doc.setDrawColor(150);
      doc.setLineWidth(0.3);
      doc.line(marginX + 3, sigY, marginX + 85, sigY);
      doc.line(marginX + 100, sigY, marginX + sheetW - 3, sigY);
      doc.setFontSize(6);
      doc.setTextColor(120);
      doc.text('White signature', marginX + 3, sigY + 3.5);
      doc.text('Black signature', marginX + 100, sigY + 3.5);

      // Cut line between sheets (not after last on page)
      if (slot < 2 && index < matchesToPrint.length - 1) {
        doc.setDrawColor(180);
        doc.setLineWidth(0.2);
        doc.setLineDashPattern([1.5, 1.5], 0);
        doc.line(0, yBase + sheetH - 1, 210, yBase + sheetH - 1);
        doc.setLineDashPattern([], 0);
      }
    });

    doc.save(`${tournament.name.replace(/\s+/g, '_')}_Round${selectedRound}_ScoreSheets.pdf`);
  };

  // Group matches by teamMatchId if it's a team tournament (using display order)
  const groupedMatches: Record<string, Match[]> = {};
  if (tournament.isTeamTournament) {
    displayRoundMatches.forEach(m => {
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
            <span className="flex items-center gap-2 justify-end">
              {getPlayerName(match.whiteId)}
              {match.whiteId && (
                <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 font-bold px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                  {previousScores[match.whiteId] || 0}
                </span>
              )}
              <span className="text-lg leading-none" title="White">♔</span>
            </span>
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
              className={`inline-flex items-center gap-2 font-medium ${
                isBlackSelected ? 'bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100 px-2 py-1 rounded' :
                swapMode ? 'hover:bg-slate-200 dark:hover:bg-slate-700 px-2 py-1 rounded cursor-pointer' : 'text-slate-900 dark:text-white hover:underline'
              }`}
            >
              <span className="flex items-center gap-2">
                <span className="text-lg leading-none" title="Black">♚</span>
                {match.blackId && (
                  <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 font-bold px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                    {previousScores[match.blackId] || 0}
                  </span>
                )}
                {getPlayerName(match.blackId)}
              </span>
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

{isCurrentRound && tournament.status === 'active' && displayRoundMatches.length === 0 && (
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 text-center">
          <Button onClick={handleGenerateNextRound} size="sm">
            Auto-Generate Round {selectedRound}
          </Button>
        </div>
      )}

      <div 
        ref={splitContainerRef}
        className={`flex gap-2 items-start ${splitView ? '' : 'flex-col'}`}
        style={splitView ? { userSelect: isDragging ? 'none' : 'auto' } : undefined}
      >
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden w-full" style={splitView ? { flex: splitRatio, minWidth: 0 } : undefined}>
          <div className="p-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex justify-between items-center">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Round {selectedRound} Pairings</h3>
            <div className="flex gap-1 print:hidden items-center flex-wrap">
              {isCurrentRound && tournament.status === 'active' && roundMatches.length > 0 && !tournament.isTeamTournament && (
                <Button
                  variant={swapMode ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setSwapMode(!swapMode);
                    setSelectedForSwap(null);
                  }}
                  className="gap-1"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5" />
                  <span className="hidden xl:inline text-xs">
                    {swapMode ? 'Cancel' : 'Swap'}
                  </span>
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-1 hidden lg:flex">
                <Printer className="w-3.5 h-3.5" />
                <span className="hidden xl:inline text-xs">Print</span>
              </Button>
              <Button variant="outline" size="sm" onClick={printScoreSheets} className="gap-1 hidden xl:flex">
                <FileText className="w-3.5 h-3.5" />
                <span className="hidden xl:inline text-xs">Sheets</span>
              </Button>
              <Button 
                variant={splitView ? "default" : "outline"} 
                size="sm"
                onClick={() => setSplitView(!splitView)} 
                className="gap-1"
                title="Toggle Split View"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
              </Button>
{isCurrentRound && (
                <Button variant="outline" size="sm" onClick={handleRollback} className="gap-1 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20">
                  <Undo2 className="w-3.5 h-3.5" />
                  <span className="hidden lg:inline text-xs">Rollback</span>
                </Button>
              )}
              {isCurrentRound && tournament.status === 'active' && roundMatches.length > 0 && (
                <Button 
                  onClick={handleGenerateNextRound} 
                  disabled={!allResultsEntered}
                  size="sm"
                  className="relative"
                >
                  <span className="hidden lg:inline text-xs">Complete Round</span>
                  <span className="lg:hidden text-xs">Next</span>
                  {!allResultsEntered && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] w-4 h-4 flex items-center justify-center rounded-full border border-white dark:border-slate-800 font-bold">
                      {missingResults}
                    </span>
                  )}
                </Button>
              )}
            </div>
          </div>
          
          {swapMode && (
            <div className="bg-blue-50 dark:bg-blue-900/20 p-2 text-xs text-blue-800 dark:text-blue-200 border-b border-blue-100 dark:border-blue-800 text-center print:hidden">
              {selectedForSwap ? 'Select the second player to swap with.' : 'Select the first player to swap.'}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-600 dark:text-slate-400 font-medium border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="px-3 py-2 w-12 text-center">Board</th>
                  <th className="px-3 py-2 text-right w-1/3">White</th>
                  <th className="px-3 py-2 text-center">Result</th>
                  <th className="px-3 py-2 w-1/3">Black</th>
                  <th className="px-3 py-2 text-center w-10 print:hidden"></th>
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
                            <div className="flex items-center justify-center gap-4">
                              <span className="flex-1 text-right">{teamWhite}</span>
                              <span className="bg-slate-200 dark:bg-slate-700 px-3 py-1 rounded-full text-sm font-black tabular-nums border border-slate-300 dark:border-slate-600">
                                {getTeamMatchScore(matches)}
                              </span>
                              <span className="flex-1 text-left">{teamBlack}</span>
                            </div>
                          </td>
                        </tr>
                        {matches.map(renderMatchRow)}
                      </React.Fragment>
                    );
                  })
                ) : (
                  displayRoundMatches.map(renderMatchRow)
                )}
                {displayRoundMatches.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-slate-500 dark:text-slate-400">No pairings generated for this round.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>


        </div>

        {splitView && (
          <>
            <div
              onMouseDown={handleMouseDown}
              className="hidden xl:flex w-5 flex-shrink-0 cursor-col-resize items-center justify-center group"
            >
              <div className="w-0.5 h-10 rounded-full bg-slate-300 dark:bg-slate-600 group-hover:bg-blue-400 dark:group-hover:bg-blue-500 transition-colors" />
            </div>
            <div className="hidden xl:block w-full print:hidden" style={{ flex: 1 - splitRatio, minWidth: 0 }}>
              <div className="flex justify-between items-end mb-2 px-2">
                <div className="flex items-center gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">Standings</h3>
                    <p className="text-xs text-slate-500">Updates as results are entered</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setLiveStandings(true)}
                      className={`px-1.5 py-0.5 text-[10px] rounded transition-colors ${liveStandings ? 'bg-blue-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
                    >
                      Live
                    </button>
                    <button
                      onClick={() => setLiveStandings(false)}
                      className={`px-1.5 py-0.5 text-[10px] rounded transition-colors ${!liveStandings ? 'bg-blue-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
                    >
                      After Round
                    </button>
                  </div>
                  <button
                    onClick={() => setShowWarnings(!showWarnings)}
                    className={`p-1.5 rounded-md border transition-colors ${showWarnings ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border-amber-200 dark:border-amber-800' : 'bg-white dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700'}`}
                    title={showWarnings ? "Hide Warnings" : "Show Warnings"}
                  >
                    <AlertTriangle className={`w-3.5 h-3.5 ${showWarnings ? 'text-amber-500' : 'text-slate-400'}`} />
                  </button>
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
                showWarnings={showWarnings}
              />
            </div>
          </>
        )}
      </div>

      {selectedPlayerId && (
        <PlayerProfileModal 
          playerId={selectedPlayerId} 
          onClose={() => setSelectedPlayerId(null)} 
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
