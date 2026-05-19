import { Tournament, Player, Team } from '../store/useTournamentStore';
import { calculateScores, calculateTeamScores } from './pairing';

export type PlayerStanding = Player & {
  score: number;
  buchholz: number;
  sonnebornBerger: number;
  medianBuchholz: number;
  mostWins: number;
  directEncounter: number;
};

export type TeamStanding = Team & {
  matchPoints: number;
  gamePoints: number;
  sonnebornBerger: number;
};

export function calculateTeamStandings(tournament: Tournament, upToRound?: number): TeamStanding[] {
  const { teamMatchPoints, teamGamePoints, teamPlayed } = calculateTeamScores(tournament, upToRound);
  
  const standings: TeamStanding[] = tournament.teams.map(t => ({
    ...t,
    matchPoints: teamMatchPoints[t.id] || 0,
    gamePoints: teamGamePoints[t.id] || 0,
    sonnebornBerger: 0,
  }));

  // Calculate Team Sonneborn-Berger
  // Sum of match points of opponents beaten + half match points of opponents drawn
  standings.forEach(team => {
    let sb = 0;
    // We need to iterate over matches to find results against specific teams
    // This is a bit complex because matches are individual boards
    // Let's use a simplified version: iterate over teamPlayed
    const opponents = Array.from(teamPlayed[team.id] || []);
    opponents.forEach(oppId => {
      // Find the team match result against this opponent
      const teamMatches = tournament.matches.filter(m => 
        m.teamMatchId && 
        (!(upToRound !== undefined) || m.round <= upToRound) &&
        ((tournament.teams.find(t => t.id === team.id)?.playerIds.includes(m.whiteId!) && tournament.teams.find(t => t.id === oppId)?.playerIds.includes(m.blackId!)) ||
         (tournament.teams.find(t => t.id === team.id)?.playerIds.includes(m.blackId!) && tournament.teams.find(t => t.id === oppId)?.playerIds.includes(m.whiteId!)))
      );
      
      if (teamMatches.length > 0) {
        let teamGP = 0;
        let oppGP = 0;
        teamMatches.forEach(m => {
          const isTeamWhite = tournament.teams.find(t => t.id === team.id)?.playerIds.includes(m.whiteId!);
          if (m.result === '1-0') { if (isTeamWhite) teamGP++; else oppGP++; }
          else if (m.result === '0-1') { if (isTeamWhite) oppGP++; else teamGP++; }
          else if (m.result === '0.5-0.5') { teamGP += 0.5; oppGP += 0.5; }
        });

        const oppMP = teamMatchPoints[oppId] || 0;
        if (teamGP > oppGP) sb += oppMP;
        else if (teamGP === oppGP) sb += oppMP / 2;
      }
    });
    team.sonnebornBerger = sb;
  });

  standings.sort((a, b) => {
    if (b.matchPoints !== a.matchPoints) return b.matchPoints - a.matchPoints;
    if (b.gamePoints !== a.gamePoints) return b.gamePoints - a.gamePoints;
    return b.sonnebornBerger - a.sonnebornBerger;
  });

  return standings;
}

export function calculateStandings(tournament: Tournament, upToRound?: number): PlayerStanding[] {
  const { scores, played } = calculateScores(tournament, upToRound);
  
  const standings: PlayerStanding[] = tournament.players.map(p => ({
    ...p,
    score: scores[p.id] || 0,
    buchholz: 0,
    sonnebornBerger: 0,
    medianBuchholz: 0,
    mostWins: 0,
    directEncounter: 0,
  }));

  const matchesToProcess = upToRound !== undefined ? tournament.matches.filter(m => m.round <= upToRound) : tournament.matches;

  // Calculate Most Wins
  matchesToProcess.forEach(m => {
    if (m.result === '1-0' && m.whiteId) {
      const p = standings.find(s => s.id === m.whiteId);
      if (p) p.mostWins++;
    } else if (m.result === '0-1' && m.blackId) {
      const p = standings.find(s => s.id === m.blackId);
      if (p) p.mostWins++;
    } else if (m.result === 'forfeit-white' && m.blackId) {
      const p = standings.find(s => s.id === m.blackId);
      if (p) p.mostWins++;
    } else if (m.result === 'forfeit-black' && m.whiteId) {
      const p = standings.find(s => s.id === m.whiteId);
      if (p) p.mostWins++;
    }
  });

  // Calculate Buchholz, Median-Buchholz, and Sonneborn-Berger
  standings.forEach(p => {
    const opponents = Array.from(played[p.id] || []);
    const opponentScores = opponents.map(oppId => scores[oppId] || 0);
    
    // Buchholz: Sum of opponents' scores
    p.buchholz = opponentScores.reduce((sum, score) => sum + score, 0);
    
    // Median-Buchholz: Buchholz dropping highest and lowest opponent scores
    if (opponentScores.length > 2) {
      const sortedOppScores = [...opponentScores].sort((a, b) => a - b);
      sortedOppScores.pop(); // drop highest
      sortedOppScores.shift(); // drop lowest
      p.medianBuchholz = sortedOppScores.reduce((sum, score) => sum + score, 0);
    } else {
      p.medianBuchholz = p.buchholz;
    }

    // Sonneborn-Berger: Sum of scores of opponents beaten + half scores of opponents drawn
    let sb = 0;
    matchesToProcess.forEach(m => {
      if (m.whiteId === p.id) {
        if (m.result === '1-0' || m.result === 'forfeit-black') sb += scores[m.blackId!] || 0;
        if (m.result === '0.5-0.5') sb += (scores[m.blackId!] || 0) / 2;
      } else if (m.blackId === p.id) {
        if (m.result === '0-1' || m.result === 'forfeit-white') sb += scores[m.whiteId!] || 0;
        if (m.result === '0.5-0.5') sb += (scores[m.whiteId!] || 0) / 2;
      }
    });
    p.sonnebornBerger = sb;
  });

  // Sort standings
  standings.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    
    const order = tournament.tiebreakOrder || ['direct-encounter', 'buchholz', 'median-buchholz', 'sonneborn-berger', 'most-wins'];

    for (const tb of order) {
      if (tb === 'direct-encounter') {
        const match = matchesToProcess.find(m => 
          (m.whiteId === a.id && m.blackId === b.id) || 
          (m.whiteId === b.id && m.blackId === a.id)
        );
        if (match && match.result) {
          if (match.whiteId === a.id) {
            if (match.result === '1-0' || match.result === 'forfeit-black') return -1;
            if (match.result === '0-1' || match.result === 'forfeit-white') return 1;
          } else {
            if (match.result === '0-1' || match.result === 'forfeit-white') return -1;
            if (match.result === '1-0' || match.result === 'forfeit-black') return 1;
          }
        }
      } else if (tb === 'buchholz') {
        if (b.buchholz !== a.buchholz) return b.buchholz - a.buchholz;
      } else if (tb === 'median-buchholz') {
        if (b.medianBuchholz !== a.medianBuchholz) return b.medianBuchholz - a.medianBuchholz;
      } else if (tb === 'sonneborn-berger') {
        if (b.sonnebornBerger !== a.sonnebornBerger) return b.sonnebornBerger - a.sonnebornBerger;
      } else if (tb === 'most-wins') {
        if (b.mostWins !== a.mostWins) return b.mostWins - a.mostWins;
      }
    }
    
    return a.name.localeCompare(b.name);
  });

  return standings;
}
