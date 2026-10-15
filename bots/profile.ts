// A bot archetype is a weight table. Every legal action is scored, the max
// wins, ties break with the bot RNG. Adding a style is adding a Profile.
import type { Action, Effect, GameState, Tag, TileDef } from '../engine/types.ts';
import type { Rng } from '../engine/rng.ts';
import { countAdjacentWithTag, effectiveDice, landingMass, tileDef } from '../engine/board.ts';
import type { Bot } from './types.ts';

export type TargetPolicy = 'coinLeader' | 'vpLeader' | 'random';
export type Placement = 'likely' | 'adjacentScore' | 'clusterCombo' | 'random';

export type Profile = {
  name: string;
  /** Tag weights before `switchRound` (1-based round) and from it on. */
  early: Partial<Record<Tag, number>>;
  late: Partial<Record<Tag, number>>;
  switchRound: number;
  /** Prefer the tile with the best static VP-per-coin among score tiles (Scorer). */
  vpPerCoin?: boolean;
  modWeights: Record<string, number>;
  /** Coins to keep in hand after buying a mod; mods are never bought below it. */
  modReserve: number;
  targetPolicy: TargetPolicy;
  placement: Placement;
  placementWeight: number;
  /** How many future rolls 'likely' placement looks across. */
  lookRolls?: number;
  /** Penalty per coin spent. */
  costWeight: number;
  /** Penalty for replacing an owned tile (scaled by the old tile's cost). */
  replaceWeight: number;
  sellWeight: number;
  passWeight: number;
  /** Reroll when the kept total is below this (0 never rerolls). */
  rerollBelow: number;
};

/** Static resource value of a tile per trigger, treating computed amounts as 1 per unit. */
export function staticValue(def: TileDef): { coins: number; vp: number } {
  const out = { coins: 0, vp: 0 };
  const walk = (effects: Effect[] | undefined) => {
    if (!effects) return;
    for (const e of effects) {
      if (e.op === 'gain' || e.op === 'steal') {
        const n = typeof e.amount === 'number' ? e.amount : e.amount.per * ('laps' in e.amount ? 4 : 1);
        out[e.res] += n;
      } else if (e.op === 'if') {
        walk(e.then);
        if (e.else) walk(e.else);
      }
    }
  };
  walk(def.onLand);
  walk(def.onPass);
  walk(def.onLap);
  return out;
}

function leaderBy(state: GameState, me: number, key: 'coins' | 'vp'): number {
  let best = -1;
  let bestV = -Infinity;
  for (const p of state.players) {
    if (p.id === me) continue;
    if (p[key] > bestV) { bestV = p[key]; best = p.id; }
  }
  return best;
}

function placementScore(state: GameState, me: number, slot: number, def: TileDef, placement: Placement, mass: () => Map<number, number>): number {
  switch (placement) {
    case 'likely': {
      if (!def.onLand) return 0;
      return mass().get(slot) ?? 0;
    }
    case 'adjacentScore':
      return countAdjacentWithTag(state, me, slot, 'score') / 2;
    case 'clusterCombo':
      return countAdjacentWithTag(state, me, slot, 'combo') / 2;
    case 'random':
      return 0;
  }
}

export function makeProfileBot(profile: Profile): Bot {
  return {
    name: profile.name,
    choose(state, legal, rng) {
      const me = state.activePlayer;
      const first = legal[0]!;
      // Pending prompts
      if (first.type === 'chooseTarget') {
        const want = profile.targetPolicy === 'coinLeader' ? leaderBy(state, me, 'coins')
          : profile.targetPolicy === 'vpLeader' ? leaderBy(state, me, 'vp') : -1;
        const hit = legal.find((a) => a.type === 'chooseTarget' && a.player === want);
        return hit ?? rng.pick(legal);
      }
      if (first.type === 'reroll' || first.type === 'keepRoll') {
        const total = state.pending?.lastTotal ?? 0;
        return total < profile.rerollBelow ? { type: 'reroll' } : { type: 'keepRoll' };
      }
      if (legal.length === 1) return first;

      const weights = state.round < profile.switchRound ? profile.early : profile.late;
      const p = state.players[me]!;
      let massCache: Map<number, number> | null = null;
      const mass = () => (massCache ??= landingMass(p.position, effectiveDice(state, me), p.board.length, profile.lookRolls ?? 3));
      let best: Action[] = [];
      let bestScore = -Infinity;
      for (const a of legal) {
        const s = score(a);
        if (s > bestScore + 1e-9) { bestScore = s; best = [a]; }
        else if (Math.abs(s - bestScore) <= 1e-9) best.push(a);
      }
      return best.length === 1 ? best[0]! : rng.pick(best);

      function tagWeight(def: TileDef): number {
        let w = -Infinity;
        for (const t of def.tags) w = Math.max(w, weights[t] ?? 0);
        return w === -Infinity ? 0 : w;
      }

      function score(a: Action): number {
        switch (a.type) {
          case 'pass':
            return profile.passWeight;
          case 'buyTile': {
            const def = tileDef(state.config, state.shop[a.shopIndex]!);
            let s = tagWeight(def);
            if (profile.vpPerCoin && def.tags.includes('score')) s += (staticValue(def).vp / def.cost) * 4;
            s += placementScore(state, me, a.slot, def, profile.placement, mass) * profile.placementWeight;
            s -= def.cost * profile.costWeight;
            const old = p.board[a.slot];
            if (old != null) s -= tileDef(state.config, old).cost * profile.replaceWeight;
            return s;
          }
          case 'buyExpansion': {
            const def = tileDef(state.config, state.shop[a.shopIndex]!);
            let s = tagWeight(def) - def.cost * profile.costWeight;
            if (def.insertTile) s += 0.5;
            return s;
          }
          case 'buyMod': {
            const cost = state.config.modSet.find((m) => m.id === a.modId)?.cost ?? 0;
            if (p.coins - cost < profile.modReserve) return -Infinity;
            return (profile.modWeights[a.modId] ?? -1) - cost * profile.costWeight;
          }
          case 'sellTile':
            return profile.sellWeight;
          default:
            return 0;
        }
      }
    },
  };
}
