// Interaction, progression and shared-board metrics: reducers over hand-built event logs, and the opt-in rule.
import { describe, expect, it } from 'vitest';
import type { Event, GameRecord } from '../engine/types.ts';
import { defaultConfig, defaultSharedConfig } from '../tiles/index.ts';
import { batch, placementValue } from '../sim/batch.ts';
import { computeMetrics } from '../sim/metrics.ts';

const config = defaultSharedConfig({ players: 2, endMode: 'turnCap', endValue: 2 });
const st = (a: number, b: number) => [{ player: 0, vp: a, coins: 0 }, { player: 1, vp: b, coins: 0 }];
const res = (player: number, delta: number, source: string, r: 'coins' | 'vp' = 'coins'): Event => ({ t: 'resource', player, res: r, delta, source });

function record(events: Event[], rounds = 2): GameRecord {
  return { seed: 1, config, bots: ['a', 'b'], actions: [], events, winner: 0, rounds };
}

const GAME: Event[] = [
  { t: 'shopRefilled', shop: [] },
  // round 1, player 0: corner income, a Market purchase, then pays player 1 a toll
  { t: 'rolled', player: 0, dice: [3], total: 3, round: 1 },
  { t: 'corner', player: 0, own: false, income: 2 },
  res(0, 2, 'corner'),
  { t: 'tileFired', player: 0, tile: 'market', trigger: 'onPass', owner: 1, slot: 5 },
  res(1, 1, 'market'), // civic income for the owner on someone else's turn
  { t: 'toll', payer: 0, owner: 1, tile: 'tollbooth', amount: 2 },
  res(0, -2, 'tollbooth'),
  res(1, 2, 'tollbooth'),
  res(0, -3, 'shrine'), // the purchase payment: not income, not interaction
  { t: 'bought', player: 0, item: 'shrine', cost: 3, slot: 4 },
  { t: 'roundEnded', round: 1, standings: st(0, 0) },
  // round 2, player 1: buys out player 0's Shrine, collects 8 coins of income in the round
  { t: 'rolled', player: 1, dice: [2], total: 2, round: 2 },
  res(1, 8, 'caravanserai'),
  res(1, -4, 'bridge'),
  res(0, 1, 'buyout'), // the displaced owner's refund: interaction, not income
  { t: 'bought', player: 1, item: 'bridge', cost: 4, slot: 4, displaced: 0 },
  res(1, -10, 'cathedral'),
  { t: 'bought', player: 1, item: 'cathedral', cost: 10, slot: 7 },
  res(1, 3, 'cathedral', 'vp'),
  res(0, 1, 'endgame', 'vp'), // not a turn: ignored
  { t: 'roundEnded', round: 2, standings: st(1, 3) },
  { t: 'gameEnded', reason: 'turnCap', winner: 1, rounds: 2 },
];

