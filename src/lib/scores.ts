import { Match, Tournament } from '../store/useTournamentStore';

export function calculateScores(tournament: Tournament, upToRound?: number) {
  const scores: Record<string, number> = {};
  const played: Record<string, Set<string>> = {};
  const colorBalance: Record<string, number> = {}; // >0 means more white, <0 means more black
  const colorSequence: Record<string, ('W' | 'B')[]> = {};
  const floatHistory: Record<string, number[]> = {}; // 1 for up-float, -1 for down-float
  const byes: Set<string> = new Set();

  const ptsW = tournament.pointsForWin ?? 1;
  const ptsD = tournament.pointsForDraw ?? 0.5;
  const ptsL = tournament.pointsForLoss ?? 0;

  tournament.players.forEach((p) => {
    scores[p.id] = 0;
    played[p.id] = new Set();
    colorBalance[p.id] = 0;
    colorSequence[p.id] = [];
    floatHistory[p.id] = [];

    // Add requested byes score
    if (p.requestedByes && p.requestedByes.length > 0) {
      const applicableByes = upToRound !== undefined ? p.requestedByes.filter(r => r <= upToRound) : p.requestedByes;
      scores[p.id] += applicableByes.length * ptsD;
    }
  });

  const matchesToProcess = upToRound !== undefined ? tournament.matches.filter(m => m.round <= upToRound) : tournament.matches;

  // Sort matches by round to process history correctly
  const sortedMatches = [...matchesToProcess].sort((a, b) => a.round - b.round);

  // We need to track scores round-by-round to determine floats
  const roundScores: Record<string, number> = {};
  tournament.players.forEach(p => {
    // Initialize roundScores with requested bye points so float directions reflect actual standings
    if (p.requestedByes && p.requestedByes.length > 0) {
      const applicableByes = upToRound !== undefined ? p.requestedByes.filter(r => r <= upToRound) : p.requestedByes;
      roundScores[p.id] = applicableByes.length * ptsD;
    } else {
      roundScores[p.id] = 0;
    }
  });

  // Group matches by round to compute floats based on pre-round scores
  const matchesByRound: Record<number, typeof sortedMatches> = {};
  sortedMatches.forEach(m => {
    if (m.result === null) return;
    if (!matchesByRound[m.round]) matchesByRound[m.round] = [];
    matchesByRound[m.round].push(m);
  });

  const roundNumbers = Object.keys(matchesByRound).map(Number).sort((a, b) => a - b);

  for (const round of roundNumbers) {
    const roundMatches = matchesByRound[round];

    // Calculate floats for this round based on scores at the start of the round
    for (const m of roundMatches) {
      if (m.whiteId && m.blackId) {
        if (roundScores[m.whiteId] > roundScores[m.blackId]) {
          floatHistory[m.whiteId].push(-1); // Down-float
          floatHistory[m.blackId].push(1);  // Up-float
        } else if (roundScores[m.whiteId] < roundScores[m.blackId]) {
          floatHistory[m.whiteId].push(1);  // Up-float
          floatHistory[m.blackId].push(-1); // Down-float
        } else {
          floatHistory[m.whiteId].push(0);
          floatHistory[m.blackId].push(0);
        }
      }
    }

    // Apply all results from this round
    for (const m of roundMatches) {
      if (m.whiteId && m.blackId) {
        played[m.whiteId].add(m.blackId);
        played[m.blackId].add(m.whiteId);

        colorBalance[m.whiteId]++;
        colorBalance[m.blackId]--;
        colorSequence[m.whiteId].push('W');
        colorSequence[m.blackId].push('B');

        if (m.result === '1-0') {
          scores[m.whiteId] += ptsW;
          scores[m.blackId] += ptsL;
          roundScores[m.whiteId] += ptsW;
          roundScores[m.blackId] += ptsL;
        } else if (m.result === '0-1') {
          scores[m.blackId] += ptsW;
          scores[m.whiteId] += ptsL;
          roundScores[m.blackId] += ptsW;
          roundScores[m.whiteId] += ptsL;
        } else if (m.result === '0.5-0.5') {
          scores[m.whiteId] += ptsD;
          scores[m.blackId] += ptsD;
          roundScores[m.whiteId] += ptsD;
          roundScores[m.blackId] += ptsD;
        } else if (m.result === 'forfeit-white') {
          scores[m.blackId] += ptsW;
          scores[m.whiteId] += ptsL;
          roundScores[m.blackId] += ptsW;
          roundScores[m.whiteId] += ptsL;
        } else if (m.result === 'forfeit-black') {
          scores[m.whiteId] += ptsW;
          scores[m.blackId] += ptsL;
          roundScores[m.whiteId] += ptsW;
          roundScores[m.blackId] += ptsL;
        }
      } else if (m.whiteId && m.result === 'bye') {
        scores[m.whiteId] += ptsW;
        roundScores[m.whiteId] += ptsW;
        byes.add(m.whiteId);
      } else if (m.blackId && m.result === 'bye') {
        scores[m.blackId] += ptsW;
        roundScores[m.blackId] += ptsW;
        byes.add(m.blackId);
      }
    }
  }

  // Apply penalties at the end
  tournament.players.forEach(p => {
    if (p.penaltyPoints) {
      scores[p.id] -= p.penaltyPoints;
    }
  });

  return { scores, played, colorBalance, colorSequence, floatHistory, byes };
}

