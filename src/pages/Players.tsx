import React, { useState, useRef } from 'react';
import { useTournamentStore } from '../store/useTournamentStore';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Trash2, Upload, Download, UserMinus, UserCheck, X } from 'lucide-react';

import { ConfirmDialog } from '../components/ui/ConfirmDialog';

export function Players() {
  const tournaments = useTournamentStore(s => s.tournaments);
  const activeId = useTournamentStore(s => s.activeTournamentId);
  const tournament = tournaments?.find(t => t.id === activeId);
  const { addPlayer, bulkAddPlayers, removePlayer, clearPlayers, updatePlayer, withdrawPlayer, rejoinPlayer } = useTournamentStore();
  const [name, setName] = useState('');
  const [rating, setRating] = useState('');
  const [title, setTitle] = useState('');
  const [club, setClub] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [dialogConfig, setDialogConfig] = useState<{ isOpen: boolean, title?: string, message: string, isAlert?: boolean, onConfirm: () => void } | null>(null);

  if (!tournament) {
    return <div className="text-center text-slate-500 mt-10 dark:text-slate-400">Please create a tournament first.</div>;
  }

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    
    // For late entries, we might want to automatically add half-point byes for missed rounds
    const requestedByes = [];
    if (tournament.status === 'active' && tournament.currentRound > 1) {
      for (let i = 1; i < tournament.currentRound; i++) {
        requestedByes.push(i);
      }
    }

    const performAdd = () => {
      addPlayer({
        name: name.trim(),
        rating: rating ? parseInt(rating) : undefined,
        title: title.trim() || undefined,
        club: club.trim() || undefined,
      });
      
      setName('');
      setRating('');
      setTitle('');
      setClub('');
    };

    if (tournament.status === 'active') {
      setDialogConfig({
        isOpen: true,
        title: 'Late Entry',
        message: `Add ${name} as a late entry? They will receive requested byes for missed rounds.`,
        onConfirm: performAdd
      });
    } else {
      performAdd();
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      const lines = text.split('\n');
      const playersToBulkAdd: any[] = [];
      
      const startIndex = lines[0].toLowerCase().includes('name') ? 1 : 0;

      for (let i = startIndex; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const parts = line.split(',').map(p => p.trim().replace(/^"|"$/g, ''));
        if (parts.length > 0 && parts[0]) {
          playersToBulkAdd.push({
            name: parts[0],
            rating: parts[1] && !isNaN(parseInt(parts[1])) ? parseInt(parts[1]) : undefined,
            title: parts[2] || undefined,
            club: parts[3] || undefined,
          });
        }
      }
      
      bulkAddPlayers(playersToBulkAdd);
      setDialogConfig({
        isOpen: true,
        title: 'Import Successful',
        message: `Successfully imported ${playersToBulkAdd.length} players.`,
        isAlert: true,
        onConfirm: () => {}
      });
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const toggleWithdrawal = (id: string, currentlyWithdrawn: boolean) => {
    if (currentlyWithdrawn) {
      setDialogConfig({
        isOpen: true,
        title: 'Rejoin Tournament',
        message: 'Allow this player to rejoin the tournament? They will be included in future pairings.',
        onConfirm: () => rejoinPlayer(id)
      });
    } else {
      setDialogConfig({
        isOpen: true,
        title: 'Withdraw Player',
        message: 'Withdraw this player from the tournament? They will no longer be paired.',
        onConfirm: () => withdrawPlayer(id)
      });
    }
  };

  const handleExportCsv = () => {
    const headers = ['Name', 'Rating', 'Title', 'Club', 'Status', 'Requested Byes'];
    const rows = tournament.players.map(p => [
      p.name,
      p.rating ?? '',
      p.title ?? '',
      p.club ?? '',
      p.withdrawn ? 'Withdrawn' : p.active ? 'Active' : 'Inactive',
      (p.requestedByes ?? []).join(';'),
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${tournament.name.replace(/\s+/g, '_')}_players.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleRequestedByes = (id: string, val: string) => {
    const byes = val.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
    updatePlayer(id, { requestedByes: byes });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Players</h2>
        <div className="flex gap-2">
            <Button variant="outline" onClick={handleExportCsv} className="gap-2">
              <Download className="w-4 h-4" />
              Export CSV
            </Button>
            {tournament.status !== 'completed' && (
              <>
                <input 
                  type="file" 
                  accept=".csv" 
                  className="hidden" 
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                />
                <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="gap-2">
                  <Upload className="w-4 h-4" />
                  Bulk Import CSV
                </Button>
                {tournament.players.length > 0 && (
                  <Button
                    variant="outline"
                    disabled={tournament.status !== 'setup'}
                    onClick={() => setDialogConfig({
                      isOpen: true,
                      title: 'Clear All Players',
                      message: `Remove all ${tournament.players.length} players? This cannot be undone.`,
                      onConfirm: clearPlayers,
                    })}
                    className="gap-2 text-red-500 hover:text-red-600 border-red-200 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-900/20 disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none"
                  >
                    <X className="w-4 h-4" />
                    Clear All
                  </Button>
                )}
              </>
            )}
          </div>
      </div>

      {tournament.status !== 'completed' && (
        <form onSubmit={handleAdd} className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              {tournament.status === 'active' ? 'Late Entry Name *' : 'Name *'}
            </label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Player Name" required className="dark:bg-slate-900 dark:border-slate-700 dark:text-white" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Rating</label>
            <Input type="number" value={rating} onChange={(e) => setRating(e.target.value)} placeholder="e.g. 1500" className="dark:bg-slate-900 dark:border-slate-700 dark:text-white" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Title/Club</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. FM / Chess Club" className="dark:bg-slate-900 dark:border-slate-700 dark:text-white" />
          </div>
          <Button type="submit" className="w-full">
            {tournament.status === 'active' ? 'Add Late Entry' : 'Add Player'}
          </Button>
        </form>
      )}

      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-600 dark:text-slate-400 font-medium border-b border-slate-200 dark:border-slate-700">
            <tr>
              <th className="px-6 py-3">#</th>
              <th className="px-6 py-3">Name</th>
              <th className="px-6 py-3">Rating</th>
              <th className="px-6 py-3">Status</th>
              <th className="px-6 py-3">Req. Byes (Rounds)</th>
              <th className="px-6 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
            {tournament.players.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-slate-500 dark:text-slate-400">No players added yet.</td>
              </tr>
            ) : (
              tournament.players.map((player, index) => (
                <tr key={player.id} className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 ${(!player.active || player.withdrawn) ? 'opacity-50' : ''}`}>
                  <td className="px-6 py-4 text-slate-500 dark:text-slate-400">{index + 1}</td>
                  <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">
                    {player.title && <span className="text-slate-500 mr-1">{player.title}</span>}
                    {player.name}
                    {player.club && <span className="text-slate-500 ml-2 text-xs">({player.club})</span>}
                  </td>
                  <td className="px-6 py-4 text-slate-500 dark:text-slate-400">{player.rating || 'Unrated'}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${(!player.withdrawn && player.active) ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300'}`}>
                      {player.withdrawn ? 'Withdrawn' : player.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <input 
                      type="text" 
                      placeholder="e.g. 1, 3" 
                      defaultValue={player.requestedByes?.join(', ') || ''}
                      onBlur={(e) => handleRequestedByes(player.id, e.target.value)}
                      className="w-24 h-8 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 dark:text-white"
                    />
                  </td>
                  <td className="px-6 py-4 text-right flex justify-end gap-2">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => toggleWithdrawal(player.id, player.withdrawn)} 
                      title={player.withdrawn ? "Rejoin Tournament" : "Withdraw Player"}
                      className="text-slate-500 hover:text-slate-900 dark:hover:text-white"
                    >
                      {player.withdrawn ? <UserCheck className="w-4 h-4" /> : <UserMinus className="w-4 h-4" />}
                    </Button>
                    {tournament.status === 'setup' && (
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => {
                          setDialogConfig({
                            isOpen: true,
                            title: 'Delete Player',
                            message: 'Are you sure you want to remove this player?',
                            onConfirm: () => removePlayer(player.id)
                          });
                        }} 
                        className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
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
