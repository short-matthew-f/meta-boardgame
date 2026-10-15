import { describe, expect, it } from 'vitest';
import { batch, resolveConfig, runGames, seatOrder, type BatchSpec } from '../sim/batch.ts';
import { computeMetrics, decidedRound } from '../sim/metrics.ts';
import { replay } from '../sim/runner.ts';
import type { GameRecord } from '../engine/types.ts';

describe('batch runner and metrics', () => {
  it('rotateSeats gives each bot every seat equally often', () => {
    const lineup = ['greedy', 'scorer', 'aggressor', 'turtle'];
    const counts: Record<string, number[]> = Object.fromEntries(lineup.map((n) => [n, [0, 0, 0, 0]]));
    for (let i = 0; i < 40; i++) seatOrder(lineup, i, true).forEach((n, seat) => counts[n]![seat]!++);
    for (const n of lineup) expect(counts[n]).toEqual([10, 10, 10, 10]);
    expect(seatOrder(lineup, 3, false)).toEqual(lineup);
  });

  it('metrics from stored events equal metrics from a re-simulation of the same seeds', () => {
    const spec: BatchSpec = { games: 30, seedStart: 100, lineup: ['greedy', 'scorer', 'random'], rotateSeats: true, config: {} };
    const config = resolveConfig(spec);
    const records = runGames(spec);
    const fromStored = computeMetrics(records, config);
    const resim: GameRecord[] = records.map((r) => {
      const { events, state } = replay(r.seed, config, r.actions);
      return { ...r, events, winner: state.winner!, rounds: state.round };
    });
    const fromResim = computeMetrics(resim, config);
    expect(fromResim).toEqual(fromStored);
    expect(fromStored.games).toBe(30);
    expect(Object.keys(fromStored.winRateByBot).sort()).toEqual(['greedy', 'random', 'scorer']);
  });

  it('decidedRound finds the first round the winner holds the lead for good', () => {
    const standings = (a: number, b: number) => [{ player: 0, vp: a, coins: 0 }, { player: 1, vp: b, coins: 0 }];
    const events = [
      { t: 'roundEnded' as const, round: 1, standings: standings(1, 0) },
      { t: 'roundEnded' as const, round: 2, standings: standings(1, 2) },
      { t: 'roundEnded' as const, round: 3, standings: standings(3, 2) },
      { t: 'roundEnded' as const, round: 4, standings: standings(5, 2) },
      { t: 'gameEnded' as const, reason: 'turnCap', winner: 0, rounds: 4 },
    ];
    expect(decidedRound(events, 0)).toBe(3);
    expect(decidedRound(events, 1)).toBe(4);
  });

  it('a 4-bot batch reports win rates that sum to one and problems as strings', () => {
    const r = batch({ games: 20, seedStart: 1 });
    const total = Object.values(r.metrics.winRateByBot).reduce((n, s) => n + s.wins, 0);
    expect(total).toBe(20);
    expect(r.metrics.winRateBySeat.reduce((n, s) => n + s.wins, 0)).toBe(20);
    expect(Array.isArray(r.problems)).toBe(true);
    expect(r.metrics.lopsided.length).toBeLessThanOrEqual(10);
  });
});
