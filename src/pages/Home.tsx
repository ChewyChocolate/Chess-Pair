import React, { useState } from 'react';
import { useTournamentStore, TiebreakType, TIEBREAK_LABELS } from '../store/useTournamentStore';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useNavigate } from 'react-router-dom';
import { Trophy, Calendar, Trash2, ArrowUp, ArrowDown, X, Plus } from 'lucide-react';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';

export function Home() {
  const { tournaments, setActiveTournament, createTournament, deleteTournament } = useTournamentStore();
  const [name, setName] = useState('');
  const [section, setSection] = useState('');
  const [type, setType] = useState<'swiss' | 'round-robin' | 'knockout'>('swiss');
  const [isTeamTournament, setIsTeamTournament] = useState(false);
  const [rounds, setRounds] = useState(5);
  const [timeControl, setTimeControl] = useState('');
  const [ptsW, setPtsW] = useState(1);
  const [ptsD, setPtsD] = useState(0.5);
  const [ptsL, setPtsL] = useState(0);
  const [avoidClub, setAvoidClub] = useState(false);
  const [autoCalcRounds, setAutoCalcRounds] = useState(true);
  const [manualOverride, setManualOverride] = useState(false);
  const [tiebreakOrder, setTiebreakOrder] = useState<TiebreakType[]>(['direct-encounter', 'buchholz', 'median-buchholz', 'sonneborn-berger', 'most-wins', 'rating']);
  const [dialogConfig, setDialogConfig] = useState<{ isOpen: boolean, title?: string, message: string, isAlert?: boolean, onConfirm: () => void } | null>(null);
  const navigate = useNavigate();

  const handleCreate = () => {
    if (name) {
      createTournament(name, type, isTeamTournament, rounds, timeControl, { w: ptsW, d: ptsD, l: ptsL }, avoidClub, autoCalcRounds, manualOverride, section, tiebreakOrder);
      navigate('/dashboard');
    }
  };

  const moveTiebreak = (index: number, direction: 'up' | 'down') => {
    const newOrder = [...tiebreakOrder];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newOrder.length) return;
    
    const temp = newOrder[index];
    newOrder[index] = newOrder[targetIndex];
    newOrder[targetIndex] = temp;
    setTiebreakOrder(newOrder);
  };

  const removeTiebreak = (index: number) => {
    setTiebreakOrder(tiebreakOrder.filter((_, i) => i !== index));
  };

  const addTiebreak = (type: TiebreakType) => {
    if (!tiebreakOrder.includes(type)) {
      setTiebreakOrder([...tiebreakOrder, type]);
    }
  };

  const availableTiebreaks = (Object.keys(TIEBREAK_LABELS) as TiebreakType[]).filter(
    tb => !tiebreakOrder.includes(tb)
  );

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Tournaments</h2>
      </div>

      {tournaments && tournaments.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tournaments.map(t => (
            <div key={t.id} className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white truncate pr-2">{t.name}</h3>
                  {t.section && <p className="text-xs font-medium text-blue-600 dark:text-blue-400">{t.section}</p>}
                </div>
                <Button variant="ghost" size="icon" onClick={() => {
                  setDialogConfig({
                    isOpen: true,
                    title: 'Delete Tournament',
                    message: 'Are you sure you want to delete this tournament? This action cannot be undone.',
                    onConfirm: () => deleteTournament(t.id)
                  });
                }} className="text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 flex-shrink-0">
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
              <div className="text-sm text-slate-500 dark:text-slate-400 space-y-1 mb-6 flex-1">
                <p className="capitalize">Format: {t.isTeamTournament ? 'Team' : 'Individual'} {t.type}</p>
                <p>Status: {t.status}</p>
                <p>Players: {t.players.length}</p>
                <p>Round: {t.currentRound} / {t.status === 'setup' && (t.type === 'knockout' || t.type === 'round-robin' || t.autoCalculateRounds) ? 'TBD' : t.totalRounds}</p>
              </div>
              <Button onClick={() => {
                setActiveTournament(t.id);
                navigate('/dashboard');
              }} className="w-full">
                Open Tournament
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white dark:bg-slate-800 p-8 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 max-w-2xl">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">Create New Tournament</h2>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Tournament Name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Spring Open 2024" className="dark:bg-slate-900 dark:border-slate-700 dark:text-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Section (Optional)</label>
              <Input value={section} onChange={(e) => setSection(e.target.value)} placeholder="e.g. Open, U1600" className="dark:bg-slate-900 dark:border-slate-700 dark:text-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Format</label>
              <select 
                className="flex h-10 w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 dark:text-white"
                value={isTeamTournament ? 'team' : 'individual'}
                onChange={(e) => setIsTeamTournament(e.target.value === 'team')}
              >
                <option value="individual">Individual</option>
                <option value="team">Team</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Pairing System</label>
              <select 
                className="flex h-10 w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 dark:text-white"
                value={type}
                onChange={(e) => setType(e.target.value as any)}
              >
                <option value="swiss">Swiss System</option>
                <option value="round-robin">Round Robin</option>
                <option value="knockout">Knockout (Single Elimination)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Number of Rounds</label>
              <div className="flex gap-2">
                <Input 
                  type="number" 
                  min={1} 
                  max={20} 
                  value={rounds} 
                  onChange={(e) => setRounds(parseInt(e.target.value))} 
                  disabled={(type === 'knockout' || type === 'round-robin' || (type === 'swiss' && autoCalcRounds)) && !manualOverride}
                  className="dark:bg-slate-900 dark:border-slate-700 dark:text-white flex-1" 
                />
                {type === 'swiss' && (
                  <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                    <input type="checkbox" checked={autoCalcRounds} onChange={(e) => setAutoCalcRounds(e.target.checked)} className="rounded border-slate-300" />
                    Auto
                  </label>
                )}
                {(type === 'knockout' || type === 'round-robin') && (
                  <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                    <input type="checkbox" checked={manualOverride} onChange={(e) => setManualOverride(e.target.checked)} className="rounded border-slate-300" />
                    Override
                  </label>
                )}
              </div>
              {(type === 'knockout' || type === 'round-robin' || (type === 'swiss' && autoCalcRounds)) && !manualOverride && (
                <p className="text-[10px] text-slate-500 mt-1">Calculated automatically on start</p>
              )}
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Time Control (Optional)</label>
              <Input value={timeControl} onChange={(e) => setTimeControl(e.target.value)} placeholder="e.g. 10+5 Blitz" className="dark:bg-slate-900 dark:border-slate-700 dark:text-white" />
            </div>
          </div>
          
          <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Advanced Settings</h3>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Pts for Win</label>
                <Input type="number" step="0.5" value={ptsW} onChange={(e) => setPtsW(parseFloat(e.target.value))} className="dark:bg-slate-900 dark:border-slate-700 dark:text-white" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Pts for Draw</label>
                <Input type="number" step="0.5" value={ptsD} onChange={(e) => setPtsD(parseFloat(e.target.value))} className="dark:bg-slate-900 dark:border-slate-700 dark:text-white" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Pts for Loss</label>
                <Input type="number" step="0.5" value={ptsL} onChange={(e) => setPtsL(parseFloat(e.target.value))} className="dark:bg-slate-900 dark:border-slate-700 dark:text-white" />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input type="checkbox" checked={avoidClub} onChange={(e) => setAvoidClub(e.target.checked)} className="rounded border-slate-300" />
              Avoid pairing players from the same club
            </label>

            <div className="mt-6">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Tiebreak Order</h3>
              <p className="text-xs text-slate-500 mb-3">Set priority (top is highest). At least one tiebreak is recommended.</p>
              <div className="space-y-2 mb-4">
                {tiebreakOrder.map((tb, index) => (
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
                        disabled={index === tiebreakOrder.length - 1}
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
                {tiebreakOrder.length === 0 && (
                  <p className="text-xs text-slate-500 italic py-2">No tiebreaks selected. Players with equal scores will be ranked alphabetically.</p>
                )}
              </div>

              {availableTiebreaks.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {availableTiebreaks.map(tb => (
                    <Button 
                      key={tb} 
                      variant="outline" 
                      size="sm" 
                      onClick={() => addTiebreak(tb)}
                      className="text-[10px] h-7 gap-1 px-2"
                    >
                      <Plus className="w-3 h-3" />
                      {TIEBREAK_LABELS[tb]}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <Button className="w-full mt-4" onClick={handleCreate} disabled={!name}>
            Create Tournament
          </Button>
        </div>
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
    </div>
  );
}
