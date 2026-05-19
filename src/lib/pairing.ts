import { Match, Player, Tournament, Team } from '../store/useTournamentStore';
import { v4 as uuidv4 } from 'uuid';

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
    roundScores[p.id] = 0;
    if (p.requestedByes && p.requestedByes.length > 0) {
      // This is a simplification, ideally we'd add it in the specific round
    }
  });

  sortedMatches.forEach((m) => {
    if (m.result === null) return;

    if (m.whiteId && m.blackId) {
      played[m.whiteId].add(m.blackId);
      played[m.blackId].add(m.whiteId);
      
      colorBalance[m.whiteId]++;
      colorBalance[m.blackId]--;
      colorSequence[m.whiteId].push('W');
      colorSequence[m.blackId].push('B');

      // Track floats: if scores were different at the time of pairing
      // Since we don't have the exact scores at pairing time easily, 
      // we use the scores accumulated up to the previous round.
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
  });

  // Apply penalties at the end
  tournament.players.forEach(p => {
    if (p.penaltyPoints) {
      scores[p.id] -= p.penaltyPoints;
    }
  });

  return { scores, played, colorBalance, colorSequence, floatHistory, byes };
}

export function generateRoundRobin(players: Player[], round: number): Match[] {
  const activePlayers = players.filter(p => !p.withdrawn);
  const matches: Match[] = [];
  const n = activePlayers.length;
  const isOdd = n % 2 !== 0;
  
  const dummy = { id: 'dummy', name: 'Bye' } as Player;
  const workingPlayers = isOdd ? [...activePlayers, dummy] : [...activePlayers];
  const totalPlayers = workingPlayers.length;

  // Polygon method
  const p = [...workingPlayers];
  
  // Rotate array based on round
  for (let i = 1; i < round; i++) {
    const last = p.pop()!;
    p.splice(1, 0, last);
  }

  for (let i = 0; i < totalPlayers / 2; i++) {
    const p1 = p[i];
    const p2 = p[totalPlayers - 1 - i];

    if (p1.id === 'dummy' || p2.id === 'dummy') {
      const realPlayer = p1.id === 'dummy' ? p2 : p1;
      matches.push({
        id: uuidv4(),
        round,
        whiteId: realPlayer.id,
        blackId: null,
        result: null,
        boardNumber: i + 1,
      });
    } else {
      // Alternate colors based on round
      const isEvenRound = round % 2 === 0;
      const white = isEvenRound ? p2 : p1;
      const black = isEvenRound ? p1 : p2;

      matches.push({
        id: uuidv4(),
        round,
        whiteId: white.id,
        blackId: black.id,
        result: null,
        boardNumber: i + 1,
      });
    }
  }

  return matches;
}

export function checkColorSequence(seq: ('W' | 'B')[], newColor: 'W' | 'B') {
  if (!seq || seq.length < 2) return true;
  const last2 = seq.slice(-2);
  return !(last2[0] === newColor && last2[1] === newColor);
}

