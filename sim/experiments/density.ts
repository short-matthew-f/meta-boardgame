// Experiment: does making tiles fire more often (fireOnPass / landBonus), scoring every
// tile (tileEndVp), a finite VP supply (vpPool) or superlinear VP change the balance log's
// problems? Every variant is off by default; this script switches them on per cell.
//
//   node --import tsx sim/experiments/density.ts [--games N] [--lookaheadGames N] [--write]
//
// --write replaces the table section of sim/experiments/density-results.md (between the
// table markers); the "what moved" paragraphs outside the markers are hand-written and kept.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import type { EndMode, GameConfig, GameRecord } from '../../engine/types.ts';
import { VP_POOL_MODE } from '../../engine/engine.ts';
import { SUPERLINEAR_TILES } from '../../tiles/index.ts';
import { DEFAULT_SPEC, resolveConfig, runGames, type BatchSpec } from '../batch.ts';
import { computeMetrics, pct, type Metrics } from '../metrics.ts';

const { values } = parseArgs({ options: { games: { type: 'string' }, lookaheadGames: { type: 'string' }, write: { type: 'boolean' } } });
const GAMES = Number(values.games ?? 600);
const LOOKAHEAD_GAMES = Number(values.lookaheadGames ?? GAMES);

type Cell = { name: string; config: Partial<GameConfig> };
const turnCap15: Partial<GameConfig> = { endMode: 'turnCap', endValue: 15 };
const AD: Partial<GameConfig> = { ...turnCap15, fireOnPass: true, landBonus: 2, tileEndVp: 0.34 };
const CELLS: Cell[] = [
  { name: 'baseline', config: { ...turnCap15 } },
  { name: 'A: fireOnPass', config: { ...turnCap15, fireOnPass: true, landBonus: 1 } },
  { name: 'A2: fireOnPass, landBonus 2', config: { ...turnCap15, fireOnPass: true, landBonus: 2 } },
  { name: 'D: tileEndVp 0.34', config: { ...turnCap15, tileEndVp: 0.34 } },
  { name: 'AD: A2 + tileEndVp 0.34', config: { ...AD } },
  { name: 'AD + superlinear', config: { ...AD, tileSet: SUPERLINEAR_TILES } },
  { name: 'AD + superlinear, vpPool 60', config: { ...AD, tileSet: SUPERLINEAR_TILES, endMode: VP_POOL_MODE, endValue: 60 } },
  { name: 'AD + superlinear, vpRace 30', config: { ...AD, tileSet: SUPERLINEAR_TILES, endMode: 'vpRace' as EndMode, endValue: 30 } },
  { name: 'baseline, vpRace 30', config: { endMode: 'vpRace' as EndMode, endValue: 30 } },
];
const LINEUPS: { label: string; bots: string[]; games: number }[] = [
  { label: 'standard', bots: ['greedy', 'scorer', 'aggressor', 'turtle'], games: GAMES },
  { label: 'lookahead', bots: ['lookahead', 'scorer', 'greedy', 'turtle'], games: LOOKAHEAD_GAMES },
];

function mean(xs: number[]): number { return xs.reduce((a, b) => a + b, 0) / (xs.length || 1); }

function finalStandings(rec: GameRecord) {
  for (let i = rec.events.length - 1; i >= 0; i--) {
    const e = rec.events[i]!;
    if (e.t === 'roundEnded') return e.standings;
  }
  return [];
}

type Row = {
  cell: string; lineup: string; games: number; bots: string[]; winPct: number[];
  winnerVp: number; totalVp: number; lenMean: number; lenP90: number; maxRoundsHits: number;
  attacks: number; decided: number; top: string; liftHi: string; liftLo: string; ms: number;
};

function runCell(cell: Cell, lineup: (typeof LINEUPS)[number]): Row {
  const spec: BatchSpec = { ...DEFAULT_SPEC, games: lineup.games, lineup: lineup.bots, config: cell.config };
  const config = resolveConfig(spec);
  const t0 = performance.now();
  const records = runGames(spec);
  const m: Metrics = computeMetrics(records, config);
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
    cell: cell.name, lineup: lineup.label, games: lineup.games, bots: lineup.bots,
    winPct: lineup.bots.map((b) => (m.winRateByBot[b]?.rate ?? 0) * 100),
    winnerVp: mean(winnerVp), totalVp: mean(totalVp),
    lenMean: m.gameLength.mean, lenP90: m.gameLength.p90, maxRoundsHits: m.gameLength.byReason['maxRounds'] ?? 0,
    attacks: m.attacks.perGame, decided: m.decidedBy.medianFraction,
    top, liftHi: lifted.length ? fmt(lifted[0]!) : 'n/a', liftLo: lifted.length ? fmt(lifted[lifted.length - 1]!) : 'n/a',
    ms: performance.now() - t0,
  };
}

const t0 = performance.now();
const rows: Row[] = [];
for (const lineup of LINEUPS) {
  for (const cell of CELLS) {
    const r = runCell(cell, lineup);
    rows.push(r);
    console.error(`${lineup.label.padEnd(9)} ${cell.name.padEnd(30)} ${(r.ms / 1000).toFixed(1)}s`);
  }
}

function md(): string {
  const out: string[] = [];
  for (const lineup of LINEUPS) {
    const rs = rows.filter((r) => r.lineup === lineup.label);
    out.push(`### ${lineup.label} lineup (${lineup.bots.join(', ')}; ${lineup.games} games per cell)`, '');
    out.push(`| Cell | Win % (${lineup.bots.join(' / ')}) | Winner VP | Total VP | Rounds mean (p90) | Attacks/game | Decided by | Top take rates | Win lift hi | Win lift lo |`);
    out.push('| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |');
    for (const r of rs) {
      const len = `${r.lenMean.toFixed(1)} (${r.lenP90})${r.maxRoundsHits ? ` [${r.maxRoundsHits} hit stop]` : ''}`;
      out.push(`| ${r.cell} | ${r.winPct.map((x) => x.toFixed(1)).join(' / ')} | ${r.winnerVp.toFixed(1)} | ${r.totalVp.toFixed(1)} | ${len} | ${r.attacks.toFixed(1)} | ${pct(r.decided)} | ${r.top} | ${r.liftHi} | ${r.liftLo} |`);
    }
    out.push('');
  }
  return out.join('\n');
}

const table = md();
console.log(table);
console.error(`total ${((performance.now() - t0) / 1000).toFixed(0)}s`);

if (values.write) {
  const path = new URL('./density-results.md', import.meta.url);
  const START = '<!-- table:start -->', END = '<!-- table:end -->';
  const block = `${START}\n${table}\n${END}`;
  let doc = existsSync(path) ? readFileSync(path, 'utf8') : `# Density experiment\n\n${block}\n`;
  if (doc.includes(START)) doc = doc.slice(0, doc.indexOf(START)) + block + doc.slice(doc.indexOf(END) + END.length);
  else doc += `\n${block}\n`;
  writeFileSync(path, doc);
}
