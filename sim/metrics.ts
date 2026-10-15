// Every metric is a reducer over GameRecord[] (bots per seat, winner, events).
// Nothing here inspects engine state.
import type { Event, GameConfig, GameRecord } from '../engine/types.ts';

export type BotStat = { games: number; wins: number; rate: number };
export type TileStat = {
  buys: number;            // total bought events
  offers: number;          // tile-turns it sat in the shop while the active player could afford it
  takeRate: number;        // buys / offers
  buyRate: number;         // games in which at least one copy was bought / games
  ownerGames: number;      // (game, player) pairs where the player bought it
  ownerWinRate: number;
  lift: number;            // ownerWinRate - 1/players, in points (×100)
  sells: number;
};
export type Metrics = {
  games: number;
  players: number;
  winRateByBot: Record<string, BotStat>;
  winRateBySeat: BotStat[];
  gameLength: { mean: number; p10: number; p50: number; p90: number; min: number; max: number; byReason: Record<string, number> };
  decidedBy: { medianRound: number; medianFraction: number };
  tiles: Record<string, TileStat>;
  mods: Record<string, { buys: number; buyRate: number }>;
  attacks: { perGame: number; cancelledRate: number; attackerLift: number; targetLift: number };
  randomFloor: number | null;
  /** Shared-board mode only (absent in loops mode so its report is unchanged). Per game. */
  tollsPerGame?: number;
  tollCoinsPerGame?: number;
  cornerIncomePerGame?: number;
  /** Shared mode: tileFired events per game by tile class (civic, private, toll, public) and 'landmark'. */
  firesByClass?: Record<string, number>;
  lopsided: { seed: number; winner: number; winnerBot: string; margin: number }[];
};

export function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))));
  return sorted[idx]!;
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
}

function finalStandings(events: Event[]) {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]!;
    if (e.t === 'roundEnded') return e.standings;
  }
  return [];
}

/** First round after which the eventual winner is never displaced from first place. */
export function decidedRound(events: Event[], winner: number): number {
  const rounds = events.filter((e) => e.t === 'roundEnded');
  let decided = rounds.length;
  for (let i = rounds.length - 1; i >= 0; i--) {
    const r = rounds[i]!;
    if (r.t !== 'roundEnded') continue;
    const sorted = r.standings.slice().sort((a, b) => b.vp - a.vp || b.coins - a.coins || a.player - b.player);
    if (sorted[0]!.player === winner) decided = r.round;
    else break;
  }
  return decided;
}