export function generateSwiss(tournament: Tournament, round: number): Match[] {
  const { scores, played, colorBalance, colorSequence, floatHistory, byes } = calculateScores(tournament);
  
  const matches: Match[] = [];
  const existingRoundMatches = tournament.matches.filter(m => m.round === round);
  let boardNumber = 1;
  // If there are existing matches (e.g. manual pairings), start board numbering after them
  if (existingRoundMatches.length > 0) {
    boardNumber = Math.max(...existingRoundMatches.map(m => m.boardNumber || 0)) + 1;
    if (boardNumber === 1000) boardNumber = 1; // if only byes (999) exist
  }
  const pairedPlayers = new Set<string>();

  // Add players from existing matches in this round to pairedPlayers so we skip them
  existingRoundMatches.forEach(m => {
    if (m.whiteId) pairedPlayers.add(m.whiteId);
    if (m.blackId) pairedPlayers.add(m.blackId);
  });

  // 1. Process forced pairings
  if (tournament.forcedPairings && tournament.forcedPairings.length > 0) {
    tournament.forcedPairings.forEach(fp => {
      matches.push({
        id: uuidv4(),
        round,
        whiteId: fp.whiteId,
        blackId: fp.blackId,
        result: null,
        boardNumber: boardNumber++,
      });
      pairedPlayers.add(fp.whiteId);
      if (fp.blackId) pairedPlayers.add(fp.blackId);
    });
  }

  // Filter out inactive players, requested byes, and already paired players
  let playersToPair = [...tournament.players].filter(p => 
    p.active && !p.withdrawn && (!p.requestedByes || !p.requestedByes.includes(round)) && !pairedPlayers.has(p.id)
  ).sort((a, b) => {
    if (scores[b.id] !== scores[a.id]) {
      return scores[b.id] - scores[a.id];
    }
    return (b.rating || 0) - (a.rating || 0);
  });

  // Handle bye for odd number of players
  if (playersToPair.length % 2 !== 0) {
    // Find lowest ranked player who hasn't had a bye
    let byePlayerIndex = playersToPair.length - 1;
    while (byePlayerIndex >= 0 && byes.has(playersToPair[byePlayerIndex].id)) {
      byePlayerIndex--;
    }
    if (byePlayerIndex < 0) byePlayerIndex = playersToPair.length - 1; // Fallback

    const byePlayer = playersToPair[byePlayerIndex];
    matches.push({
      id: uuidv4(),
      round,
      whiteId: byePlayer.id,
      blackId: null,
      result: 'bye',
      boardNumber: 999, // Put byes at the end
    });
    pairedPlayers.add(byePlayer.id);
    playersToPair.splice(byePlayerIndex, 1);
  }

  const isLastRound = round === tournament.totalRounds;

  // Helper to check if two players can be paired
  const canPair = (p1: Player, p2: Player, relaxColorBalance: boolean = false, relaxFloats: boolean = false) => {
    // 1. Basic: Not played before
    if (played[p1.id].has(p2.id)) return { valid: false, p1CanW: false, p1CanB: false };

    // 2. Club avoidance
    if (tournament.avoidClubPairings && p1.club && p2.club && p1.club === p2.club) return { valid: false, p1CanW: false, p1CanB: false };

    // 3. Color constraints (FIDE)
    const checkColorBalance = (balance: number, newColor: 'W' | 'B') => {
      const newBalance = newColor === 'W' ? balance + 1 : balance - 1;
      return Math.abs(newBalance) <= 2;
    };

    const p1SeqW = checkColorSequence(colorSequence[p1.id], 'W');
    const p1SeqB = checkColorSequence(colorSequence[p1.id], 'B');
    const p2SeqW = checkColorSequence(colorSequence[p2.id], 'W');
    const p2SeqB = checkColorSequence(colorSequence[p2.id], 'B');

    const p1BalW = relaxColorBalance || checkColorBalance(colorBalance[p1.id], 'W');
    const p1BalB = relaxColorBalance || checkColorBalance(colorBalance[p1.id], 'B');
    const p2BalW = relaxColorBalance || checkColorBalance(colorBalance[p2.id], 'W');
    const p2BalB = relaxColorBalance || checkColorBalance(colorBalance[p2.id], 'B');

    const p1CanW = p1SeqW && p1BalW;
    const p1CanB = p1SeqB && p1BalB;
    const p2CanW = p2SeqW && p2BalW;
    const p2CanB = p2SeqB && p2BalB;

    const option1 = p1CanW && p2CanB;
    const option2 = p1CanB && p2CanW;

    if (!option1 && !option2) return { valid: false, p1CanW: false, p1CanB: false };

    // 4. Float constraints
    const lastFloatP1 = floatHistory[p1.id] && floatHistory[p1.id].length > 0 ? floatHistory[p1.id][floatHistory[p1.id].length - 1] : 0;
    const lastFloatP2 = floatHistory[p2.id] && floatHistory[p2.id].length > 0 ? floatHistory[p2.id][floatHistory[p2.id].length - 1] : 0;
    
    const isFloat = scores[p1.id] !== scores[p2.id];
    if (isFloat && !relaxFloats) {
      const p1FloatDir = scores[p1.id] > scores[p2.id] ? -1 : 1;
      const p2FloatDir = scores[p2.id] > scores[p1.id] ? -1 : 1;
      
      if (lastFloatP1 !== 0 && p1FloatDir === lastFloatP1) return { valid: false, p1CanW: false, p1CanB: false };
      if (lastFloatP2 !== 0 && p2FloatDir === lastFloatP2) return { valid: false, p1CanW: false, p1CanB: false };
    }

    return { valid: true, p1CanW: option1, p1CanB: option2 };
  };

  // Backtracking pairing function for a group of players
  const pairPlayers = (toPair: Player[], relaxColorBalance: boolean = false, relaxFloats: boolean = false): Match[] | null => {
    if (toPair.length === 0) return [];
    
    const p1 = toPair[0];
    // Try to pair p1 with every other player p2
    // FIDE Dutch suggests starting from the middle of the group for better distribution
    const half = Math.floor(toPair.length / 2);
    const searchOrder = [];
    for (let i = half; i < toPair.length; i++) searchOrder.push(i);
    for (let i = 1; i < half; i++) searchOrder.push(i);

    for (const i of searchOrder) {
      const p2 = toPair[i];
      const check = canPair(p1, p2, relaxColorBalance, relaxFloats);
      if (check.valid) {
        const remaining = toPair.slice(1, i).concat(toPair.slice(i + 1));
        const subMatches = pairPlayers(remaining, relaxColorBalance, relaxFloats);        
        if (subMatches !== null) {
          // Determine colors based on strict validity constraints
          let p1Color: 'W' | 'B' = 'W';

          if (check.p1CanW && !check.p1CanB) {
            p1Color = 'W';
          } else if (!check.p1CanW && check.p1CanB) {
            p1Color = 'B';
          } else {
            // Both are possible, decide based on balance
            const p1Pref = colorBalance[p1.id] > 0 ? 'B' : colorBalance[p1.id] < 0 ? 'W' : null;
            const p2Pref = colorBalance[p2.id] > 0 ? 'B' : colorBalance[p2.id] < 0 ? 'W' : null;

            if (p1Pref === 'W' || p2Pref === 'B') {
               p1Color = 'W';
            } else if (p1Pref === 'B' || p2Pref === 'W') {
               p1Color = 'B';
            } else {
               p1Color = Math.random() > 0.5 ? 'W' : 'B';
            }
          }

          let whiteId = p1Color === 'W' ? p1.id : p2.id;
          let blackId = p1Color === 'W' ? p2.id : p1.id;

          return [{
            id: uuidv4(),
            round,
            whiteId,
            blackId,
            result: null,
            boardNumber: 0, // Will be set later
          }, ...subMatches];
        }
      }
    }
    return null;
  };

  // Group by score
  const scoreGroups: Map<number, Player[]> = new Map();
  playersToPair.forEach(p => {
    const s = scores[p.id];
    if (!scoreGroups.has(s)) scoreGroups.set(s, []);
    scoreGroups.get(s)!.push(p);
  });

  const sortedScores = Array.from(scoreGroups.keys()).sort((a, b) => b - a);
  let currentToPair: Player[] = [];

  for (let i = 0; i < sortedScores.length; i++) {
    const group = scoreGroups.get(sortedScores[i])!;
    currentToPair = [...currentToPair, ...group];

    // Try to pair as many as possible from current pool
    // If it's not the last group, we might leave some for the next group (floats)
    const isLastScoreGroup = i === sortedScores.length - 1;
    
    // We want to pair an even number of players if possible
    // If not last group, we must leave at least one if total is odd
    const targetCount = (currentToPair.length % 2 === 0 || isLastScoreGroup) ? currentToPair.length : currentToPair.length - 1;
    
    // Try strict pairing first, allowing progressive floats
    let groupMatches: Match[] | null = null;
    let pairedCount = targetCount;

    while (pairedCount > 0) {
      groupMatches = pairPlayers(currentToPair.slice(0, pairedCount), false, false);
      if (groupMatches) break;
      pairedCount -= 2;
    }
    
    // In the last round or last score group, if we couldn't pair everyone, relax constraints incrementally
    if (!groupMatches && (isLastRound || isLastScoreGroup)) {
      pairedCount = targetCount;
      while (pairedCount > 0) {
        groupMatches = pairPlayers(currentToPair.slice(0, pairedCount), true, false); // relax colors
        if (groupMatches) break;
        pairedCount -= 2;
      }
      
      if (!groupMatches) {
        pairedCount = targetCount;
        while (pairedCount > 0) {
          groupMatches = pairPlayers(currentToPair.slice(0, pairedCount), true, true); // relax colors and floats
          if (groupMatches) break;
          pairedCount -= 2;
        }
      }
    }
    
    if (groupMatches) {
      groupMatches.forEach(m => {
        m.boardNumber = boardNumber++;
        matches.push(m);
        pairedPlayers.add(m.whiteId!);
        pairedPlayers.add(m.blackId!);
      });
      currentToPair = currentToPair.slice(pairedCount);
    } 

    if (isLastScoreGroup && currentToPair.length > 1) {
      // Fallback for last group if everything else fails: greedy pairing ignoring constraints
      while (currentToPair.length > 1) {
        const p1 = currentToPair[0];
        let p2Index = 1;
        for (let j = 1; j < currentToPair.length; j++) {
          if (!played[p1.id].has(currentToPair[j].id)) {
            p2Index = j;
            break;
          }
        }
        const p2 = currentToPair[p2Index];
        
        // Simple color assignment fallback
        // Simple color assignment fallback, trying to strictly avoid 3 in a row
        const p1SeqW = checkColorSequence(colorSequence[p1.id], 'W');
        const p1SeqB = checkColorSequence(colorSequence[p1.id], 'B');
        const p2SeqW = checkColorSequence(colorSequence[p2.id], 'W');
        const p2SeqB = checkColorSequence(colorSequence[p2.id], 'B');

        let p1Color: 'W' | 'B' = 'W';

        if (p1SeqW && p2SeqB && (!p1SeqB || !p2SeqW)) {
          p1Color = 'W';
        } else if (p1SeqB && p2SeqW && (!p1SeqW || !p2SeqB)) {
          p1Color = 'B';
        } else {
          // Check alternating preferences
          const getP1Alt = () => colorSequence[p1.id]?.length ? (colorSequence[p1.id].slice(-1)[0] === 'W' ? 'B' : 'W') : null;
          const getP2Alt = () => colorSequence[p2.id]?.length ? (colorSequence[p2.id].slice(-1)[0] === 'W' ? 'B' : 'W') : null;
          const p1Alt = getP1Alt();
          const p2Alt = getP2Alt();

          const p1Pref = colorBalance[p1.id] > 0 ? 'B' : colorBalance[p1.id] < 0 ? 'W' : p1Alt;
          const p2Pref = colorBalance[p2.id] > 0 ? 'B' : colorBalance[p2.id] < 0 ? 'W' : p2Alt;

          if (p1Pref === 'W' || p2Pref === 'B') {
            p1Color = 'W';
          } else if (p1Pref === 'B' || p2Pref === 'W') {
            p1Color = 'B';
          } else {
            p1Color = Math.random() > 0.5 ? 'W' : 'B';
          }
        }

        let whiteId = p1Color === 'W' ? p1.id : p2.id;
        let blackId = p1Color === 'W' ? p2.id : p1.id;        
        matches.push({
          id: uuidv4(),
          round,
          whiteId,
          blackId,
          result: null,
          boardNumber: boardNumber++,
        });
        currentToPair.splice(p2Index, 1);
        currentToPair.splice(0, 1);
      }
    }
  }

  // Sort pairings by standings: highest score first, then highest rating
  const getScore = (id: string | null) => id ? (scores[id] ?? 0) : 0;
  const getRating = (id: string | null) => tournament.players.find(p => p.id === id)?.rating ?? 0;
  matches.sort((a, b) => {
    if (a.result === 'bye' && b.result !== 'bye') return 1;
    if (b.result === 'bye' && a.result !== 'bye') return -1;
    if (a.result === 'bye' && b.result === 'bye') return 0;
    const aScore = Math.max(getScore(a.whiteId), getScore(a.blackId!));
    const bScore = Math.max(getScore(b.whiteId), getScore(b.blackId!));
    if (bScore !== aScore) return bScore - aScore;
    const aMax = Math.max(getRating(a.whiteId), getRating(a.blackId!));
    const bMax = Math.max(getRating(b.whiteId), getRating(b.blackId!));
    if (bMax !== aMax) return bMax - aMax;
    const aMin = Math.min(getRating(a.whiteId), getRating(a.blackId!));
    const bMin = Math.min(getRating(b.whiteId), getRating(b.blackId!));
    return bMin - aMin;
  });
  for (let i = 0; i < matches.length; i++) {
    if (matches[i].result !== 'bye') matches[i].boardNumber = i + 1;
    else matches[i].boardNumber = 999;
  }

  return matches;
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

export function generateTeamRoundRobin(tournament: Tournament, round: number): Match[] {
  const teams = tournament.teams.filter(t => t.playerIds.length > 0);
  const n = teams.length;
  const isOdd = n % 2 !== 0;
  
  const dummy = { id: 'dummy', name: 'Bye', playerIds: [] } as Team;
  const workingTeams = isOdd ? [...teams, dummy] : [...teams];
  const totalTeams = workingTeams.length;

  const p = [...workingTeams];
  for (let i = 1; i < round; i++) {
    const last = p.pop()!;
    p.splice(1, 0, last);
  }

  const matches: Match[] = [];
  let boardNumber = 1;

  for (let i = 0; i < totalTeams / 2; i++) {
    const t1 = p[i];
    const t2 = p[totalTeams - 1 - i];

    if (t1.id === 'dummy' || t2.id === 'dummy') {
      const realTeam = t1.id === 'dummy' ? t2 : t1;
      const teamMatchId = uuidv4();
      realTeam.playerIds.forEach(pid => {
        matches.push({
          id: uuidv4(),
          round,
          whiteId: pid,
          blackId: null,
          result: 'bye',
          boardNumber: 999,
          teamMatchId
        });
      });
    } else {
      const isEvenRound = round % 2 === 0;
      const teamWhite = isEvenRound ? t2 : t1;
      const teamBlack = isEvenRound ? t1 : t2;
      const teamMatchId = uuidv4();

      const maxBoards = Math.max(teamWhite.playerIds.length, teamBlack.playerIds.length);
      for (let b = 0; b < maxBoards; b++) {
        const pWhite = teamWhite.playerIds[b];
        const pBlack = teamBlack.playerIds[b];
        
        const actualWhiteId = b % 2 === 0 ? pWhite : pBlack;
        const actualBlackId = b % 2 === 0 ? pBlack : pWhite;

        if (actualWhiteId && actualBlackId) {
          matches.push({
            id: uuidv4(), round, whiteId: actualWhiteId, blackId: actualBlackId, result: null, boardNumber: boardNumber++, teamMatchId
          });
        } else if (actualWhiteId) {
          matches.push({
            id: uuidv4(), round, whiteId: actualWhiteId, blackId: null, result: 'bye', boardNumber: boardNumber++, teamMatchId
          });
        } else if (actualBlackId) {
          matches.push({
            id: uuidv4(), round, whiteId: actualBlackId, blackId: null, result: 'bye', boardNumber: boardNumber++, teamMatchId
          });
        }
      }
    }
  }
  return matches;
}

export function generateKnockout(tournament: Tournament, round: number): Match[] {
  if (round === 1) {
    const players = tournament.players.filter(p => p.active && !p.withdrawn);
    const n = players.length;
    const nextPowerOfTwo = Math.pow(2, Math.ceil(Math.log2(n)));
    const byesCount = nextPowerOfTwo - n;

    const shuffled = [...players].sort(() => Math.random() - 0.5);
    const matches: Match[] = [];
    let boardNumber = 1;

    // First, assign byes to the top seeds (or just the first ones in shuffled for simplicity)
    const byePlayers = shuffled.splice(0, byesCount);
    byePlayers.forEach(p => {
      matches.push({
        id: uuidv4(),
        round: 1,
        whiteId: p.id,
        blackId: null,
        result: 'bye',
        boardNumber: 999
      });
    });

    // Pair the remaining players
    for (let i = 0; i < shuffled.length; i += 2) {
      matches.push({
        id: uuidv4(),
        round: 1,
        whiteId: shuffled[i].id,
        blackId: shuffled[i + 1]?.id || null,
        result: null,
        boardNumber: boardNumber++
      });
    }
    return matches;
  }

  // For round > 1, find winners of previous round
  const prevRoundMatches = tournament.matches.filter(m => m.round === round - 1);
  const winners: string[] = [];

  prevRoundMatches.forEach(m => {
    if (m.result === '1-0' || m.result === 'forfeit-black' || m.result === 'bye') {
      if (m.whiteId) winners.push(m.whiteId);
    } else if (m.result === '0-1' || m.result === 'forfeit-white') {
      if (m.blackId) winners.push(m.blackId);
    } else if (m.result === '0.5-0.5') {
      // In knockout, a draw must be resolved. For now, we'll pick white to advance 
      // but ideally the user should have entered a decisive result.
      if (m.whiteId) winners.push(m.whiteId);
    }
  });

  const matches: Match[] = [];
  let boardNumber = 1;
  for (let i = 0; i < winners.length; i += 2) {
    matches.push({
      id: uuidv4(),
      round,
      whiteId: winners[i],
      blackId: winners[i + 1] || null,
      result: winners[i + 1] ? null : 'bye',
      boardNumber: winners[i + 1] ? boardNumber++ : 999
    });
  }

  return matches;
}

export function generateTeamKnockout(tournament: Tournament, round: number): Match[] {
  if (round === 1) {
    const teams = tournament.teams.filter(t => t.playerIds.length > 0);
    const n = teams.length;
    const nextPowerOfTwo = Math.pow(2, Math.ceil(Math.log2(n)));
    const byesCount = nextPowerOfTwo - n;

    const shuffled = [...teams].sort(() => Math.random() - 0.5);
    const matches: Match[] = [];
    let boardNumber = 1;

    const byeTeams = shuffled.splice(0, byesCount);
    byeTeams.forEach(team => {
      const teamMatchId = uuidv4();
      team.playerIds.forEach(pid => {
        matches.push({
          id: uuidv4(), round: 1, whiteId: pid, blackId: null, result: 'bye', boardNumber: 999, teamMatchId
        });
      });
    });

    for (let i = 0; i < shuffled.length; i += 2) {
      const t1 = shuffled[i];
      const t2 = shuffled[i + 1];
      const teamMatchId = uuidv4();
      if (t2) {
        const maxBoards = Math.max(t1.playerIds.length, t2.playerIds.length);
        for (let b = 0; b < maxBoards; b++) {
          const p1 = t1.playerIds[b];
          const p2 = t2.playerIds[b];
          const whiteId = b % 2 === 0 ? p1 : p2;
          const blackId = b % 2 === 0 ? p2 : p1;
          if (whiteId || blackId) {
            matches.push({
              id: uuidv4(), round, whiteId: whiteId || null, blackId: blackId || null, result: null, boardNumber: boardNumber++, teamMatchId
            });
          }
        }
      } else {
        t1.playerIds.forEach(pid => {
          matches.push({
            id: uuidv4(), round, whiteId: pid, blackId: null, result: 'bye', boardNumber: 999, teamMatchId
          });
        });
      }
    }
    return matches;
  }

  // For round > 1
  const { teamMatchPoints, teamGamePoints } = calculateTeamScores(tournament);
  const prevRoundMatches = tournament.matches.filter(m => m.round === round - 1);
  const teamMatchIds = Array.from(new Set(prevRoundMatches.map(m => m.teamMatchId).filter(Boolean)));
  
  const winners: string[] = [];
  teamMatchIds.forEach(tmid => {
    const matches = prevRoundMatches.filter(m => m.teamMatchId === tmid);
    const firstMatch = matches[0];
    if (!firstMatch) return;

    if (firstMatch.result === 'bye') {
      const team = tournament.teams.find(t => t.playerIds.includes(firstMatch.whiteId!));
      if (team) winners.push(team.id);
      return;
    }

    const teamWhite = tournament.teams.find(t => t.playerIds.includes(firstMatch.whiteId!));
    const teamBlack = tournament.teams.find(t => t.playerIds.includes(firstMatch.blackId!));
    
    if (teamWhite && teamBlack) {
      const mpW = teamMatchPoints[teamWhite.id] || 0;
      const mpB = teamMatchPoints[teamBlack.id] || 0;
      const gpW = teamGamePoints[teamWhite.id] || 0;
      const gpB = teamGamePoints[teamBlack.id] || 0;

      // This is tricky because calculateTeamScores is cumulative. 
      // We need to know who won THIS match.
      // Let's calculate just for this match.
      let matchGPW = 0;
      let matchGPB = 0;
      matches.forEach(m => {
        const isW = teamWhite.playerIds.includes(m.whiteId!);
        if (m.result === '1-0') { if (isW) matchGPW++; else matchGPB++; }
        else if (m.result === '0-1') { if (isW) matchGPB++; else matchGPW++; }
        else if (m.result === '0.5-0.5') { matchGPW += 0.5; matchGPB += 0.5; }
      });

      if (matchGPW > matchGPB) winners.push(teamWhite.id);
      else if (matchGPB > matchGPW) winners.push(teamBlack.id);
      else winners.push(teamWhite.id); // Tiebreak fallback
    }
  });

  const matches: Match[] = [];
  let boardNumber = 1;
  for (let i = 0; i < winners.length; i += 2) {
    const t1 = tournament.teams.find(t => t.id === winners[i])!;
    const t2 = tournament.teams.find(t => t.id === winners[i + 1]);
    const teamMatchId = uuidv4();

    if (t2) {
      const maxBoards = Math.max(t1.playerIds.length, t2.playerIds.length);
      for (let b = 0; b < maxBoards; b++) {
        const p1 = t1.playerIds[b];
        const p2 = t2.playerIds[b];
        const whiteId = b % 2 === 0 ? p1 : p2;
        const blackId = b % 2 === 0 ? p2 : p1;
        if (whiteId || blackId) {
          matches.push({
            id: uuidv4(), round, whiteId: whiteId || null, blackId: blackId || null, result: null, boardNumber: boardNumber++, teamMatchId
          });
        }
      }
    } else {
      t1.playerIds.forEach(pid => {
        matches.push({
          id: uuidv4(), round, whiteId: pid, blackId: null, result: 'bye', boardNumber: 999, teamMatchId
        });
      });
    }
  }
  return matches;
}

export function generateTeamSwiss(tournament: Tournament, round: number): Match[] {
  const { teamMatchPoints, teamGamePoints, teamPlayed, teamByes, teamColorHistory } = calculateTeamScores(tournament);
  
  const matches: Match[] = [];
  let boardNumber = 1;

  // Filter out empty teams
  let teamsToPair = tournament.teams.filter(t => t.playerIds.length > 0).sort((a, b) => {
    if (teamMatchPoints[b.id] !== teamMatchPoints[a.id]) {
      return teamMatchPoints[b.id] - teamMatchPoints[a.id];
    }
    return teamGamePoints[b.id] - teamGamePoints[a.id];
  });

  // Handle bye for odd number of teams
  if (teamsToPair.length % 2 !== 0) {
    let byeTeamIndex = teamsToPair.length - 1;
    while (byeTeamIndex >= 0 && teamByes.has(teamsToPair[byeTeamIndex].id)) {
      byeTeamIndex--;
    }
    if (byeTeamIndex < 0) byeTeamIndex = teamsToPair.length - 1;

    const byeTeam = teamsToPair[byeTeamIndex];
    const teamMatchId = uuidv4();
    
    // Give bye to all players in the team
    byeTeam.playerIds.forEach(pid => {
      matches.push({
        id: uuidv4(),
        round,
        whiteId: pid,
        blackId: null,
        result: 'bye',
        boardNumber: 999,
        teamMatchId
      });
    });
    
    teamsToPair.splice(byeTeamIndex, 1);
  }

  // Group by match points
  const scoreGroups: Map<number, Team[]> = new Map();
  teamsToPair.forEach(t => {
    const s = teamMatchPoints[t.id];
    if (!scoreGroups.has(s)) scoreGroups.set(s, []);
    scoreGroups.get(s)!.push(t);
  });

  const sortedScores = Array.from(scoreGroups.keys()).sort((a, b) => b - a);

  for (let i = 0; i < sortedScores.length; i++) {
    const currentScore = sortedScores[i];
    let group = scoreGroups.get(currentScore)!;

    if (group.length % 2 !== 0 && i < sortedScores.length - 1) {
      const nextScore = sortedScores[i + 1];
      const floater = group.pop()!;
      scoreGroups.get(nextScore)!.unshift(floater);
    }

    while (group.length > 1) {
      const t1 = group[0];
      let t2Index = -1;

      const half = Math.floor(group.length / 2);
      for (let j = half; j < group.length; j++) {
        if (!teamPlayed[t1.id].has(group[j].id)) {
          t2Index = j;
          break;
        }
      }

      if (t2Index === -1) {
        for (let j = 1; j < group.length; j++) {
          if (!teamPlayed[t1.id].has(group[j].id)) {
            t2Index = j;
            break;
          }
        }
      }

      if (t2Index === -1) t2Index = 1;

      const t2 = group[t2Index];

      // Assign colors for Board 1 based on history
      let teamWhite = t1;
      let teamBlack = t2;

      if (teamColorHistory[t1.id] > teamColorHistory[t2.id]) {
        teamWhite = t2;
        teamBlack = t1;
      } else if (teamColorHistory[t1.id] === teamColorHistory[t2.id]) {
        if (Math.random() > 0.5) {
          teamWhite = t2;
          teamBlack = t1;
        }
      }

      const teamMatchId = uuidv4();
      
      // Generate individual board matches
      const maxBoards = Math.max(teamWhite.playerIds.length, teamBlack.playerIds.length);
      for (let b = 0; b < maxBoards; b++) {
        const pWhite = teamWhite.playerIds[b];
        const pBlack = teamBlack.playerIds[b];
        
        // Alternate colors per board
        const actualWhiteId = b % 2 === 0 ? pWhite : pBlack;
        const actualBlackId = b % 2 === 0 ? pBlack : pWhite;

        if (actualWhiteId && actualBlackId) {
          matches.push({
            id: uuidv4(),
            round,
            whiteId: actualWhiteId,
            blackId: actualBlackId,
            result: null,
            boardNumber: boardNumber++,
            teamMatchId
          });
        } else if (actualWhiteId) {
          // Opponent missing on this board
          matches.push({
            id: uuidv4(),
            round,
            whiteId: actualWhiteId,
            blackId: null,
            result: 'bye', // Or forfeit win, but bye is simpler for missing opponent
            boardNumber: boardNumber++,
            teamMatchId
          });
        } else if (actualBlackId) {
          matches.push({
            id: uuidv4(),
            round,
            whiteId: actualBlackId,
            blackId: null,
            result: 'bye',
            boardNumber: boardNumber++,
            teamMatchId
          });
        }
      }

      group.splice(t2Index, 1);
      group.splice(0, 1);
    }
    
    if (group.length === 1 && i < sortedScores.length - 1) {
       const nextScore = sortedScores[i + 1];
       scoreGroups.get(nextScore)!.unshift(group[0]);
    }
  }

  return matches;
}
