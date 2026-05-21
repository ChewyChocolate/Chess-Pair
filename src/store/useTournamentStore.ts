import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';

export type Player = {
  id: string;
  name: string;
  rating?: number;
  title?: string;
  club?: string;
  active: boolean;
  withdrawn: boolean;
  requestedByes: number[];
  penaltyPoints?: number;
  pairingNumber?: number;
};

export type Team = {
  id: string;
  name: string;
  playerIds: string[];
};

export type MatchResult = '1-0' | '0-1' | '0.5-0.5' | 'bye' | 'forfeit-white' | 'forfeit-black' | null;

export type Match = {
  id: string;
  round: number;
  whiteId: string | null;
  blackId: string | null;
  result: MatchResult;
  boardNumber?: number;
  teamMatchId?: string;
  isManual?: boolean;
  pgn?: string;
};

export type ForcedPairing = {
  whiteId: string;
  blackId: string;
};

export type TournamentType = 'swiss' | 'round-robin' | 'knockout';

export type TiebreakType = 'direct-encounter' | 'buchholz' | 'median-buchholz' | 'sonneborn-berger' | 'most-wins';

export const TIEBREAK_LABELS: Record<TiebreakType, string> = {
  'direct-encounter': 'Direct Encounter',
  'buchholz': 'Buchholz',
  'median-buchholz': 'Median-Buchholz',
  'sonneborn-berger': 'Sonneborn-Berger',
  'most-wins': 'Most Wins'
};

export type Tournament = {
  id: string;
  name: string;
  section?: string;
  type: TournamentType;
  isTeamTournament: boolean;
  autoCalculateRounds: boolean;
  manualRoundOverride: boolean;
  timeControl?: string;
  status: 'setup' | 'active' | 'completed';
  currentRound: number;
  totalRounds: number;
  players: Player[];
  teams: Team[];
  matches: Match[];
  pointsForWin: number;
  pointsForDraw: number;
  pointsForLoss: number;
  avoidClubPairings: boolean;
  forcedPairings: ForcedPairing[];
  tiebreakOrder: TiebreakType[];
};

interface TournamentStore {
  tournaments: Tournament[];
  activeTournamentId: string | null;
  setActiveTournament: (id: string | null) => void;
  createTournament: (name: string, type: TournamentType, isTeamTournament: boolean, totalRounds: number, timeControl?: string, pts?: {w:number, d:number, l:number}, avoidClub?: boolean, autoCalcRounds?: boolean, manualOverride?: boolean, section?: string, tiebreakOrder?: TiebreakType[]) => void;
  updateTournament: (id: string, updates: Partial<Tournament>) => void;
  deleteTournament: (id: string) => void;
  
  // Actions on active tournament
  addPlayer: (player: Omit<Player, 'id' | 'active' | 'requestedByes' | 'withdrawn'>) => void;
  bulkAddPlayers: (players: Omit<Player, 'id' | 'active' | 'requestedByes' | 'withdrawn'>[]) => void;
  updatePlayer: (id: string, player: Partial<Player>) => void;
  updatePlayerPairingNumber: (id: string, pairingNumber: number) => void;
  removePlayer: (id: string) => void;
  clearPlayers: () => void;
  withdrawPlayer: (id: string) => void;
  rejoinPlayer: (id: string) => void;
  addTeam: (name: string) => void;
  assignPlayerToTeam: (teamId: string, playerId: string) => void;
  startTournament: () => void;
  generatePairings: (round: number, matches: Match[]) => void;
  updateMatchResult: (matchId: string, result: MatchResult) => void;
  updateMatchPgn: (matchId: string, pgn: string) => void;
  completeRound: () => void;
  rollbackRound: () => void;
  swapPlayers: (matchId1: string, isWhite1: boolean, matchId2: string, isWhite2: boolean) => void;
  addManualMatch: (round: number, whiteId: string | null, blackId: string | null) => void;
  removeManualMatch: (matchId: string) => void;
  addForcedPairing: (whiteId: string, blackId: string) => void;
  removeForcedPairing: (index: number) => void;
  clearForcedPairings: () => void;
}

// Helper to update active tournament
const updateActive = (state: any, updater: (t: Tournament) => Tournament) => {
  if (!state.activeTournamentId) return state;
  return {
    tournaments: state.tournaments.map((t: Tournament) => 
      t.id === state.activeTournamentId ? updater(t) : t
    )
  };
};

