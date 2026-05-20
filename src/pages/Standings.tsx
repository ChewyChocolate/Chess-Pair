import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTournamentStore, TiebreakType, TIEBREAK_LABELS } from '../store/useTournamentStore';
import { calculateStandings, calculateTeamStandings } from '../lib/tiebreaks';
import { getPlayerStats } from '../lib/playerStats';
import { Button } from '../components/ui/Button';
import { Download, AlertTriangle, Users, FileText, Settings, ArrowUp, ArrowDown, X, Plus } from 'lucide-react';
import { PlayerProfileModal } from '../components/PlayerProfileModal';
import jsPDF from 'jspdf';
import { applyPlugin } from 'jspdf-autotable';
applyPlugin(jsPDF);

interface StandingsTableProps {
  tournament: any;
  standings: any[];
  compact?: boolean;
  showWarnings?: boolean;
  onPlayerClick?: (playerId: string) => void;
}

export function StandingsTable({ tournament, standings, onPlayerClick, compact, showWarnings = true }: StandingsTableProps) {
  return (
    <div className={`bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-x-auto ${compact ? 'text-xs' : 'text-sm'}`}>
      <table className="w-full text-left whitespace-nowrap">
        <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-600 dark:text-slate-400 font-medium border-b border-slate-200 dark:border-slate-700">
          <tr>
            <th className={`py-3 text-center ${compact ? 'px-2' : 'px-6'}`}>#</th>
            <th className={`py-3 ${compact ? 'px-2' : 'px-6'}`}>Name</th>
            <th className={`py-3 text-center ${compact ? 'px-2' : 'px-6'}`}>Rtg</th>
            <th className={`py-3 text-center ${compact ? 'px-2' : 'px-6'}`}>Pts</th>
            {!compact && tournament.tiebreakOrder.map((tb: TiebreakType) => (
              <th key={tb} className="px-6 py-3 text-center" title={TIEBREAK_LABELS[tb]}>
                {tb === 'direct-encounter' ? 'DE' :
                  tb === 'buchholz' ? 'BH' :
                    tb === 'median-buchholz' ? 'MBH' :
                      tb === 'sonneborn-berger' ? 'SB' :
                        tb === 'most-wins' ? 'MW' : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
          {standings.map((player, index) => {
            const stats = getPlayerStats(tournament, player.id);
            const hasColorWarning = stats?.hasColorWarning || false;
            const hasByeWarning = stats?.hasByeWarning || false;

            return (
              <tr key={player.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td className={`py-3 text-center font-medium text-slate-500 dark:text-slate-400 ${compact ? 'px-2' : 'px-6'}`}>{index + 1}</td>
                <td className={`py-3 ${compact ? 'px-2' : 'px-6'}`}>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => onPlayerClick && onPlayerClick(player.id)}
                      className="font-medium text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 hover:underline text-left truncate max-w-[150px] md:max-w-[200px]"
                    >
                      {player.name}
                    </button>
                    {showWarnings && hasColorWarning && (
                      <span title={`Color warning: ${stats.consecutiveColors} ${stats.lastColor} in a row`}>
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                      </span>
                    )}
                    {showWarnings && hasByeWarning && (
                      <span title={`Bye warning: received ${stats.byeCount} byes`}>
                        <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                      </span>
                    )}
                  </div>
                </td>
                <td className={`py-3 text-center text-slate-500 dark:text-slate-400 ${compact ? 'px-2' : 'px-6'}`}>{player.rating ?? '-'}</td>
                <td className={`py-3 text-center font-bold text-slate-900 dark:text-white ${compact ? 'px-2' : 'px-6'}`}>{player.score}</td>
                {!compact && tournament.tiebreakOrder.map((tb: TiebreakType) => (
                  <td key={tb} className="px-6 py-3 text-center text-slate-500 dark:text-slate-400">
                    {tb === 'direct-encounter' ? '-' :
                      tb === 'buchholz' ? player.buchholz :
                        tb === 'median-buchholz' ? player.medianBuchholz :
                          tb === 'sonneborn-berger' ? player.sonnebornBerger :
                      tb === 'most-wins' ? player.mostWins : ''}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function Standings() {
  const tournaments = useTournamentStore(s => s.tournaments);
  const activeId = useTournamentStore(s => s.activeTournamentId);
  const updateTournament = useTournamentStore(s => s.updateTournament);
  const tournament = tournaments?.find(t => t.id === activeId);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [showTiebreakSettings, setShowTiebreakSettings] = useState(false);
  const [viewRound, setViewRound] = useState<number | null>(null);
  const [showWarnings, setShowWarnings] = useState(true);
  const [showPdfOptions, setShowPdfOptions] = useState(false);
  const [pdfIncludeRating, setPdfIncludeRating] = useState(true);
  const [pdfIncludeClub, setPdfIncludeClub] = useState(true);
  const pdfOptionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showPdfOptions) return;
    const handler = (e: MouseEvent) => {
      if (pdfOptionsRef.current && !pdfOptionsRef.current.contains(e.target as Node)) {
        setShowPdfOptions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPdfOptions]);

  const displayedRound = viewRound !== null
    ? viewRound
    : (tournament?.status === 'completed' ? tournament.totalRounds : tournament?.currentRound || 0);

  const standings = useMemo(() => {
    if (!tournament) return [];
    return calculateStandings(tournament, displayedRound);
  }, [tournament, displayedRound]);

  const teamStandings = useMemo(() => {
    if (!tournament || !tournament.isTeamTournament) return [];
    return calculateTeamStandings(tournament, displayedRound);
  }, [tournament, displayedRound]);

  if (!tournament) {
    return <div className="text-center text-slate-500 mt-10">Please create a tournament first.</div>;
  }

  const moveTiebreak = (index: number, direction: 'up' | 'down') => {
    const newOrder = [...tournament.tiebreakOrder];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newOrder.length) return;

    const temp = newOrder[index];
    newOrder[index] = newOrder[targetIndex];
    newOrder[targetIndex] = temp;
    updateTournament(tournament.id, { tiebreakOrder: newOrder });
  };

  const removeTiebreak = (index: number) => {
    const newOrder = tournament.tiebreakOrder.filter((_, i) => i !== index);
    updateTournament(tournament.id, { tiebreakOrder: newOrder });
  };

  const addTiebreak = (type: TiebreakType) => {
    if (!tournament.tiebreakOrder.includes(type)) {
      const newOrder = [...tournament.tiebreakOrder, type];
      updateTournament(tournament.id, { tiebreakOrder: newOrder });
    }
  };

  const availableTiebreaks = (Object.keys(TIEBREAK_LABELS) as TiebreakType[]).filter(
    tb => !tournament.tiebreakOrder.includes(tb)
  );

  const exportCSV = () => {
    // ... (keep existing export logic for players, maybe add team export later)
    const headers = ['Rank', 'Name', 'Title', 'Rating', 'Club', 'Points', 'Buchholz', 'Median-Buchholz', 'Sonneborn-Berger', 'Most Wins'];
    const rows = standings.map((p, i) => [
      i + 1,
      p.name,
      p.title || '',
      p.rating || '',
      p.club || '',
      p.score,
      p.buchholz,
      p.medianBuchholz,
      p.sonnebornBerger,
      p.mostWins
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.map(v => `"${v}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${tournament.name.replace(/\s+/g, '_')}_standings.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    const title = `${tournament.name} - Standings`;
    const subTitle = tournament.section ? `Section: ${tournament.section}` : '';
    const roundInfo = `Round ${displayedRound}`;

    doc.setFontSize(18);
    doc.text(title, 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);
    if (subTitle) doc.text(subTitle, 14, 30);
    doc.text(roundInfo, 14, subTitle ? 36 : 30);

    const headers = ['Rank', 'Name'];
    if (pdfIncludeRating) headers.push('Rating');
    if (pdfIncludeClub) headers.push('Club');
    headers.push('Pts', 'BH', 'MBH', 'SB', 'MW');

    const tableData = standings.map((p, i) => {
      const row: any[] = [i + 1, p.name];
      if (pdfIncludeRating) row.push(p.rating || '');
      if (pdfIncludeClub) row.push(p.club || '');
      row.push(p.score, p.buchholz, p.medianBuchholz, p.sonnebornBerger, p.mostWins);
      return row;
    });

    // Build column styles dynamically based on which optional columns are included
    let colOffset = 2; // Rank + Name always present
    const colStyles: Record<number, any> = {
      0: { cellWidth: 12, halign: 'center' },
    };
    if (pdfIncludeRating) colOffset++;
    if (pdfIncludeClub) colOffset++;
    // Points column
    colStyles[colOffset] = { fontStyle: 'bold', halign: 'center' };
    colStyles[colOffset + 1] = { halign: 'center' };
    colStyles[colOffset + 2] = { halign: 'center' };
    colStyles[colOffset + 3] = { halign: 'center' };
    colStyles[colOffset + 4] = { halign: 'center' };

    (doc as any).autoTable({
      startY: subTitle ? 42 : 36,
      head: [headers],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [51, 65, 85] },
      styles: { fontSize: 9 },
      columnStyles: colStyles,
    });

    if (tournament.isTeamTournament && teamStandings.length > 0) {
      doc.addPage();
      doc.setFontSize(18);
      doc.text(`${tournament.name} - Team Standings`, 14, 22);

      const teamData = teamStandings.map((t, i) => [
        i + 1,
        t.name,
        t.matchPoints,
        t.gamePoints,
        t.sonnebornBerger
      ]);

      (doc as any).autoTable({
        startY: 30,
        head: [['Rank', 'Team', 'Match Pts', 'Game Pts', 'SB']],
        body: teamData,
        theme: 'grid',
        headStyles: { fillColor: [51, 65, 85] },
        styles: { fontSize: 10 },
        columnStyles: {
          0: { cellWidth: 15, halign: 'center' },
          2: { fontStyle: 'bold', halign: 'center' },
          3: { halign: 'center' },
          4: { halign: 'center' },
        }
      });
    }

    doc.save(`${tournament.name.replace(/\s+/g, '_')}_standings.pdf`);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Standings</h2>
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 mt-1">
            <span>After Round</span>
            <select
              value={displayedRound}
              onChange={(e) => setViewRound(Number(e.target.value))}
              className="bg-transparent border-b border-slate-300 dark:border-slate-600 focus:outline-none focus:border-blue-500 font-medium text-slate-900 dark:text-white pb-0.5"
            >
              <option value={0} className="bg-white dark:bg-slate-900">0 (Start)</option>
              {Array.from({ length: tournament.status === 'completed' ? tournament.totalRounds : tournament.currentRound }, (_, i) => i + 1).map(r => (
                <option key={r} value={r} className="bg-white dark:bg-slate-900">{r}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShowWarnings(!showWarnings)}
            className={`gap-2 ${showWarnings ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border-amber-200 dark:border-amber-800' : ''}`}
          >
            <AlertTriangle className={`w-4 h-4 ${showWarnings ? 'text-amber-500' : 'text-slate-400'}`} />
            <span className="hidden sm:inline">Warnings</span>
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowTiebreakSettings(!showTiebreakSettings)}
            className={`gap-2 ${showTiebreakSettings ? 'bg-slate-100 dark:bg-slate-800' : ''}`}
          >
            <Settings className="w-4 h-4" />
            Tiebreaks
          </Button>
          <Button variant="outline" onClick={exportCSV} className="gap-2">
            <Download className="w-4 h-4" />
            Export CSV
          </Button>
          <div className="relative" ref={pdfOptionsRef}>
            <Button variant="outline" onClick={() => setShowPdfOptions(v => !v)} className="gap-2">
              <FileText className="w-4 h-4" />
              Export PDF
            </Button>
            {showPdfOptions && (
              <div className="absolute right-0 mt-2 w-52 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg z-50 p-4 space-y-3">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">PDF Columns</p>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pdfIncludeRating}
                    onChange={e => setPdfIncludeRating(e.target.checked)}
                    className="rounded border-slate-300 dark:border-slate-600 text-blue-600"
                  />
                  <span className="text-sm text-slate-700 dark:text-slate-300">Include Rating</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={pdfIncludeClub}
                    onChange={e => setPdfIncludeClub(e.target.checked)}
                    className="rounded border-slate-300 dark:border-slate-600 text-blue-600"
                  />
                  <span className="text-sm text-slate-700 dark:text-slate-300">Include Club</span>
                </label>
                <Button
                  className="w-full gap-2"
                  onClick={() => { exportPDF(); setShowPdfOptions(false); }}
                >
                  <FileText className="w-4 h-4" />
                  Download PDF
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {showTiebreakSettings && (
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Tiebreak Settings</h3>
            <Button variant="ghost" size="icon" onClick={() => setShowTiebreakSettings(false)}>
              <X className="w-4 h-4" />
            </Button>
          </div>
          <p className="text-sm text-slate-500 mb-4">Adjust the order of tiebreaks for this tournament. Rankings will update instantly.</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Current Order (Priority)</h4>
              <div className="space-y-2">
                {tournament.tiebreakOrder.map((tb, index) => (
                  <div key={tb} className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-md">
                    <span className="text-sm text-slate-700 dark:text-slate-300">{index + 1}. {TIEBREAK_LABELS[tb]}</span>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => moveTiebreak(index, 'up')}
                        disabled={index === 0}
                      >
                        <ArrowUp className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => moveTiebreak(index, 'down')}
                        disabled={index === tournament.tiebreakOrder.length - 1}
                      >
                        <ArrowDown className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                        onClick={() => removeTiebreak(index)}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))}
                {tournament.tiebreakOrder.length === 0 && (
                  <p className="text-sm text-slate-500 italic py-2">No tiebreaks selected.</p>
                )}
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Available Tiebreaks</h4>
              <div className="flex flex-wrap gap-2">
                {availableTiebreaks.map(tb => (
                  <Button
                    key={tb}
                    variant="outline"
                    size="sm"
                    onClick={() => addTiebreak(tb)}
                    className="gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    {TIEBREAK_LABELS[tb]}
                  </Button>
                ))}
                {availableTiebreaks.length === 0 && (
                  <p className="text-sm text-slate-500 italic py-2">All available tiebreaks are in use.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {tournament.isTeamTournament && (
        <div className="mb-8">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-500" />
            Team Standings
          </h3>
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-600 dark:text-slate-400 font-medium border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="px-6 py-3 w-16 text-center">Rank</th>
                  <th className="px-6 py-3">Team</th>
                  <th className="px-6 py-3 text-center">Match Points</th>
                  <th className="px-6 py-3 text-center">Game Points</th>
                  <th className="px-6 py-3 text-center">SB</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {teamStandings.map((team, index) => (
                  <tr key={team.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-6 py-4 text-center font-medium text-slate-500 dark:text-slate-400">{index + 1}</td>
                    <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">{team.name}</td>
                    <td className="px-6 py-4 text-center font-bold text-blue-600 dark:text-blue-400">{team.matchPoints}</td>
                    <td className="px-6 py-4 text-center text-slate-500 dark:text-slate-400">{team.gamePoints}</td>
                    <td className="px-6 py-4 text-center text-slate-500 dark:text-slate-400">{team.sonnebornBerger}</td>
                  </tr>
                ))}
                {teamStandings.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-slate-500 dark:text-slate-400">No teams in tournament.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div>
        {tournament.isTeamTournament && (
          <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Individual Standings (Board Prizes)</h3>
        )}
        <StandingsTable
          tournament={tournament}
          standings={standings}
          onPlayerClick={setSelectedPlayerId}
          showWarnings={showWarnings}
        />
      </div>

      {selectedPlayerId && (
        <PlayerProfileModal
          playerId={selectedPlayerId}
          onClose={() => setSelectedPlayerId(null)}
        />
      )}
    </div>
  );
}