export function calculateTeamScores(tournament: Tournament, upToRound?: number) {
  const teamMatchPoints: Record<string, number> = {};
  const teamGamePoints: Record<string, number> = {};
  const teamPlayed: Record<string, Set<string>> = {};
  const teamByes: Set<string> = new Set();
  const teamColorHistory: Record<string, number> = {}; // >0 means Team played White on Board 1 more often

  tournament.teams.forEach(t => {
    teamMatchPoints[t.id] = 0;
    teamGamePoints[t.id] = 0;
    teamPlayed[t.id] = new Set();
    teamColorHistory[t.id] = 0;
  });

  const matchesToProcess = upToRound !== undefined ? tournament.matches.filter(m => m.round <= upToRound) : tournament.matches;

  // Group matches by teamMatchId
  const teamMatchesByRound: Record<number, Record<string, Match[]>> = {};
  matchesToProcess.forEach(m => {
    if (!m.teamMatchId || m.result === null) return;
    if (!teamMatchesByRound[m.round]) teamMatchesByRound[m.round] = {};
    if (!teamMatchesByRound[m.round][m.teamMatchId]) teamMatchesByRound[m.round][m.teamMatchId] = [];
    teamMatchesByRound[m.round][m.teamMatchId].push(m);
  });

  // Calculate scores per team match
  Object.values(teamMatchesByRound).forEach(roundMatches => {
    Object.entries(roundMatches).forEach(([teamMatchId, matches]) => {
      // Find which teams are playing
      let teamA: string | null = null;
      let teamB: string | null = null;
      let isBye = false;

      // Determine teams from the first board
      const firstMatch = matches[0];
      if (firstMatch) {
        if (firstMatch.result === 'bye') {
          isBye = true;
          // Find team of the whiteId
          const team = tournament.teams.find(t => t.playerIds.includes(firstMatch.whiteId!));
          if (team) teamA = team.id;
        } else {
          const teamWhite = tournament.teams.find(t => t.playerIds.includes(firstMatch.whiteId!));
          const teamBlack = tournament.teams.find(t => t.playerIds.includes(firstMatch.blackId!));
          if (teamWhite) teamA = teamWhite.id;
          if (teamBlack) teamB = teamBlack.id;

          if (teamA && teamB) {
            teamPlayed[teamA].add(teamB);
            teamPlayed[teamB].add(teamA);
            teamColorHistory[teamA]++;
            teamColorHistory[teamB]--;
          }
        }
      }

      if (isBye && teamA) {
        teamMatchPoints[teamA] += 2; // 2 MP for a bye
        teamByes.add(teamA);
        return;
      }

      if (teamA && teamB) {
        let teamAGamePoints = 0;
        let teamBGamePoints = 0;

        matches.forEach(m => {
          const isTeamAWhite = tournament.teams.find(t => t.id === teamA)?.playerIds.includes(m.whiteId!);
          if (m.result === '1-0') {
            if (isTeamAWhite) teamAGamePoints += 1; else teamBGamePoints += 1;
          } else if (m.result === '0-1') {
            if (isTeamAWhite) teamBGamePoints += 1; else teamAGamePoints += 1;
          } else if (m.result === '0.5-0.5') {
            teamAGamePoints += 0.5;
            teamBGamePoints += 0.5;
          } else if (m.result === 'forfeit-white') {
            if (isTeamAWhite) teamBGamePoints += 1; else teamAGamePoints += 1;
          } else if (m.result === 'forfeit-black') {
            if (isTeamAWhite) teamAGamePoints += 1; else teamBGamePoints += 1;
          }
        });

        teamGamePoints[teamA] += teamAGamePoints;
        teamGamePoints[teamB] += teamBGamePoints;

        if (teamAGamePoints > teamBGamePoints) {
          teamMatchPoints[teamA] += 2;
        } else if (teamBGamePoints > teamAGamePoints) {
          teamMatchPoints[teamB] += 2;
        } else {
          teamMatchPoints[teamA] += 1;
          teamMatchPoints[teamB] += 1;
        }
      }
    });
  });

  return { teamMatchPoints, teamGamePoints, teamPlayed, teamByes, teamColorHistory };
}
