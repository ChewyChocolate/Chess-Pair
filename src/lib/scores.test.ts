import { describe, it, expect, beforeEach } from 'vitest';
import { calculateScores, calculateTeamScores } from './scores';
import type { Tournament, Player, Match, Team } from '../store/useTournamentStore';

function p(id: string, overrides: Partial<Player> = {}): Player {
  return {
    id, name: `P${id}`, active: true, withdrawn: false,
    requestedByes: [], rating: 1500, ...overrides,
  };
}

function m(
  id: string,
  round: number,
  whiteId: string | null,
  blackId: string | null,
  result: Match['result'],
  overrides: Partial<Match> = {}
): Match {
  return { id, round, whiteId, blackId, result, ...overrides };
}

function makeTournament(
  players: Player[],
  matches: Match[] = [],
  teams: Team[] = [],
  overrides: Partial<Tournament> = {}
): Tournament {
  return {
    id: 't1',
    name: 'Test',
    type: 'swiss',
    isTeamTournament: false,
    autoCalculateRounds: true,
    manualRoundOverride: false,
    status: 'active',
    currentRound: 1,
    totalRounds: 5,
    players,
    teams,
    matches,
    pointsForWin: 1,
    pointsForDraw: 0.5,
    pointsForLoss: 0,
    avoidClubPairings: false,
    forcedPairings: [],
    tiebreakOrder: ['direct-encounter', 'buchholz', 'median-buchholz', 'sonneborn-berger', 'most-wins'],
    ...overrides,
  };
}

describe('calculateScores', () => {
  it('starts at zero for all players', () => {
    const t = makeTournament([p('a'), p('b')]);
    const { scores } = calculateScores(t);
    expect(scores['a']).toBe(0);
    expect(scores['b']).toBe(0);
  });

  it('awards win/loss points correctly', () => {
    const t = makeTournament(
      [p('a'), p('b')],
      [m('m1', 1, 'a', 'b', '1-0')]
    );
    const { scores } = calculateScores(t);
    expect(scores['a']).toBe(1);
    expect(scores['b']).toBe(0);
  });

  it('awards draw points correctly', () => {
    const t = makeTournament(
      [p('a'), p('b')],
      [m('m1', 1, 'a', 'b', '0.5-0.5')]
    );
    const { scores } = calculateScores(t);
    expect(scores['a']).toBe(0.5);
    expect(scores['b']).toBe(0.5);
  });

  it('handles forfeit results', () => {
    const t = makeTournament(
      [p('a'), p('b')],
      [m('m1', 1, 'a', 'b', 'forfeit-white')]
    );
    const { scores } = calculateScores(t);
    expect(scores['a']).toBe(0);
    expect(scores['b']).toBe(1);
  });

  it('gives full points for a bye', () => {
    const t = makeTournament(
      [p('a')],
      [m('m1', 1, 'a', null, 'bye')]
    );
    const { scores } = calculateScores(t);
    expect(scores['a']).toBe(1);
  });

  it('applies requested byes as draw points', () => {
    const t = makeTournament([p('a', { requestedByes: [1, 2] }), p('b')]);
    const { scores } = calculateScores(t);
    expect(scores['a']).toBe(1); // 2 * 0.5
  });

  it('applies penalty points', () => {
    const t = makeTournament(
      [p('a', { penaltyPoints: 0.5 }), p('b')],
      [m('m1', 1, 'a', 'b', '1-0')]
    );
    const { scores } = calculateScores(t);
    expect(scores['a']).toBe(0.5); // 1 - 0.5 penalty
  });

  it('respects upToRound parameter', () => {
    const t = makeTournament(
      [p('a'), p('b')],
      [
        m('m1', 1, 'a', 'b', '1-0'),
        m('m2', 2, 'a', 'b', '0-1'),
      ]
    );
    const { scores: r1 } = calculateScores(t, 1);
    expect(r1['a']).toBe(1);
    const { scores: r2 } = calculateScores(t, 2);
    expect(r2['a']).toBe(1);
    expect(r2['b']).toBe(1);
  });

  it('tracks color balance and sequence', () => {
    const t = makeTournament(
      [p('a'), p('b')],
      [m('m1', 1, 'a', 'b', '1-0')]
    );
    const { colorBalance, colorSequence } = calculateScores(t);
    expect(colorBalance['a']).toBe(1);
    expect(colorBalance['b']).toBe(-1);
    expect(colorSequence['a']).toEqual(['W']);
    expect(colorSequence['b']).toEqual(['B']);
  });

  it('tracks played opponents', () => {
    const t = makeTournament(
      [p('a'), p('b'), p('c')],
      [
        m('m1', 1, 'a', 'b', '1-0'),
        m('m2', 2, 'a', 'c', '0-1'),
      ]
    );
    const { played } = calculateScores(t);
    expect(played['a'].has('b')).toBe(true);
    expect(played['a'].has('c')).toBe(true);
    expect(played['b'].has('a')).toBe(true);
    expect(played['b'].has('c')).toBe(false);
  });

  it('computes float history correctly', () => {
    const players = [p('a', { rating: 2000 }), p('b', { rating: 1500 }), p('c', { rating: 1000 })];
    const t = makeTournament(
      players,
      [
        m('m1', 1, 'a', 'b', '1-0'), // After R1: a=1, b=0
        m('m2', 1, 'c', null, 'bye'), // After R1: c=1
        m('m3', 2, 'a', 'c', '1-0'), // After R2: a=2, c=1
        m('m4', 2, 'b', null, 'bye'), // After R2: b=1
      ]
    );
    const { floatHistory } = calculateScores(t);
    // Round 1 floats are based on pre-round scores (all 0) -> tied
    expect(floatHistory['a'][0]).toBe(0);
    expect(floatHistory['b'][0]).toBe(0);
    // c had a bye, no float entry for round 1
    expect(floatHistory['c'].length).toBe(1); // only round 2
    // Round 2: a (1) vs c (1) -> tied pre-round scores
    expect(floatHistory['a'][1]).toBe(0);
    expect(floatHistory['c'][0]).toBe(0); // c's first float entry is round 2
    // b had a bye in round 2, no float entry
    expect(floatHistory['b'].length).toBe(1); // only round 1
  });

  it('uses custom point values', () => {
    const t = makeTournament(
      [p('a'), p('b')],
      [m('m1', 1, 'a', 'b', '1-0')],
      [],
      { pointsForWin: 3, pointsForDraw: 1, pointsForLoss: 0 }
    );
    const { scores } = calculateScores(t);
    expect(scores['a']).toBe(3);
    expect(scores['b']).toBe(0);
  });
});

