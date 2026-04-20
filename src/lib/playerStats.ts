import { Tournament } from '../store/useTournamentStore';

export type PlayerMatchStat = {
  round: number;
  opponentId: string | null;
  opponentName: string;
  color: 'W' | 'B' | null;
  result: '1' | '0' | '0.5' | null;
};

export function getPlayerStats(tournament: Tournament, playerId: string) {
  const stats: PlayerMatchStat[] = [];
  let consecutiveColors = 0;
  let lastColor: 'W' | 'B' | null = null;
  let colorDiff = 0; // W is +1, B is -1

  const sortedMatches = [...tournament.matches]
    .filter(m => m.whiteId === playerId || m.blackId === playerId)
    .sort((a, b) => a.round - b.round);

  for (const m of sortedMatches) {
    const isWhite = m.whiteId === playerId;
    const color = m.result === 'bye' ? null : (isWhite ? 'W' : 'B');
    const opponentId = isWhite ? m.blackId : m.whiteId;
    const opponentName = opponentId ? tournament.players.find(p => p.id === opponentId)?.name || 'Unknown' : 'BYE';
    
    let result: '1' | '0' | '0.5' | null = null;
    if (m.result === '1-0') result = isWhite ? '1' : '0';
    else if (m.result === '0-1') result = isWhite ? '0' : '1';
    else if (m.result === '0.5-0.5') result = '0.5';
    else if (m.result === 'bye') result = '1';
    else if (m.result === 'forfeit-white') result = isWhite ? '0' : '1';
    else if (m.result === 'forfeit-black') result = isWhite ? '1' : '0';

    stats.push({ round: m.round, opponentId, opponentName, color, result });

    if (color) {
      colorDiff += color === 'W' ? 1 : -1;
      if (color === lastColor) {
        consecutiveColors++;
      } else {
        lastColor = color;
        consecutiveColors = 1;
      }
    }
  }

  const hasColorWarning = consecutiveColors >= 3 || Math.abs(colorDiff) >= 2;

  return { stats, consecutiveColors, lastColor, colorDiff, hasColorWarning };
}
