// Small CLI over the batch runner. No framework.
//   npm run sim -- batch   [--games N] [--seed S] [--lineup a,b,c,d] [--endMode m] [--endValue v] [--no-rotate] [--json]
//   npm run sim -- balance [--games N] [--seed S]
//   npm run sim -- replay  --seed S [--lineup a,b,c,d] [--endMode m] [--endValue v]
import { parseArgs } from 'node:util';
import type { EndMode, Event } from '../engine/types.ts';
import { batch, DEFAULT_SPEC, placementValue, type BatchReport, type BatchSpec } from './batch.ts';
import { pct } from './metrics.ts';
import { playGame } from './runner.ts';
import { botByName } from '../bots/index.ts';
import { resolveConfig, seatOrder } from './batch.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    games: { type: 'string' },
    seed: { type: 'string' },
    lineup: { type: 'string' },
    endMode: { type: 'string' },
    endValue: { type: 'string' },
    'no-rotate': { type: 'boolean' },
    json: { type: 'boolean' },
    players: { type: 'string' },
  },
});

const command = positionals[0] ?? 'batch';

function specFromArgs(): Partial<BatchSpec> {
  const spec: Partial<BatchSpec> = { config: {} };
  if (values.games) spec.games = Number(values.games);
  if (values.seed) spec.seedStart = Number(values.seed);
  if (values.lineup) spec.lineup = values.lineup.split(',');
  if (values['no-rotate']) spec.rotateSeats = false;
  if (values.endMode) spec.config!.endMode = values.endMode as EndMode;
  if (values.endValue) spec.config!.endValue = Number(values.endValue);
  return spec;
}

function table(rows: (string | number)[][], header: string[]): string {
  const all = [header, ...rows.map((r) => r.map(String))];
  const widths = header.map((_, c) => Math.max(...all.map((r) => (r[c] ?? '').length)));
  const line = (r: string[]) => r.map((cell, c) => cell.padEnd(widths[c]!)).join('  ');
  return [line(all[0]!), widths.map((w) => '-'.repeat(w)).join('  '), ...all.slice(1).map(line)].join('\n');
}

function printReport(r: BatchReport): void {
  const m = r.metrics;
  console.log(`\n== ${r.spec.games} games · ${r.config.players} players · ${r.config.endMode} ${r.config.endValue} · lineup ${r.spec.lineup.join(', ')} · ${(r.elapsedMs / 1000).toFixed(1)}s ==`);
  console.log('\nWin rate by archetype');
  console.log(table(Object.entries(m.winRateByBot).map(([n, s]) => [n, s.wins, s.games, pct(s.rate)]), ['bot', 'wins', 'games', 'rate']));
  console.log('\nWin rate by seat');
  console.log(table(m.winRateBySeat.map((s, i) => [i + 1, s.wins, pct(s.rate)]), ['seat', 'wins', 'rate']));
  const g = m.gameLength;
  console.log(`\nGame length: mean ${g.mean.toFixed(1)}  p10 ${g.p10}  p50 ${g.p50}  p90 ${g.p90}  min ${g.min}  max ${g.max}  · ended by ${Object.entries(g.byReason).map(([k, v]) => `${k}=${v}`).join(' ')}`);
  console.log(`Decided by: median round ${m.decidedBy.medianRound} (${pct(m.decidedBy.medianFraction)} of game length)`);
  console.log(`Attacks: ${m.attacks.perGame.toFixed(2)} per game, ${pct(m.attacks.cancelledRate)} cancelled, attacker lift ${m.attacks.attackerLift.toFixed(1)} VP, target lift ${m.attacks.targetLift.toFixed(1)} VP`);
  if (m.randomFloor != null) console.log(`Random floor: ${pct(m.randomFloor)}`);
  console.log('\nTiles');
  console.log(table(
    Object.entries(m.tiles).sort((a, b) => b[1].buyRate - a[1].buyRate).map(([id, t]) => [id, t.buys, pct(t.buyRate), t.sells, t.ownerGames, pct(t.ownerWinRate), (t.lift >= 0 ? '+' : '') + t.lift.toFixed(1)]),
    ['tile', 'buys', 'buy rate', 'sells', 'owners', 'owner win', 'lift pts'],
  ));
  console.log('\nMods');
  console.log(table(Object.entries(m.mods).map(([id, x]) => [id, x.buys, pct(x.buyRate)]), ['mod', 'buys', 'buy rate']));
  console.log('\nMost lopsided games (seed, winner seat, bot, VP margin)');
  console.log(table(m.lopsided.map((l) => [l.seed, l.winner + 1, l.winnerBot, l.margin]), ['seed', 'seat', 'bot', 'margin']));
  console.log(`\nProblems (${r.problems.length})`);
  for (const p of r.problems) console.log(`  - ${p}`);
}

