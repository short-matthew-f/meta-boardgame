// Experiment: the shared board at a fixed perimeter. The shared-board experiment found interaction and
// placement work but a 40-slot board is too sparse with a d6, and 2d6 fixes density at the price of seat
// bias. Here: fewer slots (perimeter), catch-up coins for later seats, tolls on a pass, a buyout premium,
// a replacement tax, and the landmarkRace ranking fix, each against the 40-slot reference (cell 1).
//
//   node --import tsx sim/experiments/perimeter.ts [--games N] [--lookaheadGames N] [--only 3,4] [--skipLookahead] [--write]
//
// --write replaces the table section of sim/experiments/perimeter-results.md (between the table
// markers); the text outside the markers is hand-written and kept.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import type { GameConfig, GameRecord } from '../../engine/types.ts';
import { LANDMARK_RACE_MODE, VP_POOL_MODE } from '../../engine/engine.ts';
import { DEFAULT_SPEC, resolveConfig, runGames, type BatchSpec } from '../batch.ts';
import { computeMetrics, pct, type Metrics } from '../metrics.ts';

const { values } = parseArgs({ options: { games: { type: 'string' }, lookaheadGames: { type: 'string' }, only: { type: 'string' }, skipLookahead: { type: 'boolean' }, write: { type: 'boolean' } } });
const GAMES = Number(values.games ?? 600);
const LOOKAHEAD_GAMES = Number(values.lookaheadGames ?? 200);
const ONLY = values.only ? values.only.split(',').map(Number) : null;
const BIAS_GAMES = 1000;

type Cell = { n: number; name: string; players: number; config: Partial<GameConfig> };
const D6x2 = [{ sides: 6 }, { sides: 6 }];
const shared: Partial<GameConfig> = { endMode: 'turnCap', endValue: 15, boardMode: 'shared' };
const p24: Partial<GameConfig> = { ...shared, perimeter: 24 };
const pool60: Partial<GameConfig> = { endMode: VP_POOL_MODE, endValue: 60 };
const CELLS: Cell[] = [
  { n: 1, name: 'reference: sideLength 10 (40 slots), d6, 4p', players: 4, config: { ...shared, sideLength: 10 } },
  { n: 2, name: 'perimeter 24, d6, 4p', players: 4, config: { ...p24 } },
  { n: 3, name: 'perimeter 24, 2d6, 4p', players: 4, config: { ...p24, startDice: D6x2 } },
  { n: 4, name: 'perimeter 24, d6, 2p', players: 2, config: { ...p24 } },
  { n: 5, name: 'perimeter 24, d6, 3p', players: 3, config: { ...p24 } },
  { n: 6, name: 'perimeter 24, d6, 4p, catchUp 1', players: 4, config: { ...p24, catchUpCoins: 1 } },
  { n: 7, name: 'perimeter 24, 2d6, 4p, catchUp 1', players: 4, config: { ...p24, startDice: D6x2, catchUpCoins: 1 } },
  { n: 8, name: 'perimeter 24, 2d6, 4p, catchUp 2', players: 4, config: { ...p24, startDice: D6x2, catchUpCoins: 2 } },
  { n: 9, name: 'perimeter 24, d6, 4p, tollOnPass 0.5', players: 4, config: { ...p24, tollOnPass: 0.5 } },
  { n: 10, name: 'perimeter 24, d6, 4p, vpPool 60, premium 0', players: 4, config: { ...p24, ...pool60, buyoutPremium: 0 } },
  { n: 11, name: 'perimeter 24, d6, 4p, vpPool 60, premium 2', players: 4, config: { ...p24, ...pool60, buyoutPremium: 2 } },
  { n: 12, name: 'perimeter 24, d6, 4p, landmarkRace 3 (ranked by landmarks)', players: 4, config: { ...p24, endMode: LANDMARK_RACE_MODE, endValue: 3 } },
  { n: 13, name: 'perimeter 32 (8 per side), d6, 4p', players: 4, config: { ...shared, perimeter: 32 } },
  { n: 14, name: 'perimeter 24, d6, 4p, replacementTax 2', players: 4, config: { ...p24, replacementTax: 2 } },
  { n: 15, name: 'perimeter 24, d6, 4p, replacementTax 2 escalating', players: 4, config: { ...p24, replacementTax: 2, replacementTaxEscalates: true } },
  { n: 16, name: 'perimeter 24, d6, 4p, vpPool 60, replacementTax 2', players: 4, config: { ...p24, ...pool60, replacementTax: 2 } },
  { n: 17, name: 'perimeter 24, d6, 4p, vpPool 60, replacementTax 2 escalating', players: 4, config: { ...p24, ...pool60, replacementTax: 2, replacementTaxEscalates: true } },
];
// Seat-bias check: four identical greedy bots, seats not rotated. Cell numbers refer to CELLS (1 is the reference row).
const BIAS_CELLS = [1, 2, 3, 7, 8];

