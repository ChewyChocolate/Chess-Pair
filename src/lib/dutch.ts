import { Match, Player, Tournament } from '../store/useTournamentStore';
import { v4 as uuidv4 } from 'uuid';
import { calculateScores } from './pairing';
import { calculateStandings } from './tiebreaks';

export type DutchConstraints = {
  played: Record<string, Set<string>>;
  colorBalance: Record<string, number>;
  colorSequence: Record<string, ('W' | 'B')[]>;
  floatHistory: Record<string, number[]>;
  byes: Set<string>;
  avoidClubPairings: boolean;
  isLastRound: boolean;
};

/**
 * Calculate a player's "due color" under FIDE rules.
 * Priority: 1) Strict alternation, 2) Color balance (odd games → prefer 0 balance)
 */
export function calculateDueColor(
  colorSequence: ('W' | 'B')[],
  colorBalance: number
): 'W' | 'B' | null {
  // If no history, no due color
  if (!colorSequence || colorSequence.length === 0) return null;

  const len = colorSequence.length;

  // Alternation preference: W-B-W → due B; B-W-B → due W
  if (len >= 2) {
    const last = colorSequence[len - 1];
    const secondLast = colorSequence[len - 2];
    if (last !== secondLast) {
      // Strict alternation pattern exists
      return last === 'W' ? 'B' : 'W';
    }
  }

  // Balance-based due color:
  // - If odd games played, prefer the color that brings balance to 0
  // - If even games played and |balance| >= 2, the other color is strongly due
  const isOddGames = len % 2 !== 0;

  if (isOddGames) {
    // With odd games, we want the color that makes balance 0
    if (colorBalance > 0) return 'B';  // More white → need black
    if (colorBalance < 0) return 'W';  // More black → need white
  } else {
    // With even games, strict balance correction only if |bal| >= 2
    if (colorBalance >= 2) return 'B';
    if (colorBalance <= -2) return 'W';
  }

  return null;
}

/**
 * Check if adding a color would create 3 in a row
 */
function wouldMakeThreeInARow(seq: ('W' | 'B')[], color: 'W' | 'B'): boolean {
  if (!seq || seq.length < 2) return false;
  const lastTwo = seq.slice(-2);
  return lastTwo[0] === color && lastTwo[1] === color;
}

/**
 * Check if two players can be paired under FIDE Dutch constraints
 */
export function canPairDutch(
  p1: Player,
  p2: Player,
  constraints: DutchConstraints,
  relaxColors: boolean = false,
  relaxFloats: boolean = false
): { valid: boolean; whiteId: string; blackId: string } | null {
  const { played, colorBalance, colorSequence, floatHistory, avoidClubPairings, isLastRound } = constraints;

  // 1. No rematches
  if (played[p1.id].has(p2.id)) return null;

  // 2. Club avoidance
  if (avoidClubPairings && p1.club && p2.club && p1.club === p2.club) return null;

  // 3. Calculate due colors
  const p1Due = calculateDueColor(colorSequence[p1.id], colorBalance[p1.id]);
  const p2Due = calculateDueColor(colorSequence[p2.id], colorBalance[p2.id]);

  // 4. Determine who gets white based on FIDE color rules
  // Higher pairing number gets preference
  const p1PN = p1.pairingNumber || 999;
  const p2PN = p2.pairingNumber || 999;

  let whiteId: string;
  let blackId: string;

  // Try both color assignments and pick the valid one
  const tryAssignment = (w: Player, b: Player): boolean => {
    // Check color sequence (no 3 in a row)
    if (!relaxColors) {
      if (wouldMakeThreeInARow(colorSequence[w.id], 'W')) return false;
      if (wouldMakeThreeInARow(colorSequence[b.id], 'B')) return false;
    }

    // Check color balance (<= 2 absolute)
    if (!relaxColors) {
      const newBalW = colorBalance[w.id] + 1;
      const newBalB = colorBalance[b.id] - 1;
      if (Math.abs(newBalW) > 2 || Math.abs(newBalB) > 2) return false;
    }

    // Check float direction
    // Note: Float validation is handled more rigorously at the bracket level
    // where we know the exact score groups. Here we only do basic checks.

    return true;
  };

  // Determine preferred assignment based on due colors
  let preferP1White = false;

  if (p1Due && !p2Due) {
    preferP1White = p1Due === 'W';
  } else if (!p1Due && p2Due) {
    preferP1White = p2Due === 'B';
  } else if (p1Due && p2Due) {
    if (p1Due === p2Due) {
      // Conflict: lower pairing number (higher ranked) gets preference
      preferP1White = p1PN < p2PN ? p1Due === 'W' : p2Due === 'B';
    } else {
      // Different due colors - both can be satisfied
      preferP1White = p1Due === 'W';
    }
  } else {
    // Neither has strong preference; use color balance as tiebreak
    const p1Bal = colorBalance[p1.id] || 0;
    const p2Bal = colorBalance[p2.id] || 0;
    if (p1Bal > p2Bal) {
      preferP1White = false; // p1 has more white, so p1 should get black
    } else if (p1Bal < p2Bal) {
      preferP1White = true; // p1 has more black, so p1 should get white
    } else {
      // Equal balance; lower pairing number (higher ranked) gets preference
      preferP1White = p1PN < p2PN;
    }
  }

  // Try preferred assignment first
  const p1AsWhite = preferP1White;
  if (tryAssignment(p1AsWhite ? p1 : p2, p1AsWhite ? p2 : p1)) {
    whiteId = p1AsWhite ? p1.id : p2.id;
    blackId = p1AsWhite ? p2.id : p1.id;
  } else if (tryAssignment(p1AsWhite ? p2 : p1, p1AsWhite ? p1 : p2)) {
    // Try reversed assignment
    whiteId = p1AsWhite ? p2.id : p1.id;
    blackId = p1AsWhite ? p1.id : p2.id;
  } else {
    return null; // Neither color assignment works
  }

  return { valid: true, whiteId, blackId };
}

