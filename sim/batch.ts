import type { DieSpec, GameConfig, GameRecord } from '../engine/types.ts';
import { botByName } from '../bots/index.ts';
import { defaultConfig, defaultSharedConfig } from '../tiles/index.ts';
import { playGame } from './runner.ts';
import { computeMetrics, flagProblems, type Metrics } from './metrics.ts';

export type BatchSpec = {
  games: number;
  seedStart: number;
  lineup: string[];
  rotateSeats: boolean;
  config: Partial<GameConfig>;
};

export type BatchReport = {
  spec: BatchSpec;
  config: { players: number; endMode: string; endValue: number };
  metrics: Metrics;
  problems: string[];
  elapsedMs: number;
};

export const DEFAULT_SPEC: BatchSpec = { games: 1000, seedStart: 1, lineup: ['greedy', 'scorer', 'aggressor', 'turtle'], rotateSeats: true, config: {} };

/** Seat assignment for game i: rotate the lineup so every bot sees every seat equally often. */
export function seatOrder(lineup: string[], i: number, rotate: boolean): string[] {
  if (!rotate) return lineup;
  const n = lineup.length;
  const k = i % n;
  return lineup.map((_, seat) => lineup[(seat + k) % n]!);
}

export function resolveConfig(spec: BatchSpec): GameConfig {
  if (spec.config.boardMode === 'shared') return defaultSharedConfig({ players: spec.lineup.length, ...spec.config });
  return defaultConfig({ players: spec.lineup.length, ...spec.config });
}

export function runGames(spec: BatchSpec, onGame?: (rec: GameRecord, i: number) => void): GameRecord[] {
  const config = resolveConfig(spec);
  const records: GameRecord[] = [];
  for (let i = 0; i < spec.games; i++) {
    const names = seatOrder(spec.lineup, i, spec.rotateSeats);
    const rec = playGame(spec.seedStart + i, names.map(botByName), config);
    records.push(rec);
    onGame?.(rec, i);
  }
  return records;
}

export function batch(partial: Partial<BatchSpec> = {}, opts: { placementLift?: number } = {}): BatchReport {
  const spec: BatchSpec = { ...DEFAULT_SPEC, ...partial };
  const config = resolveConfig(spec);
  const t0 = performance.now();
  const records = runGames(spec);
  const metrics = computeMetrics(records, config);
  return {
    spec,
    config: { players: config.players, endMode: config.endMode, endValue: config.endValue },
    metrics,
    problems: flagProblems(metrics, config, opts),
    elapsedMs: performance.now() - t0,
  };
}

/**
 * Placement value: Greedy's win rate with landing-slot placement minus its
 * win rate with random placement, in the same lineup and seeds. Points.
 */
export function placementValue(partial: Partial<BatchSpec> = {}): { withPlacement: number; withoutPlacement: number; lift: number } {
  const spec: BatchSpec = { ...DEFAULT_SPEC, ...partial };
  if (!spec.lineup.includes('greedy')) throw new Error('placementValue needs greedy in the lineup');
  const a = batch(spec).metrics.winRateByBot['greedy']!.rate;
  const b = batch({ ...spec, lineup: spec.lineup.map((n) => (n === 'greedy' ? 'greedy-random' : n)) }).metrics.winRateByBot['greedy-random']!.rate;
  return { withPlacement: a, withoutPlacement: b, lift: (a - b) * 100 };
}

/** `2d6` is two six-sided dice; `d8` is one eight-sided die; `2d6+1d4` lists several groups. */
export function parseDice(text: string): DieSpec[] {
  const dice: DieSpec[] = [];
  for (const part of text.split('+')) {
    const m = /^(\d*)d(\d+)$/.exec(part.trim());
    if (!m || Number(m[2]) < 1 || Number(m[1] || 1) < 1) throw new Error(`bad --dice ${text}; use NdM such as 2d6`);
    for (let i = 0; i < Number(m[1] || 1); i++) dice.push({ sides: Number(m[2]) });
  }
  return dice;
}