// 2 and 3 player cells seat the bots listed for that size (every bot sees every seat equally often)
const LINEUPS: { label: string; bots: Record<number, string[]>; games: number }[] = [
  { label: 'standard', games: GAMES, bots: { 4: ['greedy', 'scorer', 'aggressor', 'turtle'], 3: ['greedy', 'scorer', 'aggressor'], 2: ['greedy', 'scorer'] } },
  { label: 'shared', games: GAMES, bots: { 4: ['greedy', 'scorer', 'landlord', 'builder'], 3: ['scorer', 'landlord', 'builder'], 2: ['landlord', 'builder'] } },
  { label: 'lookahead', games: LOOKAHEAD_GAMES, bots: { 4: ['lookahead', 'scorer', 'landlord', 'builder'], 3: ['lookahead', 'landlord', 'builder'], 2: ['lookahead', 'builder'] } },
];

function mean(xs: number[]): number { return xs.reduce((a, b) => a + b, 0) / (xs.length || 1); }

function finalStandings(rec: GameRecord) {
  for (let i = rec.events.length - 1; i >= 0; i--) {
    const e = rec.events[i]!;
    if (e.t === 'roundEnded') return e.standings;
  }
  return [];
}

/**
 * Board fill from the event log. `fullRound`: the round in which every non-corner slot first held a tile
 * or landmark (null if never); sells carry no slot and are ignored (no bot sells). `replaced`: buys that
 * went onto an occupied slot (own tile or buyout); `buys`: all tile and landmark buys; `tax`: replacement tax paid.
 */
function boardFill(rec: GameRecord, config: GameConfig) {
  const need = config.players * config.sideLength - config.players;
  const filled = new Set<number>();
  let round = 1, fullRound: number | null = null, replaced = 0, buys = 0, tax = 0, sells = 0;
  for (const e of rec.events) {
    if (e.t === 'rolled') round = e.round;
    else if (e.t === 'sold') sells++;
    else if (e.t === 'bought' && e.slot != null) {
      buys++;
      tax += e.tax ?? 0;
      if (filled.has(e.slot)) replaced++;
      else {
        filled.add(e.slot);
        if (fullRound == null && filled.size === need) fullRound = round;
      }
    }
  }
  return { fullRound, replaced, buys, tax, sells };
}

type Row = {
  cell: Cell; lineup: string; games: number; bots: string[]; m: Metrics; winnerVp: number; totalVp: number; top: string;
  slots: number; fullRound: number; fullShare: number; replShare: number; taxPerGame: number; sells: number; ms: number;
};