export function computeMetrics(records: GameRecord[], config: GameConfig): Metrics {
  const games = records.length;
  const players = config.players;
  const byBot: Record<string, BotStat> = {};
  const bySeat: BotStat[] = Array.from({ length: players }, () => ({ games: 0, wins: 0, rate: 0 }));
  const lengths: number[] = [];
  const byReason: Record<string, number> = {};
  const decidedRounds: number[] = [];
  const decidedFracs: number[] = [];
  const tiles: Record<string, TileStat> = {};
  const cost = new Map(config.tileSet.map((t) => [t.id, t.cost]));
  for (const t of config.tileSet) tiles[t.id] = { buys: 0, offers: 0, takeRate: 0, buyRate: 0, ownerGames: 0, ownerWinRate: 0, lift: 0, sells: 0 };
  const tileOwnerWins: Record<string, number> = {};
  const tileGamesBought: Record<string, number> = {};
  const mods: Record<string, { buys: number; buyRate: number }> = {};
  for (const m of config.modSet) mods[m.id] = { buys: 0, buyRate: 0 };
  const modGamesBought: Record<string, number> = {};
  let attackCount = 0;
  let cancelled = 0;
  const vpAttackers: number[] = [], vpNonAttackers: number[] = [], vpTargets: number[] = [], vpNonTargets: number[] = [];
  const lopsided: Metrics['lopsided'] = [];
  const shared = config.boardMode === 'shared';
  let tollCount = 0, tollCoins = 0, cornerIncome = 0;
  const fires: Record<string, number> = { civic: 0, private: 0, toll: 0, public: 0, landmark: 0 };
  const classOf = new Map<string, string>([
    ...config.tileSet.map((t) => [t.id, t.class ?? ''] as [string, string]),
    ...config.landmarkSet.map((l) => [l.id, 'landmark'] as [string, string]),
  ]);

  for (const rec of records) {
    for (let seat = 0; seat < players; seat++) {
      const name = rec.bots[seat]!;
      byBot[name] ??= { games: 0, wins: 0, rate: 0 };
      byBot[name].games++;
      bySeat[seat]!.games++;
      if (rec.winner === seat) { byBot[name].wins++; bySeat[seat]!.wins++; }
    }
    lengths.push(rec.rounds);
    const ended = rec.events[rec.events.length - 1];
    const reason = ended?.t === 'gameEnded' ? ended.reason : 'unknown';
    byReason[reason] = (byReason[reason] ?? 0) + 1;
    const d = decidedRound(rec.events, rec.winner);
    decidedRounds.push(d);
    decidedFracs.push(d / rec.rounds);

    const boughtBy: Record<string, Set<number>> = {};
    const modBy: Record<string, Set<number>> = {};
    const attacked = new Set<number>();
    const attackers = new Set<number>();
    let shop: string[] = [];
    const coins = Array.from({ length: players }, () => config.startCoins);
    let turn: { player: number; shop: string[] } | null = null;
    // An offer is a tile copy on display during a shop phase that the player could afford.
    const finalizeTurn = (coinsNow: number) => {
      if (!turn) return;
      for (const id of turn.shop) if (tiles[id] && cost.get(id)! <= coinsNow) tiles[id]!.offers++;
      turn = null;
    };
    for (const e of rec.events) {
      if (e.t === 'resource') {
        coins[e.player] = (coins[e.player] ?? 0) + (e.res === 'coins' ? e.delta : 0);
      } else if (e.t === 'shopRefilled') {
        shop = e.shop;
      } else if (e.t === 'rolled') {
        if (turn && turn.player === e.player) continue; // roll-again within the same turn
        finalizeTurn(coins[turn?.player ?? 0]!);
        turn = { player: e.player, shop: shop.slice() };
      } else if (e.t === 'roundEnded') {
        finalizeTurn(coins[turn?.player ?? 0]!);
      } else if (e.t === 'bought') {
        if (turn && turn.player === e.player) finalizeTurn(coins[e.player]! + e.cost);
        if (tiles[e.item]) {
          tiles[e.item]!.buys++;
          (boughtBy[e.item] ??= new Set()).add(e.player);
        } else if (mods[e.item]) {
          mods[e.item]!.buys++;
          (modBy[e.item] ??= new Set()).add(e.player);
        }
      } else if (e.t === 'sold') {
        if (tiles[e.tile]) tiles[e.tile]!.sells++;
      } else if (e.t === 'toll') {
        tollCount++;
        tollCoins += e.amount;
      } else if (e.t === 'corner') {
        cornerIncome += e.income;
      } else if (e.t === 'tileFired') {
        const cls = classOf.get(e.tile);
        if (cls && cls in fires) fires[cls]!++;
      } else if (e.t === 'attacked') {
        attackCount++;
        if (e.cancelled) cancelled++;
        attacked.add(e.target);
        attackers.add(e.attacker);
      }
    }
    for (const [id, set] of Object.entries(boughtBy)) {
      tileGamesBought[id] = (tileGamesBought[id] ?? 0) + 1;
      tiles[id]!.ownerGames += set.size;
      if (set.has(rec.winner)) tileOwnerWins[id] = (tileOwnerWins[id] ?? 0) + 1;
    }
    for (const id of Object.keys(modBy)) modGamesBought[id] = (modGamesBought[id] ?? 0) + 1;
    const standings = finalStandings(rec.events);
    for (const s of standings) {
      (attackers.has(s.player) ? vpAttackers : vpNonAttackers).push(s.vp);
      (attacked.has(s.player) ? vpTargets : vpNonTargets).push(s.vp);
    }
    const sortedVp = standings.map((s) => s.vp).sort((a, b) => b - a);
    const margin = sortedVp.length >= 2 ? sortedVp[0]! - sortedVp[1]! : 0;
    lopsided.push({ seed: rec.seed, winner: rec.winner, winnerBot: rec.bots[rec.winner]!, margin });
  }

  for (const b of Object.values(byBot)) b.rate = b.games ? b.wins / b.games : 0;
  for (const s of bySeat) s.rate = s.games ? s.wins / s.games : 0;
  for (const [id, t] of Object.entries(tiles)) {
    t.takeRate = t.offers ? t.buys / t.offers : 0;
    t.buyRate = games ? (tileGamesBought[id] ?? 0) / games : 0;
    t.ownerWinRate = t.ownerGames ? (tileOwnerWins[id] ?? 0) / t.ownerGames : 0;
    t.lift = t.ownerGames ? (t.ownerWinRate - 1 / players) * 100 : 0;
  }
  for (const [id, m] of Object.entries(mods)) m.buyRate = games ? (modGamesBought[id] ?? 0) / games : 0;
  const sortedLen = lengths.slice().sort((a, b) => a - b);
  const sortedDecided = decidedRounds.slice().sort((a, b) => a - b);
  const sortedFrac = decidedFracs.slice().sort((a, b) => a - b);
  lopsided.sort((a, b) => b.margin - a.margin);

  return {
    games,
    players,
    winRateByBot: byBot,
    winRateBySeat: bySeat,
    gameLength: {
      mean: mean(lengths), p10: percentile(sortedLen, 0.1), p50: percentile(sortedLen, 0.5), p90: percentile(sortedLen, 0.9),
      min: sortedLen[0] ?? NaN, max: sortedLen[sortedLen.length - 1] ?? NaN, byReason,
    },
    decidedBy: { medianRound: percentile(sortedDecided, 0.5), medianFraction: percentile(sortedFrac, 0.5) },
    tiles,
    mods,
    attacks: {
      perGame: games ? attackCount / games : 0,
      cancelledRate: attackCount ? cancelled / attackCount : 0,
      attackerLift: vpAttackers.length && vpNonAttackers.length ? mean(vpAttackers) - mean(vpNonAttackers) : 0,
      targetLift: vpTargets.length && vpNonTargets.length ? mean(vpTargets) - mean(vpNonTargets) : 0,
    },
    randomFloor: byBot['random'] ? byBot['random'].rate : null,
    ...(shared ? {
      tollsPerGame: games ? tollCount / games : 0,
      tollCoinsPerGame: games ? tollCoins / games : 0,
      cornerIncomePerGame: games ? cornerIncome / games : 0,
      firesByClass: Object.fromEntries(Object.entries(fires).map(([k, v]) => [k, games ? v / games : 0])),
    } : {}),
    lopsided: lopsided.slice(0, 10),
  };
}