/**
 * Try to pair S1 with S2 directly (S1[i] vs S2[i])
 */
function tryDirectPairing(
  S1: Player[],
  S2: Player[],
  constraints: DutchConstraints,
  relaxColors: boolean = false,
  relaxFloats: boolean = false
): { pairs: { whiteId: string; blackId: string }[] } | null {
  if (S1.length !== S2.length) return null;

  const pairs: { whiteId: string; blackId: string }[] = [];

  for (let i = 0; i < S1.length; i++) {
    const result = canPairDutch(S1[i], S2[i], constraints, relaxColors, relaxFloats);
    if (!result) return null;
    pairs.push({ whiteId: result.whiteId, blackId: result.blackId });
  }

  return { pairs };
}

/**
 * Generate all transpositions (permutations) of arr
 * For small arrays only; for larger arrays we use a bounded approach
 */
function* generateTranspositions(arr: Player[]): Generator<Player[]> {
  if (arr.length <= 1) {
    yield [...arr];
    return;
  }

  // For small arrays (<= 6), generate all permutations
  // For larger arrays, use a heuristic approach
  if (arr.length <= 6) {
    const used = new Array(arr.length).fill(false);
    const current: Player[] = [];

    function* backtrack(): Generator<Player[]> {
      if (current.length === arr.length) {
        yield [...current];
        return;
      }
      for (let i = 0; i < arr.length; i++) {
        if (used[i]) continue;
        used[i] = true;
        current.push(arr[i]);
        yield* backtrack();
        current.pop();
        used[i] = false;
      }
    }

    yield* backtrack();
  } else {
    // For larger S2, try a limited set of transpositions
    // Start with original, then try swapping adjacent pairs
    yield [...arr];
    for (let i = 0; i < arr.length - 1; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const swapped = [...arr];
        [swapped[i], swapped[j]] = [swapped[j], swapped[i]];
        yield swapped;
      }
    }
  }
}

/**
 * Try transpositions of S2 to find a valid pairing
 */
function tryTranspositions(
  S1: Player[],
  S2: Player[],
  constraints: DutchConstraints,
  relaxColors: boolean = false,
  relaxFloats: boolean = false
): { pairs: { whiteId: string; blackId: string }[] } | null {
  for (const permutedS2 of generateTranspositions(S2)) {
    const result = tryDirectPairing(S1, permutedS2, constraints, relaxColors, relaxFloats);
    if (result) return result;
  }
  return null;
}

/**
 * Try exchanges between S1 and S2
 */
