// Small CLI over the batch runner. No framework.
//   npm run sim -- batch   [--games N] [--seed S] [--lineup a,b,c,d] [--endMode m] [--endValue v] [--no-rotate] [--json]
//                          [--fireOnPass] [--landBonus N] [--tileEndVp X] [--tiles superlinear]   (experimental variants, off by default)
//                          endMode is turnCap, vpRace, lapRace, vpPool (endValue = total VP pool) or landmarkRace (endValue = landmarks needed)
//                          [--extended]   (loops mode: also report interaction index and progression; always on in shared mode)
//                          [--board loops|shared] [--sideLength N] [--dice 2d6]   (shared board: one loop for everyone, owned tiles; --dice applies to both modes)
//   npm run sim -- balance [--games N] [--seed S]
//   npm run sim -- replay  --seed S [--lineup a,b,c,d] [--endMode m] [--endValue v]
import { parseArgs } from 'node:util';
import type { EndMode } from '../engine/types.ts';
import { SUPERLINEAR_TILES } from '../tiles/index.ts';
import { describeEvent } from '../engine/describe.ts';
import { batch, DEFAULT_SPEC, parseDice, placementValue, type BatchReport, type BatchSpec } from './batch.ts';
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
    fireOnPass: { type: 'boolean' },
    landBonus: { type: 'string' },
    tileEndVp: { type: 'string' },
    tiles: { type: 'string' },
    'no-rotate': { type: 'boolean' },
    json: { type: 'boolean' },
    extended: { type: 'boolean' },
    players: { type: 'string' },
    board: { type: 'string' },
    sideLength: { type: 'string' },
    dice: { type: 'string' },
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
  if (values.fireOnPass) spec.config!.fireOnPass = true;
  if (values.landBonus) spec.config!.landBonus = Number(values.landBonus);
  if (values.tileEndVp) spec.config!.tileEndVp = Number(values.tileEndVp);
  if (values.tiles) {
    if (values.tiles !== 'superlinear' && values.tiles !== 'starter') throw new Error(`unknown --tiles ${values.tiles}; use starter or superlinear`);
    if (values.tiles === 'superlinear') spec.config!.tileSet = SUPERLINEAR_TILES;
  }
  if (values.endMode && !['turnCap', 'vpRace', 'lapRace', 'vpPool', 'landmarkRace'].includes(values.endMode)) throw new Error(`unknown --endMode ${values.endMode}`);
  if (values.endMode === 'landmarkRace' && !values.endValue) spec.config!.endValue = 3;
  if (values.board) {
    if (values.board !== 'loops' && values.board !== 'shared') throw new Error(`unknown --board ${values.board}; use loops or shared`);
    spec.config!.boardMode = values.board;
  }
  if (values.sideLength) spec.config!.sideLength = Number(values.sideLength);
  if (values.dice) spec.config!.startDice = parseDice(values.dice);
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
  if (m.firesByClass) {
    console.log(`Tolls: ${m.tollsPerGame!.toFixed(2)} per game, ${m.tollCoinsPerGame!.toFixed(2)} coins paid per game · corner income ${m.cornerIncomePerGame!.toFixed(1)} coins per game`);
    console.log(`Fires per game by class: ${Object.entries(m.firesByClass).map(([k, v]) => `${k} ${v.toFixed(1)}`).join('  ')}`);
  } else {
    console.log(`Attacks: ${m.attacks.perGame.toFixed(2)} per game, ${pct(m.attacks.cancelledRate)} cancelled, attacker lift ${m.attacks.attackerLift.toFixed(1)} VP, target lift ${m.attacks.targetLift.toFixed(1)} VP`);
  }
  if (m.interactionIndex != null) {
    const shares = [m.tollShare != null ? `toll share ${pct(m.tollShare)}` : null, m.cornerShare != null ? `corner share ${pct(m.cornerShare)}` : null].filter((x) => x);
    console.log(`Interaction index ${pct(m.interactionIndex)} of coin and VP movement happens on another player's turn${shares.length ? ` · ${shares.join(' · ')} of coins gained` : ''}`);
  }
  if (m.buyoutsPerGame != null) {
    console.log(`Buyouts ${m.buyoutsPerGame.toFixed(2)} per game · landmarks ${m.landmarksPerGame!.toFixed(2)} per game (owned at the end: ${Object.entries(m.landmarkBuyRate!).map(([k, v]) => `${k} ${pct(v)}`).join(', ')})`);
  }
  if (m.progression) {
    const pr = m.progression;
    const f = (x: number, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : 'n/a');
    console.log(`Progression: mean VP per player at round ${Object.entries(pr.vpAtRound).filter(([r]) => [3, 6, 9, 12, 15].includes(Number(r))).map(([r, v]) => `${r}=${f(v)}`).join('  ')}`);
    console.log(`  mean price per buy by round bucket ${Object.entries(pr.buyCostByRound).map(([r, v]) => `≤${r}: ${f(v)}`).join('  ')} · VP buys by third of the game ${pr.vpBuyShareByThird.map((x) => (Number.isFinite(x) ? pct(x) : 'n/a')).join(' / ')}`);
    console.log(`  engine online (income ≥ 8 in a round) at round ${f(pr.engineOnlineRound)} for ${pct(pr.engineOnlineRate)} of players`);
  }
  if (m.randomFloor != null) console.log(`Random floor: ${pct(m.randomFloor)}`);
  console.log('\nTiles');
  console.log(table(
    Object.entries(m.tiles).sort((a, b) => b[1].takeRate - a[1].takeRate).map(([id, t]) => [id, t.buys, t.offers, pct(t.takeRate), pct(t.buyRate), t.sells, t.ownerGames, pct(t.ownerWinRate), (t.lift >= 0 ? '+' : '') + t.lift.toFixed(1)]),
    ['tile', 'buys', 'offers', 'take rate', 'in games', 'sells', 'owners', 'owner win', 'lift pts'],
  ));
  console.log('\nMods');
  console.log(table(Object.entries(m.mods).map(([id, x]) => [id, x.buys, pct(x.buyRate)]), ['mod', 'buys', 'buy rate']));
  console.log('\nMost lopsided games (seed, winner seat, bot, VP margin)');
  console.log(table(m.lopsided.map((l) => [l.seed, l.winner + 1, l.winnerBot, l.margin]), ['seed', 'seat', 'bot', 'margin']));
  console.log(`\nProblems (${r.problems.length})`);
  for (const p of r.problems) console.log(`  - ${p}`);
}

if (command === 'batch') {
  const report = batch(specFromArgs(), { extended: !!values.extended });
  if (values.json) console.log(JSON.stringify(report, null, 2));
  else printReport(report);
} else if (command === 'balance') {
  const base = specFromArgs();
  const games = base.games ?? DEFAULT_SPEC.games;
  const reports: BatchReport[] = [];
  for (const [endMode, endValue] of [['turnCap', 15], ['vpRace', 30], ['lapRace', 6]] as [EndMode, number][]) {
    const r = batch({ ...base, games, config: { ...base.config, endMode, endValue } }, { extended: !!values.extended });
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
  for (const e of rec.events) console.log(describeEvent(e));
} else {
  console.error(`unknown command ${command}; use batch, balance or replay`);
  process.exit(1);
}