/** Threshold breaches from the spec's metrics table. */
export function flagProblems(m: Metrics, config: GameConfig, opts: { placementLift?: number } = {}): string[] {
  const out: string[] = [];
  const botNames = Object.keys(m.winRateByBot);
  const fourMix = m.players === 4 && botNames.length === 4;
  for (const [name, s] of Object.entries(m.winRateByBot)) {
    if (fourMix && name !== 'random' && s.rate > 0.45) out.push(`archetype ${name} wins ${pct(s.rate)} (> 45%)`);
    if (fourMix && name !== 'random' && s.rate < 0.15) out.push(`archetype ${name} wins ${pct(s.rate)} (< 15%)`);
  }
  if (m.players === 4) {
    if (m.winRateBySeat[0]!.rate > 0.3) out.push(`seat 1 wins ${pct(m.winRateBySeat[0]!.rate)} (> 30%)`);
    if (m.winRateBySeat[3]!.rate < 0.2) out.push(`seat 4 wins ${pct(m.winRateBySeat[3]!.rate)} (< 20%)`);
  }
  if (config.endMode === 'turnCap') {
    if ((m.gameLength.byReason['turnCap'] ?? 0) === m.games && m.games > 0) out.push('turnCap: no game ended early (expected, see spec)');
  } else if (m.gameLength.p90 > 25) out.push(`game length p90 ${m.gameLength.p90} rounds (> 25)`);
  if ((m.gameLength.byReason['maxRounds'] ?? 0) > 0) out.push(`${m.gameLength.byReason['maxRounds']} games hit maxRounds`);
  if (m.decidedBy.medianFraction < 0.5) out.push(`decided by ${pct(m.decidedBy.medianFraction)} of game length (< 50%)`);
  for (const [id, t] of Object.entries(m.tiles)) {
    if (t.takeRate < 0.05) out.push(`tile ${id} taken ${pct(t.takeRate)} of the times offered (dead, < 5%)`);
    if (t.takeRate > 0.8) out.push(`tile ${id} taken ${pct(t.takeRate)} of the times offered (auto-buy, > 80%)`);
    if (t.ownerGames >= 20 && t.lift > 20) out.push(`tile ${id} win lift +${t.lift.toFixed(1)} pts (> +20)`);
    if (t.ownerGames >= 20 && t.lift < -10) out.push(`tile ${id} win lift ${t.lift.toFixed(1)} pts (< -10)`);
  }
  if (config.boardMode !== 'shared') { // shared mode has no attack class; its balance targets are not set yet
    if (m.attacks.perGame < 1) out.push(`attacks per game ${m.attacks.perGame.toFixed(2)} (< 1, useless)`);
    if (m.attacks.targetLift < -8) out.push(`attack target lift ${m.attacks.targetLift.toFixed(1)} VP (< -8, oppressive)`);
  }
  if (opts.placementLift != null && opts.placementLift < 3) out.push(`placement lift ${opts.placementLift.toFixed(1)} pts (< 3, cosmetic)`);
  if (m.randomFloor != null && fourMix && m.randomFloor > 0.2) out.push(`random wins ${pct(m.randomFloor)} (> 20%)`);
  return out;
}

export function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}