function describe(e: Event): string {
  switch (e.t) {
    case 'rolled': return `P${e.player + 1} rolls [${e.dice.join(',')}] = ${e.total}`;
    case 'moved': return `  P${e.player + 1} moves ${e.from} -> ${e.to}${e.passedStart ? ' (passes Start)' : ''}`;
    case 'lap': return `  P${e.player + 1} completes lap ${e.laps}, +${e.income} coins`;
    case 'tileFired': return `  P${e.player + 1} ${e.tile} fires (${e.trigger})`;
    case 'resource': return `    P${e.player + 1} ${e.delta >= 0 ? '+' : ''}${e.delta} ${e.res} (${e.source})`;
    case 'attacked': return `  P${e.attacker + 1} attacks P${e.target + 1} with ${e.tile}${e.cancelled ? ' — cancelled by shield' : ''}`;
    case 'bought': return `  P${e.player + 1} buys ${e.item} for ${e.cost}${e.slot != null ? ` at slot ${e.slot}` : ''}`;
    case 'sold': return `  P${e.player + 1} sells ${e.tile} for ${e.refund}`;
    case 'expanded': return `  P${e.player + 1} board grows to ${e.size} slots (after ${e.afterSlot})`;
    case 'locked': return `  P${e.player + 1}'s ${e.tile} at slot ${e.slot} locked by P${e.by + 1}`;
    case 'shopRefilled': return `  shop: ${e.shop.join(', ')}`;
    case 'roundEnded': return `-- round ${e.round}: ${e.standings.map((s) => `P${s.player + 1} ${s.vp}vp/${s.coins}c`).join('  ')}`;
    case 'gameEnded': return `== game over (${e.reason}) after ${e.rounds} rounds: P${e.winner + 1} wins`;
  }
}

if (command === 'batch') {
  const report = batch(specFromArgs());
  if (values.json) console.log(JSON.stringify(report, null, 2));
  else printReport(report);
} else if (command === 'balance') {
  const base = specFromArgs();
  const games = base.games ?? DEFAULT_SPEC.games;
  const reports: BatchReport[] = [];
  for (const [endMode, endValue] of [['turnCap', 15], ['vpRace', 30], ['lapRace', 6]] as [EndMode, number][]) {
    const r = batch({ ...base, games, config: { ...base.config, endMode, endValue } });
    reports.push(r);
    if (!values.json) printReport(r);
  }
  const pv = placementValue({ ...base, games: Math.min(games, 500) });
  const rf = batch({ ...base, games: Math.min(games, 500), lineup: ['random', 'greedy', 'scorer', 'aggressor'] });
  if (values.json) {
    console.log(JSON.stringify({ reports, placement: pv, randomFloor: rf.metrics.randomFloor }, null, 2));
  } else {
    console.log(`\nPlacement value: greedy ${pct(pv.withPlacement)} with landing-slot placement vs ${pct(pv.withoutPlacement)} random placement → lift ${pv.lift.toFixed(1)} pts${pv.lift < 3 ? '  (PROBLEM: < 3, placement is cosmetic)' : ''}`);
    console.log(`Random floor (random, greedy, scorer, aggressor): ${pct(rf.metrics.randomFloor ?? 0)}${(rf.metrics.randomFloor ?? 0) > 0.2 ? '  (PROBLEM: > 20%)' : ''}`);
  }
} else if (command === 'replay') {
  const spec: BatchSpec = { ...DEFAULT_SPEC, ...specFromArgs() };
  const config = resolveConfig(spec);
  const i = (spec.seedStart - DEFAULT_SPEC.seedStart);
  const names = seatOrder(spec.lineup, Math.max(0, i), spec.rotateSeats);
  const rec = playGame(spec.seedStart, names.map(botByName), config);
  console.log(`seed ${rec.seed} · seats: ${names.map((n, s) => `P${s + 1}=${n}`).join(' ')}`);
  for (const e of rec.events) console.log(describe(e));
} else {
  console.error(`unknown command ${command}; use batch, balance or replay`);
  process.exit(1);
}