function tryExchanges(
  S1: Player[],
  S2: Player[],
  constraints: DutchConstraints,
  relaxColors: boolean = false,
  relaxFloats: boolean = false
): { pairs: { whiteId: string; blackId: string }[]; newS1: Player[]; newS2: Player[] } | null {
  const maxExchange = Math.min(Math.floor(S1.length / 2), Math.floor(S2.length / 2));

  for (let exchangeCount = 1; exchangeCount <= maxExchange; exchangeCount++) {
    // Try all combinations of exchangeCount players from S1 and S2
    const s1Indices = getCombinations(S1.length, exchangeCount);
    const s2Indices = getCombinations(S2.length, exchangeCount);

    for (const s1Combo of s1Indices) {
      for (const s2Combo of s2Indices) {
        // Create new S1 and S2 with exchanged players
        const newS1 = [...S1];
        const newS2 = [...S2];

        // Swap: remove from S1, add to S2, and vice versa
        const s1Removed = s1Combo.map(i => newS1[i]).sort((a, b) => (a.pairingNumber || 999) - (b.pairingNumber || 999));
        const s2Removed = s2Combo.map(i => newS2[i]).sort((a, b) => (a.pairingNumber || 999) - (b.pairingNumber || 999));

        // Build new arrays
        const remainingS1 = newS1.filter((_, i) => !s1Combo.includes(i));
        const remainingS2 = newS2.filter((_, i) => !s2Combo.includes(i));

        const exchangedS1 = [...remainingS1, ...s2Removed];
        const exchangedS2 = [...remainingS2, ...s1Removed];

        // Sort by pairing number to maintain order
        exchangedS1.sort((a, b) => (a.pairingNumber || 999) - (b.pairingNumber || 999));
        exchangedS2.sort((a, b) => (a.pairingNumber || 999) - (b.pairingNumber || 999));

        const result = tryTranspositions(exchangedS1, exchangedS2, constraints, relaxColors, relaxFloats);
        if (result) {
          return { pairs: result.pairs, newS1: exchangedS1, newS2: exchangedS2 };
        }
      }
    }
  }

  return null;
}

/**
 * Get all combinations of k indices from 0 to n-1
 */
function getCombinations(n: number, k: number): number[][] {
  if (k === 0) return [[]];
  if (k > n) return [];

  const result: number[][] = [];

  function backtrack(start: number, current: number[]) {
    if (current.length === k) {
      result.push([...current]);
      return;
    }
    for (let i = start; i < n; i++) {
      current.push(i);
      backtrack(i + 1, current);
      current.pop();
    }
  }

  backtrack(0, []);
  return result;
}

/**
 * Pair a single score bracket using FIDE Dutch System
 */
function pairBracket(
  players: Player[],
  constraints: DutchConstraints,
  isLastBracket: boolean
): { pairs: { whiteId: string; blackId: string }[]; unpaired: Player[] } {
  if (players.length === 0) return { pairs: [], unpaired: [] };

  // Sort by pairing number (ascending) within the bracket
  const sorted = [...players].sort((a, b) => (a.pairingNumber || 999) - (b.pairingNumber || 999));

  // Handle odd number: try each player as floater, prefer lowest-ranked
  if (sorted.length % 2 !== 0) {
    for (let i = sorted.length - 1; i >= 0; i--) {
      const floater = sorted[i];
      const remaining = sorted.slice(0, i).concat(sorted.slice(i + 1));
      const result = pairBracketEven(remaining, constraints, isLastBracket);
      if (result.unpaired.length === 0) {
        return { pairs: result.pairs, unpaired: [floater] };
      }
    }
    // If no single floater works, force-float the last player
    const floater = sorted[sorted.length - 1];
    const remaining = sorted.slice(0, -1);
    const result = pairBracketEven(remaining, constraints, isLastBracket);
    return { pairs: result.pairs, unpaired: [floater, ...result.unpaired] };
  }

  return pairBracketEven(sorted, constraints, isLastBracket);
}

/**
 * Full backtracking pairing for a bracket.
 * Tries to pair the first player with every other valid player recursively.
 * More reliable than S1/S2 for complex brackets.
 */
function tryBacktrackPairing(
  players: Player[],
  constraints: DutchConstraints,
  relaxColors: boolean = false,
  relaxFloats: boolean = false
): { pairs: { whiteId: string; blackId: string }[] } | null {
  if (players.length === 0) return { pairs: [] };
  if (players.length % 2 !== 0) return null;

  const p1 = players[0];

  for (let i = 1; i < players.length; i++) {
    const p2 = players[i];
    const pairResult = canPairDutch(p1, p2, constraints, relaxColors, relaxFloats);
    if (!pairResult) continue;

    const remaining = players.slice(1, i).concat(players.slice(i + 1));
    const subResult = tryBacktrackPairing(remaining, constraints, relaxColors, relaxFloats);
    if (subResult) {
      return { pairs: [pairResult, ...subResult.pairs] };
    }
  }

  return null;
}

/**
 * Pair an even-sized bracket
 */
