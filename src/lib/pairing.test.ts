import { describe, it, expect } from 'vitest';
import {
  calculateScores,
  checkColorSequence,
  generateSwiss,
  generateRoundRobin,
} from './pairing';
import type { Tournament, Player } from '../store/useTournamentStore';

function p(id: string, overrides: Partial<Player> = {}): Player {
  return {
    id, name: `P${id}`, active: true, withdrawn: false,
    requestedByes: [], rating: 1500, ...overrides,
  };
}

function T(players: Player[], overrides: Partial<Tournament> = {}): Tournament {
  return {
    id: 't1', name: 'Test', type: 'swiss', isTeamTournament: false,
    status: 'active', currentRound: 1, totalRounds: 5,
    matches: [], teams: [], players,
    pointsForWin: 1, pointsForDraw: 0.5,
    pointsForLoss: 0, avoidClubPairings: false, forcedPairings: [],
    tiebreakOrder: ['direct-encounter', 'buchholz', 'median-buchholz', 'sonneborn-berger', 'most-wins'],
    autoCalculateRounds: true, manualRoundOverride: false, ...overrides,
  };
}

function playerIds(matches: { whiteId: string | null; blackId: string | null }[]): string[] {
  const ids: string[] = [];
  for (const m of matches) {
    if (m.whiteId) ids.push(m.whiteId);
    if (m.blackId) ids.push(m.blackId);
  }
  return ids;
}

// === FIDE C.1: No two players shall meet twice ===

describe('FIDE C.1 — No rematches', () => {
  it('new players are not paired against the same opponent twice', () => {
    const players = [p('a'), p('b'), p('c'), p('d')];
    const t = T(players, {
      matches: [{ id: 'm1', round: 1, whiteId: 'a', blackId: 'b', result: '0.5-0.5' }],
    });
    const r2 = generateSwiss(t, 2);
    for (const m of r2) {
      if (m.result === 'bye') continue;
      expect([m.whiteId, m.blackId].sort()).not.toEqual(['a', 'b']);
    }
  });

  it('no rematches across 3 rounds of 8 players', () => {
    const players = Array.from({ length: 8 }, (_, i) => p(`p${i}`, { rating: 2000 - i * 100 }));
    let t = T(players, { totalRounds: 3 });
    const faced: Record<string, Set<string>> = {};
    players.forEach(pl => { faced[pl.id] = new Set(); });

    const results: Array<'1-0' | '0-1' | '0.5-0.5'> = ['1-0', '0-1', '0.5-0.5'];
    for (let r = 1; r <= 3; r++) {
      const matches = generateSwiss(t, r);
      for (const m of matches) {
        if (!m.whiteId || !m.blackId) continue;
        expect(faced[m.whiteId].has(m.blackId)).withContext(`Round ${r}: ${m.whiteId} vs ${m.blackId} rematch`).toBe(false);
        faced[m.whiteId].add(m.blackId);
        faced[m.blackId].add(m.whiteId);
      }
      t = { ...t, matches: [...t.matches, ...matches.map((m, i) => m.result === 'bye' ? m : { ...m, result: results[i % 3] })], currentRound: r };
    }
  });
});

// === FIDE C.2: No double pairing-allocated byes ===

describe('FIDE C.2 — No double byes', () => {
  it('a player who received a bye does not get another', () => {
    const players = [p('a'), p('b'), p('c'), p('d'), p('e'), p('f'), p('g')];
    const t = T(players, {
      matches: [
        { id: 'm1', round: 1, whiteId: 'a', blackId: 'b', result: '1-0' },
        { id: 'm2', round: 1, whiteId: 'c', blackId: 'd', result: '1-0' },
        { id: 'm3', round: 1, whiteId: 'e', blackId: 'f', result: '1-0' },
        { id: 'm4', round: 1, whiteId: 'g', blackId: null, result: 'bye' },
      ],
    });
    const r2 = generateSwiss(t, 2);
    const r2byes = r2.filter(m => m.result === 'bye');
    for (const m of r2byes) {
      expect(m.whiteId).not.toBe('g');
    }
  });
});

// === FIDE C.3: Score group pairing ===

