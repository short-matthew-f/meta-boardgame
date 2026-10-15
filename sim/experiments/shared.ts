// Experiment: how does the shared board play compared with the loops reference, and which
// knobs (die size, player count, end mode, corner income, own-side protection) move it?
//
//   node --import tsx sim/experiments/shared.ts [--games N] [--lookaheadGames N] [--only 3,4] [--write]
//
// --write replaces the table section of sim/experiments/shared-results.md (between the table
// markers); the "what moved" paragraphs outside the markers are hand-written and kept.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import type { EndMode, GameConfig, GameRecord } from '../../engine/types.ts';
import { LANDMARK_RACE_MODE, VP_POOL_MODE } from '../../engine/engine.ts';
import { DEFAULT_SPEC, resolveConfig, runGames, type BatchSpec } from '../batch.ts';
import { computeMetrics, pct, type Metrics } from '../metrics.ts';

const { values } = parseArgs({ options: { games: { type: 'string' }, lookaheadGames: { type: 'string' }, only: { type: 'string' }, write: { type: 'boolean' } } });
const GAMES = Number(values.games ?? 600);
const LOOKAHEAD_GAMES = Number(values.lookaheadGames ?? 200);
const ONLY = values.only ? values.only.split(',').map(Number) : null;

type Cell = { n: number; name: string; players: number; config: Partial<GameConfig> };
const turnCap15: Partial<GameConfig> = { endMode: 'turnCap', endValue: 15 };
const shared: Partial<GameConfig> = { ...turnCap15, boardMode: 'shared' };
const CELLS: Cell[] = [
  { n: 1, name: 'loops, defaults', players: 4, config: { ...turnCap15 } },
  { n: 2, name: 'loops, fireOnPass + landBonus 2', players: 4, config: { ...turnCap15, fireOnPass: true, landBonus: 2 } },
  { n: 3, name: 'shared, d6, 4p', players: 4, config: { ...shared } },
  { n: 4, name: 'shared, 2d6, 4p', players: 4, config: { ...shared, startDice: [{ sides: 6 }, { sides: 6 }] } },
  { n: 5, name: 'shared, d6, 2p', players: 2, config: { ...shared } },
  { n: 6, name: 'shared, d6, 3p', players: 3, config: { ...shared } },
  { n: 7, name: 'shared, d6, 4p, vpPool 60', players: 4, config: { ...shared, endMode: VP_POOL_MODE, endValue: 60 } },
  { n: 8, name: 'shared, d6, 4p, landmarkRace 3', players: 4, config: { ...shared, endMode: LANDMARK_RACE_MODE, endValue: 3 } },
  { n: 9, name: 'shared, d6, 4p, cornerIncome 1', players: 4, config: { ...shared, cornerIncome: 1 } },
  { n: 10, name: 'shared, d6, 4p, protectOwnSide', players: 4, config: { ...shared, protectOwnSide: true } },
];
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

type Row = { cell: Cell; lineup: string; games: number; bots: string[]; m: Metrics; winnerVp: number; totalVp: number; top: string; liftHi: string; liftLo: string; ms: number };

function runCell(cell: Cell, lineup: (typeof LINEUPS)[number]): Row {
  const bots = lineup.bots[cell.players]!;
  const spec: BatchSpec = { ...DEFAULT_SPEC, games: lineup.games, lineup: bots, config: cell.config };
  const config = resolveConfig(spec);
  const t0 = performance.now();
  const records = runGames(spec);
  const m = computeMetrics(records, config, { extended: true });
  const winnerVp: number[] = [], totalVp: number[] = [];
  for (const rec of records) {
    const st = finalStandings(rec);
    winnerVp.push(st.find((s) => s.player === rec.winner)!.vp);
    totalVp.push(st.reduce((n, s) => n + s.vp, 0));
  }
  const tiles = Object.entries(m.tiles);
  const top = tiles.slice().sort((a, b) => b[1].takeRate - a[1].takeRate).slice(0, 3).map(([id, t]) => `${id} ${pct(t.takeRate)}`).join(', ');
  const lifted = tiles.filter(([, t]) => t.ownerGames >= 20).sort((a, b) => b[1].lift - a[1].lift);
  const fmt = ([id, t]: [string, Metrics['tiles'][string]]) => `${id} ${t.lift >= 0 ? '+' : ''}${t.lift.toFixed(1)}`;
  return {
    cell, lineup: lineup.label, games: lineup.games, bots, m,
    winnerVp: mean(winnerVp), totalVp: mean(totalVp), top,
    liftHi: lifted.length ? fmt(lifted[0]!) : 'n/a', liftLo: lifted.length ? fmt(lifted[lifted.length - 1]!) : 'n/a',
    ms: performance.now() - t0,
  };
}

const t0 = performance.now();
const rows: Row[] = [];
for (const lineup of LINEUPS) {
  for (const cell of CELLS) {
    if (ONLY && !ONLY.includes(cell.n)) continue;
    const r = runCell(cell, lineup);
    rows.push(r);
    console.error(`${lineup.label.padEnd(9)} cell ${String(cell.n).padStart(2)} ${cell.name.padEnd(34)} ${(r.ms / 1000).toFixed(1)}s`);
  }
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
    out.push(`Outcome. Win % in seat order of the lineup listed in the cell's last column; seat 1 and last seat win %; VP are final (include end-of-game VP).`, '');
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
    out.push('Interaction and economy. Fires per game by class in the order civic / private / toll / public / landmark (shared only); toll share and corner share are fractions of the coins gained from tiles and corners; interaction index is the share of coin and VP movement that happens on another player\'s turn.', '');
    out.push('| Cell | Fires per game by class | Tolls per game (toll share) | Corner share | Interaction index | Buyouts per game | Landmarks per game | Top 3 take rates | Win lift hi | Win lift lo |');
    out.push('| --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- |');
    for (const r of rs) {
      const m = r.m;
      const fires = m.firesByClass ? ['civic', 'private', 'toll', 'public', 'landmark'].map((k) => f1(m.firesByClass![k])).join(' / ') : '—';
      const tolls = m.tollsPerGame != null ? `${f2(m.tollsPerGame)} (${p1(m.tollShare)})` : '—';
      out.push(`| ${r.cell.n}. ${r.cell.name} | ${fires} | ${tolls} | ${dash(m.cornerShare != null ? p1(m.cornerShare) : undefined)} | ${p1(m.interactionIndex)} | ${dash(m.buyoutsPerGame != null ? f2(m.buyoutsPerGame) : undefined)} | ${dash(m.landmarksPerGame != null ? f2(m.landmarksPerGame) : undefined)} | ${r.top} | ${r.liftHi} | ${r.liftLo} |`);
    }
    out.push('');
  }
  return out.join('\n');
}

const table = md();
console.log(table);
console.error(`total ${((performance.now() - t0) / 1000).toFixed(0)}s`);

if (values.write) {
  const path = new URL('./shared-results.md', import.meta.url);
  const START = '<!-- table:start -->', END = '<!-- table:end -->';
  const block = `${START}\n${table}\n${END}`;
  let doc = existsSync(path) ? readFileSync(path, 'utf8') : `# Shared board experiment\n\n${block}\n`;
  if (doc.includes(START)) doc = doc.slice(0, doc.indexOf(START)) + block + doc.slice(doc.indexOf(END) + END.length);
  else doc += `\n${block}\n`;
  writeFileSync(path, doc);
}