describe('extended metrics from an event log', () => {
  const m = computeMetrics([record(GAME)], config);

  it('interaction index: share of a player\'s coin and VP movement that happens on another player\'s turn', () => {
    // player 0: own turn 2 (corner) + 2 (toll paid) = 4; other turns 1 (refund) = 1 -> 0.2
    // player 1: other turns 1 + 2 = 3; own turn 8 coins + 3 VP = 11 (the purchases of 4 and 10, and
    // player 0's of 3, are spending and not counted; the endgame VP is not a turn) -> 3/14
    expect(m.interactionIndex).toBeCloseTo((1 / 5 + 3 / 14) / 2, 10);
  });

  it('toll share and corner share are fractions of the coins gained from tiles and corners', () => {
    // gross: 2 corner + 1 + 2 + 8 = 13 (the buyout refund is not income)
    expect(m.cornerShare).toBeCloseTo(2 / 13, 10);
    expect(m.tollShare).toBeCloseTo(2 / 13, 10);
  });

  it('engine online: the first round a player\'s income reached 8', () => {
    expect(m.progression!.engineOnlineRound).toBe(2);
    expect(m.progression!.engineOnlineRate).toBeCloseTo(0.5, 10);
  });

  it('buyouts, landmarks and the landmark buy rate', () => {
    expect(m.buyoutsPerGame).toBe(1);
    expect(m.landmarksPerGame).toBe(1);
    expect(m.landmarkBuyRate!['cathedral']).toBeCloseTo(1 / 2, 10);
    expect(m.landmarkBuyRate!['mint']).toBe(0);
  });

  it('progression: VP at checkpoint rounds, price per buy, and VP buys by third of the game', () => {
    // only the rounds that exist are reported (the log has rounds 1 and 2)
    expect(Object.keys(m.progression!.vpAtRound)).toEqual([]);
    // buys: shrine (round 1, 3c, VP), bridge (round 2, 4c, no), cathedral (round 2, 10c, VP via its effect)
    expect(m.progression!.buyCostByRound[3]).toBeCloseTo((3 + 4 + 10) / 3, 10);
    // two rounds in three thirds: round 1 -> third 0, round 2 -> third 1
    expect(m.progression!.vpBuyShareByThird[0]).toBe(1);
    expect(m.progression!.vpBuyShareByThird[1]).toBeCloseTo(1 / 2, 10);
    expect(Number.isNaN(m.progression!.vpBuyShareByThird[2])).toBe(true);
  });

  it('VP checkpoints average the players at the end of rounds 3, 5, 6, 9, 10, 12 and 15', () => {
    const events: Event[] = [{ t: 'shopRefilled', shop: [] }];
    for (let r = 1; r <= 6; r++) events.push({ t: 'rolled', player: 0, dice: [1], total: 1, round: r }, { t: 'roundEnded', round: r, standings: st(r, 2 * r) });
    events.push({ t: 'gameEnded', reason: 'turnCap', winner: 1, rounds: 6 });
    const p = computeMetrics([record(events, 6)], config).progression!;
    expect(p.vpAtRound[3]).toBeCloseTo((3 + 6) / 2, 10);
    expect(p.vpAtRound[6]).toBeCloseTo((6 + 12) / 2, 10);
    expect(p.vpAtRound[5]).toBeCloseTo((5 + 10) / 2, 10);
    expect(p.vpAtRound[9]).toBeUndefined();
  });
});

describe('opt-in, so loops reports stay as they were', () => {
  it('loops mode reports none of the new fields by default', () => {
    const m = batch({ games: 5 }).metrics;
    for (const k of ['interactionIndex', 'progression', 'tollShare', 'cornerShare', 'landmarksPerGame', 'landmarkBuyRate', 'buyoutsPerGame']) expect(m, k).not.toHaveProperty(k);
  });

  it('loops mode with extended reports interaction and progression only', () => {
    const m = batch({ games: 20 }, { extended: true }).metrics;
    expect(m.interactionIndex).toBeGreaterThanOrEqual(0);
    expect(m.progression!.vpAtRound[15]).toBeGreaterThan(0);
    expect(m).not.toHaveProperty('tollShare');
    expect(m).not.toHaveProperty('buyoutsPerGame');
  });

  it('shared mode reports all of them', () => {
    const m = batch({ games: 20, lineup: ['greedy', 'scorer', 'landlord', 'builder'], config: { boardMode: 'shared' } }).metrics;
    expect(m.interactionIndex).toBeGreaterThan(0);
    expect(m.interactionIndex).toBeLessThan(1);
    expect(m.cornerShare).toBeGreaterThan(0);
    expect(m.tollShare).toBeGreaterThanOrEqual(0);
    expect(m.buyoutsPerGame).toBeGreaterThanOrEqual(0);
    expect(Object.keys(m.landmarkBuyRate!)).toHaveLength(8);
    expect(m.progression!.engineOnlineRate).toBeGreaterThanOrEqual(0);
  });

  it('placementValue takes the board mode', () => {
    const r = placementValue({ games: 40 }, 'shared');
    expect(Number.isFinite(r.lift)).toBe(true);
    expect(defaultConfig().boardMode).toBe('loops');
  });
});