describe('calculateTeamScores', () => {
  function team(id: string, name: string, playerIds: string[]): Team {
    return { id, name, playerIds };
  }

  it('awards match points and game points correctly', () => {
    const t = makeTournament(
      [p('a'), p('b'), p('c'), p('d')],
      [
        m('m1', 1, 'a', 'c', '1-0', { teamMatchId: 'tm1' }),
        m('m2', 1, 'b', 'd', '0-1', { teamMatchId: 'tm1' }),
      ],
      [team('T1', 'Team 1', ['a', 'b']), team('T2', 'Team 2', ['c', 'd'])],
      { isTeamTournament: true }
    );
    const { teamMatchPoints, teamGamePoints } = calculateTeamScores(t);
    // T1: 1 win + 1 loss = 1 game point each? Wait, a beat c (1-0), b lost to d (0-1)
    // T1 game points = 1 + 0 = 1, T2 game points = 0 + 1 = 1
    // Draw in match points: 1 each
    expect(teamMatchPoints['T1']).toBe(1);
    expect(teamMatchPoints['T2']).toBe(1);
    expect(teamGamePoints['T1']).toBe(1);
    expect(teamGamePoints['T2']).toBe(1);
  });

  it('awards 2 match points for a winning team match', () => {
    const t = makeTournament(
      [p('a'), p('b'), p('c'), p('d')],
      [
        m('m1', 1, 'a', 'c', '1-0', { teamMatchId: 'tm1' }),
        m('m2', 1, 'b', 'd', '1-0', { teamMatchId: 'tm1' }),
      ],
      [team('T1', 'Team 1', ['a', 'b']), team('T2', 'Team 2', ['c', 'd'])],
      { isTeamTournament: true }
    );
    const { teamMatchPoints, teamGamePoints } = calculateTeamScores(t);
    expect(teamMatchPoints['T1']).toBe(2);
    expect(teamMatchPoints['T2']).toBe(0);
    expect(teamGamePoints['T1']).toBe(2);
    expect(teamGamePoints['T2']).toBe(0);
  });

  it('awards 2 match points for a team bye', () => {
    const t = makeTournament(
      [p('a'), p('b')],
      [
        m('m1', 1, 'a', null, 'bye', { teamMatchId: 'tm1' }),
        m('m2', 1, 'b', null, 'bye', { teamMatchId: 'tm1' }),
      ],
      [team('T1', 'Team 1', ['a', 'b'])],
      { isTeamTournament: true }
    );
    const { teamMatchPoints, teamByes } = calculateTeamScores(t);
    expect(teamMatchPoints['T1']).toBe(2);
    expect(teamByes.has('T1')).toBe(true);
  });

  it('tracks team played opponents', () => {
    const t = makeTournament(
      [p('a'), p('b'), p('c'), p('d')],
      [
        m('m1', 1, 'a', 'c', '1-0', { teamMatchId: 'tm1' }),
        m('m2', 1, 'b', 'd', '0-1', { teamMatchId: 'tm1' }),
      ],
      [team('T1', 'Team 1', ['a', 'b']), team('T2', 'Team 2', ['c', 'd'])],
      { isTeamTournament: true }
    );
    const { teamPlayed } = calculateTeamScores(t);
    expect(teamPlayed['T1'].has('T2')).toBe(true);
    expect(teamPlayed['T2'].has('T1')).toBe(true);
  });
});