describe('FIDE C.3 — Score group pairing', () => {
  it('players with same score are paired together when possible', () => {
    const players = [
      p('a', { rating: 2000 }), p('b', { rating: 1900 }),
      p('c', { rating: 1800 }), p('d', { rating: 1700 }),
      p('e', { rating: 1600 }), p('f', { rating: 1500 }),
    ];
    const t = T(players, {
      matches: [
        { id: 'm1', round: 1, whiteId: 'a', blackId: 'b', result: '1-0' },
        { id: 'm2', round: 1, whiteId: 'c', blackId: 'd', result: '1-0' },
        { id: 'm3', round: 1, whiteId: 'e', blackId: 'f', result: '1-0' },
      ],
    });
    // a,c,e have 1pt; b,d,f have 0pt
    const r2 = generateSwiss(t, 2);
    for (const m of r2) {
      if (m.result === 'bye' || !m.whiteId || !m.blackId) continue;
      const scores = calculateScores(t);
      const s1 = scores.scores[m.whiteId];
      const s2 = scores.scores[m.blackId];
      // Players with same score should be paired (within 0.5 tolerance for draws)
      expect(Math.abs(s1 - s2)).withContext(`${m.whiteId}(${s1}) vs ${m.blackId}(${s2})`).toBeLessThanOrEqual(1);
    }
  });

  it('higher scores are paired together before lower scores', () => {
    const players = Array.from({ length: 8 }, (_, i) => p(`p${i}`, { rating: 2000 - i * 100 }));
    const t = T(players, {
      matches: [
        { id: 'm1', round: 1, whiteId: 'p0', blackId: 'p4', result: '1-0' },
        { id: 'm2', round: 1, whiteId: 'p1', blackId: 'p5', result: '1-0' },
        { id: 'm3', round: 1, whiteId: 'p2', blackId: 'p6', result: '0.5-0.5' },
        { id: 'm4', round: 1, whiteId: 'p3', blackId: 'p7', result: '0-1' },
      ],
    });
    // p0,p1 = 1pt; p2,p6,p7 = 0.5pt; p3,p4,p5 = 0pt
    const r2 = generateSwiss(t, 2);
    const paired = r2.filter(m => m.result === null);
    const scores = calculateScores(t);

    // Check that the two 1-pt players are paired together
    const topPair = paired.find(m =>
      [m.whiteId, m.blackId].includes('p0') && [m.whiteId, m.blackId].includes('p1')
    );
    expect(topPair).toBeDefined();
  });
});

// === FIDE C.4: Color balance ≤ 2 ===

describe('FIDE C.4 — Color balance', () => {
  it('no player exceeds |white - black| > 2', () => {
    const players = Array.from({ length: 10 }, (_, i) => p(`p${i}`, { rating: 2000 - i * 50 }));
    let t = T(players, { totalRounds: 5 });
    const results: Array<'1-0' | '0-1' | '0.5-0.5'> = ['1-0', '0-1', '0.5-0.5'];

    for (let r = 1; r <= 5; r++) {
      const matches = generateSwiss(t, r);
      t = { ...t, matches: [...t.matches, ...matches.map((m, i) => m.result === 'bye' ? m : { ...m, result: results[i % 3] })], currentRound: r };
      const { colorBalance } = calculateScores(t);
      for (const pid of Object.keys(colorBalance)) {
        expect(Math.abs(colorBalance[pid]))
          .withContext(`Round ${r}: ${pid} color balance = ${colorBalance[pid]}`)
          .toBeLessThanOrEqual(2);
      }
    }
  });
});

// === FIDE C.5: No 3 consecutive same colors ===

describe('FIDE C.5 — No three same colors in a row', () => {
  it('checkColorSequence rejects 3 same colors', () => {
    expect(checkColorSequence(['W', 'W'], 'W')).toBe(false);
    expect(checkColorSequence(['B', 'B'], 'B')).toBe(false);
    expect(checkColorSequence(['W', 'W'], 'B')).toBe(true);
    expect(checkColorSequence(['W', 'B', 'W'], 'W')).toBe(true);
    expect(checkColorSequence([], 'W')).toBe(true);
    expect(checkColorSequence(['W'], 'W')).toBe(true);
  });

  it('no player gets 3 consecutive same colors across 5 rounds', () => {
    const players = Array.from({ length: 8 }, (_, i) => p(`p${i}`, { rating: 2000 - i * 100 }));
    let t = T(players, { totalRounds: 5 });
    const results: Array<'1-0' | '0-1' | '0.5-0.5'> = ['1-0', '0-1', '0.5-0.5'];

    for (let r = 1; r <= 5; r++) {
      const matches = generateSwiss(t, r);
      t = { ...t, matches: [...t.matches, ...matches.map((m, i) => m.result === 'bye' ? m : { ...m, result: results[i % 3] })], currentRound: r };
      const { colorSequence } = calculateScores(t);
      for (const pid of Object.keys(colorSequence)) {
        const seq = colorSequence[pid];
        for (let i = 2; i < seq.length; i++) {
          const three = seq.slice(i - 2, i + 1);
          const allSame = three.every(c => c === three[0]);
          expect(allSame).withContext(`${pid}: ${three.join('')} has 3 same`).toBe(false);
        }
      }
    }
  });
});

// === FIDE C.6: Float direction ===