function pairBracketEven(
  players: Player[],
  constraints: DutchConstraints,
  isLastBracket: boolean
): { pairs: { whiteId: string; blackId: string }[]; unpaired: Player[] } {
  const n = players.length;
  const mid = Math.ceil(n / 2);
  const S1 = players.slice(0, mid);
  const S2 = players.slice(mid);

  // Try strict pairing first
  let result = tryDirectPairing(S1, S2, constraints, false, false);
  if (result) return { pairs: result.pairs, unpaired: [] };

  // Try transpositions
  result = tryTranspositions(S1, S2, constraints, false, false);
  if (result) return { pairs: result.pairs, unpaired: [] };

  // Try exchanges
  let exchangeResult = tryExchanges(S1, S2, constraints, false, false);
  if (exchangeResult) return { pairs: exchangeResult.pairs, unpaired: [] };

  // Fallback: full backtracking search on the entire bracket
  const backtrackResult = tryBacktrackPairing(players, constraints, false, false);
  if (backtrackResult) return { pairs: backtrackResult.pairs, unpaired: [] };

  // Relax color constraints
  result = tryDirectPairing(S1, S2, constraints, true, false);
  if (result) return { pairs: result.pairs, unpaired: [] };

  result = tryTranspositions(S1, S2, constraints, true, false);
  if (result) return { pairs: result.pairs, unpaired: [] };

  exchangeResult = tryExchanges(S1, S2, constraints, true, false);
  if (exchangeResult) return { pairs: exchangeResult.pairs, unpaired: [] };

  const backtrackRelaxColors = tryBacktrackPairing(players, constraints, true, false);
  if (backtrackRelaxColors) return { pairs: backtrackRelaxColors.pairs, unpaired: [] };

  // If last bracket, also relax floats
  if (isLastBracket) {
    result = tryDirectPairing(S1, S2, constraints, true, true);
    if (result) return { pairs: result.pairs, unpaired: [] };

    result = tryTranspositions(S1, S2, constraints, true, true);
    if (result) return { pairs: result.pairs, unpaired: [] };

    exchangeResult = tryExchanges(S1, S2, constraints, true, true);
    if (exchangeResult) return { pairs: exchangeResult.pairs, unpaired: [] };

    const backtrackRelaxAll = tryBacktrackPairing(players, constraints, true, true);
    if (backtrackRelaxAll) return { pairs: backtrackRelaxAll.pairs, unpaired: [] };
  }

  // If still impossible, float the lowest-ranked player down
  if (players.length > 2) {
    const floater = players[players.length - 1];
    const remaining = players.slice(0, -1);
    const subResult = pairBracketEven(remaining, constraints, isLastBracket);
    return { pairs: subResult.pairs, unpaired: [floater, ...subResult.unpaired] };
  }

  // Absolute fallback: return all unpaired
  return { pairs: [], unpaired: players };
}

/**
 * Main FIDE Dutch System pairing function
 */