function runCell(cell: Cell, lineup: (typeof LINEUPS)[number]): Row {
  const bots = lineup.bots[cell.players]!;
  const spec: BatchSpec = { ...DEFAULT_SPEC, games: lineup.games, lineup: bots, config: cell.config };
  const config = resolveConfig(spec);
  const t0 = performance.now();
  const records = runGames(spec);
  const m = computeMetrics(records, config, { extended: true });
  const winnerVp: number[] = [], totalVp: number[] = [], full: number[] = [];
  let replaced = 0, buys = 0, tax = 0, sells = 0;
  for (const rec of records) {
    const st = finalStandings(rec);
    winnerVp.push(st.find((s) => s.player === rec.winner)!.vp);
    totalVp.push(st.reduce((n, s) => n + s.vp, 0));
    const b = boardFill(rec, config);
    if (b.fullRound != null) full.push(b.fullRound);
    replaced += b.replaced; buys += b.buys; tax += b.tax; sells += b.sells;
  }
  const top = Object.entries(m.tiles).sort((a, b) => b[1].takeRate - a[1].takeRate).slice(0, 3).map(([id, t]) => `${id} ${pct(t.takeRate)}`).join(', ');
  return {
    cell, lineup: lineup.label, games: lineup.games, bots, m,
    winnerVp: mean(winnerVp), totalVp: mean(totalVp), top,
    slots: config.players * config.sideLength, fullRound: full.length ? mean(full) : NaN, fullShare: full.length / records.length,
    replShare: buys ? replaced / buys : 0, taxPerGame: tax / records.length, sells,
    ms: performance.now() - t0,
  };
}

const t0 = performance.now();
const rows: Row[] = [];
for (const lineup of LINEUPS) {
  if (values.skipLookahead && lineup.label === 'lookahead') continue;
  for (const cell of CELLS) {
    if (ONLY && !ONLY.includes(cell.n)) continue;
    const r = runCell(cell, lineup);
    rows.push(r);
    console.error(`${lineup.label.padEnd(9)} cell ${String(cell.n).padStart(2)} ${cell.name.padEnd(62)} ${(r.ms / 1000).toFixed(1)}s`);
  }
}

// Seat bias: four identical greedy bots, no rotation.
const bias: { cell: Cell; seats: number[] }[] = [];
for (const n of BIAS_CELLS) {
  const cell = CELLS.find((c) => c.n === n)!;
  if (ONLY && !ONLY.includes(n)) continue;
  const spec: BatchSpec = { ...DEFAULT_SPEC, games: BIAS_GAMES, lineup: ['greedy', 'greedy', 'greedy', 'greedy'], rotateSeats: false, config: cell.config };
  const m = computeMetrics(runGames(spec), resolveConfig(spec), { extended: true });
  bias.push({ cell, seats: m.winRateBySeat.map((s) => s.rate) });
  console.error(`bias      cell ${String(n).padStart(2)} ${cell.name}`);
}

const f1 = (x: number | undefined) => (x == null || !Number.isFinite(x) ? 'n/a' : x.toFixed(1));
const f2 = (x: number | undefined) => (x == null || !Number.isFinite(x) ? 'n/a' : x.toFixed(2));
const p1 = (x: number | undefined) => (x == null || !Number.isFinite(x) ? 'n/a' : pct(x));
const dash = (x: string | undefined) => x ?? '—';