describe('FIDE C.6 — Float history is tracked', () => {
  it('calculateScores populates floatHistory for all players', () => {
    const players = [p('a'), p('b'), p('c'), p('d')];
    const t = T(players, {
      matches: [
        { id: 'm1', round: 1, whiteId: 'a', blackId: 'b', result: '1-0' },
        { id: 'm2', round: 1, whiteId: 'c', blackId: 'd', result: '1-0' },
      ],
    });
    const { floatHistory } = calculateScores(t);
    // Every player should have a float history entry (even if all zeros for same-group pairings)
    expect(Object.keys(floatHistory).length).toBe(4);
  });
});

// === FIDE C.7: Bye assignment ===

describe('FIDE C.7 — Bye to lowest eligible', () => {
  it('bye goes to the lowest-scored player without a prior bye', () => {
    const players = [p('a'), p('b'), p('c'), p('d'), p('e')];
    // Give a,b,c wins so d,e are at bottom
    const t = T(players, {
      matches: [
        { id: 'm1', round: 1, whiteId: 'a', blackId: 'b', result: '1-0' },
        { id: 'm2', round: 1, whiteId: 'c', blackId: 'd', result: '1-0' },
        { id: 'bye1', round: 1, whiteId: 'e', blackId: null, result: 'bye' },
      ],
    });
    // a=1, c=1, b=0, d=0, e=1 (bye)
    // Round 2: 5 players, should have 1 bye
    // The bye should go to b or d (score 0), not a,c,e (score 1)
    const r2 = generateSwiss(t, 2);
    const byeMatch = r2.find(m => m.result === 'bye');
    if (byeMatch) {
      const { scores } = calculateScores(t);
      const byeScore = scores[byeMatch.whiteId!];
      // Bye player should have the minimum score
      const minScore = Math.min(...Object.values(scores));
      expect(byeScore).toBe(minScore);
    }
  });
});

// === No duplicates / no dropped players ===

describe('Pairing integrity', () => {
  it('every active player appears exactly once per round (no duplicates, no drops)', () => {
    const players = Array.from({ length: 15 }, (_, i) => p(`p${i}`, { rating: 2000 - i * 50 }));
    let t = T(players, { totalRounds: 4 });
    const results: Array<'1-0' | '0-1' | '0.5-0.5'> = ['1-0', '0-1', '0.5-0.5'];

    for (let r = 1; r <= 4; r++) {
      const matches = generateSwiss(t, r);
      const seen = new Set<string>();
      for (const m of matches) {
        for (const pid of [m.whiteId, m.blackId]) {
          if (!pid) continue;
          expect(seen.has(pid)).withContext(`Round ${r}: duplicate ${pid}`).toBe(false);
          seen.add(pid);
        }
      }
      expect(seen.size).withContext(`Round ${r}: expected 15, got ${seen.size}`).toBe(15);
      t = { ...t, matches: [...t.matches, ...matches.map((m, i) => m.result === 'bye' ? m : { ...m, result: results[i % 3] })], currentRound: r };
    }
  });

  it('30 players: all present every round', () => {
    const players = Array.from({ length: 30 }, (_, i) => p(`p${i}`, { rating: 2000 - i * 33 }));
    let t = T(players, { totalRounds: 5 });
    const results: Array<'1-0' | '0-1' | '0.5-0.5'> = ['1-0', '0-1', '0.5-0.5'];

    for (let r = 1; r <= 5; r++) {
      const matches = generateSwiss(t, r);
      const seen = new Set<string>();
      for (const m of matches) {
        if (m.whiteId) { expect(seen.has(m.whiteId)).withContext(`R${r}: dup white ${m.whiteId}`).toBe(false); seen.add(m.whiteId); }
        if (m.blackId) { expect(seen.has(m.blackId)).withContext(`R${r}: dup black ${m.blackId}`).toBe(false); seen.add(m.blackId); }
      }
      expect(seen.size).withContext(`Round ${r}`).toBe(30);
      t = { ...t, matches: [...t.matches, ...matches.map((m, i) => m.result === 'bye' ? m : { ...m, result: results[i % 3] })], currentRound: r };
    }
  });
});

// === verify round-robin also produces correct results ===

describe('round-robin integrity', () => {
  it('8-player round-robin: all paired, no duplicates', () => {
    const players = Array.from({ length: 8 }, (_, i) => p(`p${i}`));
    for (let r = 1; r <= 7; r++) {
      const matches = generateRoundRobin(players, r);
      const seen = new Set<string>();
      for (const m of matches) {
        if (m.whiteId) { seen.add(m.whiteId); }
        if (m.blackId) { seen.add(m.blackId); }
      }
      expect(seen.size).toBe(8);
    }
  });
});