export function dutchPairing(tournament: Tournament, round: number): Match[] | null {
  const { scores, played, colorBalance, colorSequence, floatHistory, byes } = calculateScores(tournament);

  // Ensure all active players have pairing numbers (derive from rating if missing)
  const needsPN = tournament.players.filter(p => p.active && !p.withdrawn && !p.pairingNumber);
  if (needsPN.length > 0) {
    const rated = needsPN.filter(p => p.rating).sort((a, b) => (b.rating || 0) - (a.rating || 0));
    const unrated = needsPN.filter(p => !p.rating);
    const maxExistingPN = Math.max(0, ...tournament.players.map(p => p.pairingNumber || 0));
    rated.forEach((p, i) => { (p as any).pairingNumber = maxExistingPN + i + 1; });
    unrated.forEach((p, i) => { (p as any).pairingNumber = maxExistingPN + rated.length + i + 1; });
  }

  const matches: Match[] = [];
  const existingRoundMatches = tournament.matches.filter(m => m.round === round);
  let boardNumber = 1;

  if (existingRoundMatches.length > 0) {
    boardNumber = Math.max(...existingRoundMatches.map(m => m.boardNumber || 0)) + 1;
    if (boardNumber === 1000) boardNumber = 1;
  }

  const pairedPlayers = new Set<string>();

  // Process forced pairings first
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

  // Filter active players
  let playersToPair = tournament.players.filter(p =>
    p.active && !p.withdrawn && (!p.requestedByes || !p.requestedByes.includes(round)) && !pairedPlayers.has(p.id)
  );

  // Handle bye for odd number of players
  if (playersToPair.length % 2 !== 0) {
    // Find lowest score group, then highest pairing number among unbyed players
    const sortedByScore = [...playersToPair].sort((a, b) => scores[a.id] - scores[b.id]);
    const minScore = scores[sortedByScore[0].id];
    const lowestGroup = sortedByScore.filter(p => scores[p.id] === minScore);

    let byePlayer: Player | null = null;
    // First, try to find someone who hasn't had a bye
    const unbyed = lowestGroup.filter(p => !byes.has(p.id));
    if (unbyed.length > 0) {
      // Highest pairing number in the lowest score group (FIDE: bottom of list)
      byePlayer = unbyed.reduce((max, p) => (p.pairingNumber || 0) > (max.pairingNumber || 0) ? p : max);
    } else {
      // Everyone in lowest group has had a bye; try all players
      const allUnbyed = playersToPair.filter(p => !byes.has(p.id));
      if (allUnbyed.length > 0) {
        const allMinScore = Math.min(...allUnbyed.map(p => scores[p.id]));
        const allLowest = allUnbyed.filter(p => scores[p.id] === allMinScore);
        byePlayer = allLowest.reduce((max, p) => (p.pairingNumber || 0) > (max.pairingNumber || 0) ? p : max);
      } else {
        // Everyone has had a bye; give to highest pairing number in lowest score group
        byePlayer = lowestGroup.reduce((max, p) => (p.pairingNumber || 0) > (max.pairingNumber || 0) ? p : max);
      }
    }

    if (byePlayer) {
      matches.push({
        id: uuidv4(),
        round,
        whiteId: byePlayer.id,
        blackId: null,
        result: 'bye',
        boardNumber: 999,
      });
      pairedPlayers.add(byePlayer.id);
      playersToPair = playersToPair.filter(p => p.id !== byePlayer!.id);
    }
  }

  // Build constraints object
  const constraints: DutchConstraints = {
    played,
    colorBalance,
    colorSequence,
    floatHistory,
    byes,
    avoidClubPairings: tournament.avoidClubPairings,
    isLastRound: round === tournament.totalRounds,
  };

  // Group players by score
  const scoreGroups: Map<number, Player[]> = new Map();
  playersToPair.forEach(p => {
    const s = scores[p.id];
    if (!scoreGroups.has(s)) scoreGroups.set(s, []);
    scoreGroups.get(s)!.push(p);
  });

  const sortedScores = Array.from(scoreGroups.keys()).sort((a, b) => b - a);
  let floaters: Player[] = [];
  const allPairs: { whiteId: string; blackId: string }[] = [];

  for (let i = 0; i < sortedScores.length; i++) {
    const score = sortedScores[i];
    let group = [...(scoreGroups.get(score) || []), ...floaters];
    floaters = [];

    // Sort within group by pairing number
    group.sort((a, b) => (a.pairingNumber || 999) - (b.pairingNumber || 999));

    const isLastBracket = i === sortedScores.length - 1;
    const result = pairBracket(group, constraints, isLastBracket);

    allPairs.push(...result.pairs);
    floaters = result.unpaired;
  }

  // If there are still unpaired floaters at the end, something went wrong
  if (floaters.length > 0) {
    console.warn('Dutch pairing: unpaired floaters remain:', floaters.map(p => p.name));
    return null; // Signal fallback needed
  }

  // Build Match objects
  allPairs.forEach(pair => {
    matches.push({
      id: uuidv4(),
      round,
      whiteId: pair.whiteId,
      blackId: pair.blackId,
      result: null,
      boardNumber: 0,
    });
  });

  // Sort matches by the highest-ranked player on each board
  // Use official tournament standings (with all tiebreaks) for exact consistency
  const standings = calculateStandings(tournament);
  const playerRank: Record<string, number> = {};
  standings.forEach((s, i) => { playerRank[s.id] = i + 1; });

  matches.sort((a, b) => {
    if (a.result === 'bye' && b.result !== 'bye') return 1;
    if (b.result === 'bye' && a.result !== 'bye') return -1;
    if (a.result === 'bye' && b.result === 'bye') return 0;
    const aBest = Math.min(playerRank[a.whiteId!] || 999, playerRank[a.blackId!] || 999);
    const bBest = Math.min(playerRank[b.whiteId!] || 999, playerRank[b.blackId!] || 999);
    return aBest - bBest;
  });

  for (let i = 0; i < matches.length; i++) {
    if (matches[i].result !== 'bye') matches[i].boardNumber = i + 1;
    else matches[i].boardNumber = 999;
  }

  return matches;
}