export const useTournamentStore = create<TournamentStore>()(
  persist(
    (set) => ({
      tournaments: [],
      activeTournamentId: null,
      
      setActiveTournament: (id) => set({ activeTournamentId: id }),
      
      createTournament: (name, type, isTeamTournament, totalRounds, timeControl, pts = {w:1, d:0.5, l:0}, avoidClub = false, autoCalcRounds = false, manualOverride = false, section, tiebreakOrder = ['direct-encounter', 'buchholz', 'median-buchholz', 'sonneborn-berger', 'most-wins']) =>
        set((state) => {
          const newTournament: Tournament = {
            id: uuidv4(),
            name,
            section,
            type,
            isTeamTournament,
            autoCalculateRounds: autoCalcRounds,
            manualRoundOverride: manualOverride,
            timeControl,
            status: 'setup',
            currentRound: 0,
            totalRounds,
            players: [],
            teams: [],
            matches: [],
            pointsForWin: pts.w,
            pointsForDraw: pts.d,
            pointsForLoss: pts.l,
            avoidClubPairings: avoidClub,
            forcedPairings: [],
            tiebreakOrder,
          };
          return {
            tournaments: [...(state.tournaments || []), newTournament],
            activeTournamentId: newTournament.id,
          };
        }),

      updateTournament: (id, updates) =>
        set((state) => ({
          tournaments: (state.tournaments || []).map(t => t.id === id ? { ...t, ...updates } : t)
        })),
        
      deleteTournament: (id) =>
        set((state) => ({
          tournaments: (state.tournaments || []).filter(t => t.id !== id),
          activeTournamentId: state.activeTournamentId === id ? null : state.activeTournamentId
        })),

      addPlayer: (player) =>
        set((state) => updateActive(state, t => ({
          ...t,
          players: [...t.players, { ...player, id: uuidv4(), active: true, withdrawn: false, requestedByes: [] }]
        }))),

      bulkAddPlayers: (players) =>
        set((state) => updateActive(state, t => ({
          ...t,
          players: [...t.players, ...players.map(p => ({ ...p, id: uuidv4(), active: true, withdrawn: false, requestedByes: [] }))]
        }))),

      updatePlayer: (id, updatedPlayer) =>
        set((state) => updateActive(state, t => ({
          ...t,
          players: t.players.map(p => p.id === id ? { ...p, ...updatedPlayer } : p)
        }))),

      updatePlayerPairingNumber: (id, pairingNumber) =>
        set((state) => updateActive(state, t => ({
          ...t,
          players: t.players.map(p => p.id === id ? { ...p, pairingNumber } : p)
        }))),

      removePlayer: (id) =>
        set((state) => updateActive(state, t => ({
          ...t,
          players: t.players.filter(p => p.id !== id),
          teams: t.teams.map(team => ({
            ...team,
            playerIds: team.playerIds.filter(pid => pid !== id)
          }))
        }))),

      clearPlayers: () =>
        set((state) => updateActive(state, t => ({
          ...t,
          players: []
        }))),

      withdrawPlayer: (id) =>
        set((state) => updateActive(state, t => ({
          ...t,
          players: t.players.map(p => p.id === id ? { ...p, withdrawn: true } : p)
        }))),

      rejoinPlayer: (id) =>
        set((state) => updateActive(state, t => ({
          ...t,
          players: t.players.map(p => p.id === id ? { ...p, withdrawn: false } : p)
        }))),

      addTeam: (name) =>
        set((state) => updateActive(state, t => ({
          ...t,
          teams: [...t.teams, { id: uuidv4(), name, playerIds: [] }]
        }))),

      assignPlayerToTeam: (teamId, playerId) =>
        set((state) => updateActive(state, t => ({
          ...t,
          teams: t.teams.map(team => team.id === teamId ? { ...team, playerIds: [...team.playerIds, playerId] } : team)
        }))),

      startTournament: () =>
        set((state) => updateActive(state, t => {
          let totalRounds = t.totalRounds;
          if (!t.manualRoundOverride) {
            if (t.type === 'knockout') {
              const count = t.isTeamTournament ? t.teams.filter(team => team.playerIds.length > 0).length : t.players.filter(p => p.active).length;
              totalRounds = Math.ceil(Math.log2(count));
            } else if (t.type === 'round-robin') {
              const count = t.isTeamTournament ? t.teams.filter(team => team.playerIds.length > 0).length : t.players.filter(p => p.active).length;
              totalRounds = count % 2 === 0 ? count - 1 : count;
            } else if (t.type === 'swiss' && t.autoCalculateRounds) {
              const count = t.isTeamTournament ? t.teams.filter(team => team.playerIds.length > 0).length : t.players.filter(p => p.active).length;
              totalRounds = Math.max(1, Math.ceil(Math.log2(count)) + 1);
            }
          }

          // Auto-assign pairing numbers: rated players by rating desc, then unrated by name asc
          const activePlayers = t.players.filter(p => p.active);
          const rated = activePlayers.filter(p => p.rating).sort((a, b) => (b.rating || 0) - (a.rating || 0));
          const unrated = activePlayers.filter(p => !p.rating).sort((a, b) => a.name.localeCompare(b.name));
          const ordered = [...rated, ...unrated];
          const playersWithPN = t.players.map(p => {
            const idx = ordered.findIndex(op => op.id === p.id);
            return idx >= 0 ? { ...p, pairingNumber: idx + 1 } : p;
          });

          return {
            ...t,
            status: 'active',
            currentRound: 1,
            totalRounds,
            players: playersWithPN
          };
        })),

      generatePairings: (round, matches) =>
        set((state) => updateActive(state, t => {
          // Preserve completed matches for this round; only replace unplayed ones
          const completedMatches = t.matches.filter(m => m.round === round && m.result !== null);
          const otherMatches = t.matches.filter(m => m.round !== round);
          return { ...t, matches: [...otherMatches, ...completedMatches, ...matches], forcedPairings: [] }; // Clear forced pairings after generating
        })),

      updateMatchResult: (matchId, result) =>
        set((state) => updateActive(state, t => ({
          ...t,
          matches: t.matches.map(m => m.id === matchId ? { ...m, result } : m)
        }))),

      updateMatchPgn: (matchId, pgn) =>
        set((state) => updateActive(state, t => ({
          ...t,
          matches: t.matches.map(m => m.id === matchId ? { ...m, pgn } : m)
        }))),

      completeRound: () =>
        set((state) => updateActive(state, t => {
          const nextRound = t.currentRound + 1;
          const status = nextRound > t.totalRounds ? 'completed' : 'active';
          return { ...t, currentRound: status === 'completed' ? t.currentRound : nextRound, status };
        })),

      rollbackRound: () =>
        set((state) => updateActive(state, t => {
          if (t.currentRound === 0) return t;
          if (t.status === 'completed') {
            return { ...t, status: 'active', matches: t.matches.map(m => m.round === t.currentRound ? { ...m, result: null } : m) };
          } else {
            const newRound = t.currentRound - 1;
            return {
              ...t,
              status: newRound === 0 ? 'setup' : 'active',
              currentRound: newRound,
              matches: t.matches.filter(m => m.round !== t.currentRound)
            };
          }
        })),

      swapPlayers: (matchId1, isWhite1, matchId2, isWhite2) =>
        set((state) => updateActive(state, t => {
          const matches = [...t.matches];
          const m1Index = matches.findIndex(m => m.id === matchId1);
          const m2Index = matches.findIndex(m => m.id === matchId2);
          if (m1Index < 0 || m2Index < 0) return t;

          const m1 = { ...matches[m1Index] };
          const m2 = { ...matches[m2Index] };

          // Defensive validations
          if (m1.round !== m2.round) return t;
          if (m1.result !== null || m2.result !== null) return t;
          if (m1.result === 'bye' || m2.result === 'bye') return t;

          const p1Id = isWhite1 ? m1.whiteId : m1.blackId;
          const p2Id = isWhite2 ? m2.whiteId : m2.blackId;
          if (!p1Id || !p2Id) return t;

          const targetId1 = isWhite1 ? p2Id : m1.whiteId;
          const targetId2 = isWhite2 ? p1Id : m2.whiteId;

          // Prevent duplicate players in the same round after swap
          const roundMatches = matches.filter(m => m.round === m1.round && m.id !== m1.id && m.id !== m2.id);
          const idsInRound = new Set<string>();
          for (const m of roundMatches) {
            if (m.whiteId) idsInRound.add(m.whiteId);
            if (m.blackId) idsInRound.add(m.blackId);
          }
          if (targetId1 && idsInRound.has(targetId1)) return t;
          if (targetId2 && idsInRound.has(targetId2)) return t;

          if (isWhite1) m1.whiteId = p2Id; else m1.blackId = p2Id;
          if (isWhite2) m2.whiteId = p1Id; else m2.blackId = p1Id;

          m1.isManual = true;
          m2.isManual = true;

          matches[m1Index] = m1;
          matches[m2Index] = m2;

          return { ...t, matches };
        })),

      addManualMatch: (round, whiteId, blackId) =>
        set((state) => updateActive(state, t => {
          const newMatch: Match = {
            id: uuidv4(),
            round,
            whiteId,
            blackId,
            result: blackId ? null : 'bye',
            boardNumber: t.matches.filter(m => m.round === round).length + 1,
            isManual: true
          };
          return { ...t, matches: [...t.matches, newMatch] };
        })),

      removeManualMatch: (matchId) =>
        set((state) => updateActive(state, t => ({
          ...t,
          matches: t.matches.filter(m => m.id !== matchId)
        }))),

      addForcedPairing: (whiteId, blackId) =>
        set((state) => updateActive(state, t => ({
          ...t,
          forcedPairings: [...(t.forcedPairings || []), { whiteId, blackId }]
        }))),

      removeForcedPairing: (index) =>
        set((state) => updateActive(state, t => ({
          ...t,
          forcedPairings: (t.forcedPairings || []).filter((_, i) => i !== index)
        }))),

      clearForcedPairings: () =>
        set((state) => updateActive(state, t => ({
          ...t,
          forcedPairings: []
        }))),
    }),
    {
      name: 'chess-tournament-storage',
      // Migration to handle old state format
      migrate: (persistedState: any, version) => {
        if (persistedState.tournament && !persistedState.tournaments) {
          // Upgrade old state
          const oldT = persistedState.tournament;
          oldT.pointsForWin = 1;
          oldT.pointsForDraw = 0.5;
          oldT.pointsForLoss = 0;
          oldT.avoidClubPairings = false;
          oldT.forcedPairings = [];
          oldT.isTeamTournament = oldT.type === 'team';
          if (oldT.type === 'team') oldT.type = 'swiss';
          oldT.players = oldT.players.map((p: any) => ({ ...p, active: true, withdrawn: false, requestedByes: [] }));
          oldT.autoCalculateRounds = true;
          oldT.manualRoundOverride = false;
          return {
            tournaments: [oldT],
            activeTournamentId: oldT.id
          };
        }
        
        // Ensure forcedPairings and isTeamTournament exists on all tournaments
        if (persistedState.tournaments) {
          persistedState.tournaments = persistedState.tournaments.map((t: any) => {
            const isTeam = t.type === 'team' || t.isTeamTournament === true;
            
            // Auto-assign pairing numbers if missing
            let players = t.players || [];
            if (players.length > 0 && !players.some((p: any) => p.pairingNumber)) {
              const rated = players.filter((p: any) => p.rating).sort((a: any, b: any) => (b.rating || 0) - (a.rating || 0));
              const unrated = players.filter((p: any) => !p.rating);
              const ordered = [...rated, ...unrated];
              players = players.map((p: any) => {
                const idx = ordered.findIndex((op: any) => op.id === p.id);
                return idx >= 0 ? { ...p, pairingNumber: idx + 1 } : p;
              });
            }
            
            return {
              ...t,
              type: t.type === 'team' ? 'swiss' : t.type,
              isTeamTournament: isTeam,
              forcedPairings: t.forcedPairings || [],
              autoCalculateRounds: t.autoCalculateRounds ?? true,
              manualRoundOverride: t.manualRoundOverride ?? false,
              tiebreakOrder: t.tiebreakOrder || ['direct-encounter', 'buchholz', 'median-buchholz', 'sonneborn-berger', 'most-wins'],
              players: players.map((p: any) => ({
                ...p,
                withdrawn: p.withdrawn ?? false,
                pairingNumber: p.pairingNumber ?? undefined
              }))
            };
          });
        }
        
        return persistedState;
      }
    }
  )
);

// Helpful for debugging or testing in console
if (typeof window !== 'undefined') {
  (window as any).generateRandomResults = () => {
    const state = useTournamentStore.getState();
    const tournament = state.tournaments.find(t => t.id === state.activeTournamentId);
    if (!tournament) {
      console.error('No active tournament found.');
      return;
    }
    
    const results: MatchResult[] = ['1-0', '0-1', '0.5-0.5'];
    const weights = [9, 9, 1]; // ~47% white win, ~47% black win, ~5% draw
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    
    let updatedMatches = 0;
    
    tournament.matches.forEach(match => {
      if (match.round === tournament.currentRound && !match.result && match.blackId) {
        let r = Math.random() * totalWeight;
        let idx = 0;
        for (; idx < weights.length; idx++) {
          r -= weights[idx];
          if (r <= 0) break;
        }
        const randomResult = results[idx];
        state.updateMatchResult(match.id, randomResult);
        updatedMatches++;
      }
    });
    
    console.log(`Generated random results for ${updatedMatches} matches in round ${tournament.currentRound}.`);
  };
}