function md(): string {
  const out: string[] = [];
  for (const lineup of LINEUPS) {
    const rs = rows.filter((r) => r.lineup === lineup.label);
    if (rs.length === 0) continue;
    out.push(`### ${lineup.label} lineup (${lineup.bots[4]!.join(', ')} at 4 players; ${lineup.games} games per cell)`, '');
    out.push(`Outcome. Win % in the order of the Bots column; seat 1 and last seat win %; VP are final (include end-of-game VP).`, '');
    out.push('| Cell | Bots | Win % | Seat 1 / last | Winner VP | Total VP | Rounds mean (p90) | Decided by | VP at round 5 / 10 / 15 | Engine online (rate) |');
    out.push('| --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- |');
    for (const r of rs) {
      const m = r.m;
      const stop = m.gameLength.byReason['maxRounds'] ?? 0;
      const len = `${m.gameLength.mean.toFixed(1)} (${m.gameLength.p90})${stop ? ` [${stop} hit stop]` : ''}`;
      const seats = `${(m.winRateBySeat[0]!.rate * 100).toFixed(1)} / ${(m.winRateBySeat[m.players - 1]!.rate * 100).toFixed(1)}`;
      const vp = m.progression!.vpAtRound;
      const eng = m.progression!;
      out.push(`| ${r.cell.n}. ${r.cell.name} | ${r.bots.join(' / ')} | ${r.bots.map((b) => ((m.winRateByBot[b]?.rate ?? 0) * 100).toFixed(1)).join(' / ')} | ${seats} | ${r.winnerVp.toFixed(1)} | ${r.totalVp.toFixed(1)} | ${len} | ${pct(m.decidedBy.medianFraction)} | ${f1(vp[5])} / ${f1(vp[10])} / ${f1(vp[15])} | ${f1(eng.engineOnlineRound)} (${p1(eng.engineOnlineRate)}) |`);
    }
    out.push('');
    out.push('Board, interaction and economy. Slots per board; board-full round = mean first round in which every non-corner slot holds a tile or landmark (share of games that got there); replacement share = buys onto an occupied slot (own tile or buyout) ÷ all tile and landmark buys; tax paid = replacement tax coins per game. Fires per game by class civic / private / toll / public / landmark; tolls per game at landings (+ pass tolls) with the toll share of coins gained; corner share; interaction index; buyouts and landmarks per game.', '');
    out.push('| Cell | Slots | Board full (reached) | Replacement share | Tax paid | Fires per game by class | Tolls per game (toll share) | Corner share | Interaction index | Buyouts per game | Landmarks per game | Top 3 take rates |');
    out.push('| --- | ---: | --- | ---: | ---: | --- | --- | ---: | ---: | ---: | ---: | --- |');
    for (const r of rs) {
      const m = r.m;
      const fires = m.firesByClass ? ['civic', 'private', 'toll', 'public', 'landmark'].map((k) => f1(m.firesByClass![k])).join(' / ') : '—';
      const pass = m.passTollsPerGame ? ` + ${f2(m.passTollsPerGame)} pass` : '';
      const tolls = m.tollsPerGame != null ? `${f2(m.tollsPerGame)}${pass} (${p1(m.tollShare)})` : '—';
      const full = Number.isFinite(r.fullRound) ? `${f1(r.fullRound)} (${p1(r.fullShare)})` : `never (${p1(r.fullShare)})`;
      out.push(`| ${r.cell.n}. ${r.cell.name} | ${r.slots} | ${full} | ${p1(r.replShare)} | ${r.taxPerGame > 0 ? f2(r.taxPerGame) : '—'} | ${fires} | ${tolls} | ${dash(m.cornerShare != null ? p1(m.cornerShare) : undefined)} | ${p1(m.interactionIndex)} | ${dash(m.buyoutsPerGame != null ? f2(m.buyoutsPerGame) : undefined)} | ${dash(m.landmarksPerGame != null ? f2(m.landmarksPerGame) : undefined)} | ${r.top} |`);
    }
    out.push('');
  }
  if (bias.length) {
    out.push(`### Seat bias: four identical greedy bots, seats not rotated, ${BIAS_GAMES} games`, '');
    out.push('Win rate by seat 1 / 2 / 3 / 4 (a fair game is 25% each).', '');
    out.push('| Cell | Seat 1 | Seat 2 | Seat 3 | Seat 4 |');
    out.push('| --- | ---: | ---: | ---: | ---: |');
    for (const b of bias) out.push(`| ${b.cell.n}. ${b.cell.name} | ${b.seats.map((x) => (x * 100).toFixed(1)).join(' | ')} |`);
    out.push('');
  }
  const sells = rows.reduce((n, r) => n + r.sells, 0);
  out.push(`Sells observed in all cells: ${sells} (board-full round ignores sells, which carry no slot).`, '');
  return out.join('\n');
}

const table = md();
console.log(table);
console.error(`total ${((performance.now() - t0) / 1000).toFixed(0)}s`);

if (values.write) {
  const path = new URL('./perimeter-results.md', import.meta.url);
  const START = '<!-- table:start -->', END = '<!-- table:end -->';
  const block = `${START}\n${table}\n${END}`;
  let doc = existsSync(path) ? readFileSync(path, 'utf8') : `# Perimeter experiment\n\n${block}\n`;
  if (doc.includes(START)) doc = doc.slice(0, doc.indexOf(START)) + block + doc.slice(doc.indexOf(END) + END.length);
  else doc += `\n${block}\n`;
  writeFileSync(path, doc);
}
