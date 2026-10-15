// A bot archetype is a weight table. Every legal action is scored, the max
// wins, ties break with the bot RNG. Adding a style is adding a Profile.
import type { Action, Effect, GameState, PlayerState, Tag, TileDef } from '../engine/types.ts';
import type { Rng } from '../engine/rng.ts';
import { countAdjacentWithTag, effectiveDice, landingMass, tileDef } from '../engine/board.ts';
import { modName, tileName } from '../engine/describe.ts';
import type { Bot, Decision } from './types.ts';
import { buildDecision, fixed, num, onlyOption, pickBest, sgn, shortLabel } from './explain.ts';

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
      if ((e.op === 'gain' && (e.who == null || e.who === 'self')) || e.op === 'steal') {
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
  walk(def.effects);
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

/** Raw landing/adjacency measure behind the placement term (before `placementWeight`). */
function placementRaw(state: GameState, me: number, slot: number, def: TileDef, placement: Placement, mass: () => Map<number, number>): number {
  if (state.shared) return 0; // shared-board placement is not designed yet: no placement term
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

// ---------------------------------------------------------------------------
// Scoring. `scoreAction` is the one place the numbers are computed; it fills
// `Parts` with every term it added so `decide` can describe them. `choose`
// passes a scratch Parts and ignores it, so nothing is formatted on that path.

type Parts = {
  tagName: Tag | null; // tag that supplied the tag weight
  tag: number; // tag weight
  vpc: number; // VP-per-coin bonus (Scorer)
  placeRaw: number; // landing probability or adjacency measure
  place: number; // placeRaw × placementWeight
  cost: number; // penalty subtracted for coins spent
  replace: number; // penalty subtracted for replacing a tile
  replaced: string | null; // id of the tile being replaced
  insert: number; // bonus for an Expansion that carries a tile
  weight: number; // mod weight
  listed: boolean; // mod weight came from the profile
  base: number; // pass / sell weight
  blocked: boolean; // mod purchase refused by the coin reserve
};

function newParts(): Parts {
  return { tagName: null, tag: 0, vpc: 0, placeRaw: 0, place: 0, cost: 0, replace: 0, replaced: null, insert: 0, weight: 0, listed: false, base: 0, blocked: false };
}

type ScoreCtx = {
  profile: Profile;
  state: GameState;
  me: number;
  p: PlayerState;
  weights: Partial<Record<Tag, number>>;
  mass: () => Map<number, number>;
};

function makeCtx(profile: Profile, state: GameState): ScoreCtx {
  const me = state.activePlayer;
  const p = state.players[me]!;
  let massCache: Map<number, number> | null = null;
  return {
    profile, state, me, p,
    weights: state.round < profile.switchRound ? profile.early : profile.late,
    mass: () => (massCache ??= landingMass(p.position, effectiveDice(state, me), p.board.length, profile.lookRolls ?? 3)),
  };
}

function tagWeight(c: ScoreCtx, def: TileDef, parts: Parts): number {
  let w = -Infinity;
  parts.tagName = null;
  for (const t of def.tags) {
    const x = c.weights[t] ?? 0;
    if (x > w) { w = x; parts.tagName = t; }
  }
  return w === -Infinity ? 0 : w;
}

function scoreAction(c: ScoreCtx, a: Action, parts: Parts): number {
  const { profile, state, me, p } = c;
  switch (a.type) {
    case 'pass':
      parts.base = profile.passWeight;
      return profile.passWeight;
    case 'buyTile': {
      const def = tileDef(state.config, state.shop[a.shopIndex]!);
      let s = parts.tag = tagWeight(c, def, parts);
      parts.vpc = 0;
      if (profile.vpPerCoin && def.tags.includes('score')) s += parts.vpc = (staticValue(def).vp / def.cost) * 4;
      parts.placeRaw = placementRaw(state, me, a.slot, def, profile.placement, c.mass);
      s += parts.place = parts.placeRaw * profile.placementWeight;
      s -= parts.cost = def.cost * profile.costWeight;
      const old = p.board[a.slot];
      parts.replace = 0;
      parts.replaced = old ?? null;
      if (old != null) s -= parts.replace = tileDef(state.config, old).cost * profile.replaceWeight;
      return s;
    }
    case 'buyExpansion': {
      const def = tileDef(state.config, state.shop[a.shopIndex]!);
      let s = (parts.tag = tagWeight(c, def, parts)) - (parts.cost = def.cost * profile.costWeight);
      parts.insert = 0;
      if (def.insertTile) s += parts.insert = 0.5;
      return s;
    }
    case 'buyMod': {
      const cost = state.config.modSet.find((m) => m.id === a.modId)?.cost ?? 0;
      if (p.coins - cost < profile.modReserve) { parts.blocked = true; return -Infinity; }
      parts.listed = a.modId in profile.modWeights;
      parts.weight = profile.modWeights[a.modId] ?? -1;
      return parts.weight - (parts.cost = cost * profile.costWeight);
    }
    case 'sellTile':
      parts.base = profile.sellWeight;
      return profile.sellWeight;
    default:
      return 0;
  }
}

// Prompts shared by choose and decide.

function targetStat(profile: Profile): 'coins' | 'vp' | null {
  return profile.targetPolicy === 'coinLeader' ? 'coins' : profile.targetPolicy === 'vpLeader' ? 'vp' : null;
}

function rerolls(profile: Profile, state: GameState): boolean {
  return (state.pending?.lastTotal ?? 0) < profile.rerollBelow;
}

function weightList(w: Partial<Record<Tag, number>>): string {
  const parts = Object.entries(w).map(([k, v]) => `${k} ${num(v as number)}`);
  return parts.length > 0 ? parts.join(', ') : 'all zero';
}

export function makeProfileBot(profile: Profile): Bot {
  return {
    name: profile.name,

    choose(state, legal, rng) {
      const me = state.activePlayer;
      const first = legal[0]!;
      // Pending prompts
      if (first.type === 'chooseTarget') {
        const stat = targetStat(profile);
        const want = stat ? leaderBy(state, me, stat) : -1;
        const hit = legal.find((a) => a.type === 'chooseTarget' && a.player === want);
        return hit ?? rng.pick(legal);
      }
      if (first.type === 'reroll' || first.type === 'keepRoll') {
        return rerolls(profile, state) ? { type: 'reroll' } : { type: 'keepRoll' };
      }
      if (legal.length === 1) return first;

      const c = makeCtx(profile, state);
      const scratch = newParts();
      const scores = new Array<number>(legal.length);
      for (let i = 0; i < legal.length; i++) scores[i] = scoreAction(c, legal[i]!, scratch);
      return legal[pickBest(scores, rng)]!;
    },

    decide(state, legal, rng): Decision {
      const me = state.activePlayer;
      const first = legal[0]!;

      if (first.type === 'chooseTarget') {
        const stat = targetStat(profile);
        const want = stat ? leaderBy(state, me, stat) : -1;
        const hitIdx = legal.findIndex((a) => a.type === 'chooseTarget' && a.player === want);
        const chosen = hitIdx >= 0 ? hitIdx : legal.indexOf(rng.pick(legal));
        const value = (a: Action) => (stat && a.type === 'chooseTarget' ? state.players[a.player]![stat] : 0);
        const scores = legal.map(value);
        const unit = stat === 'vp' ? 'VP' : 'coins';
        const leaderV = stat ? scores[chosen]! : 0;
        const why = (i: number) => {
          const label = shortLabel(state, legal[i]!);
          if (!stat) return i === chosen ? `${label}: picked at random from ${legal.length} targets` : `${label}: one of ${legal.length} equally likely targets`;
          const v = scores[i]!;
          const tied = scores.some((x, j) => j !== i && x === v);
          if (i === chosen) return `${label}: ${stat === 'vp' ? 'VP' : 'coin'} leader (${v} ${unit}${tied ? ', tied; lowest seat first' : ''})`;
          return v === leaderV ? `${label}: ${v} ${unit}, tied with the leader` : `${label}: ${v} ${unit}, behind the leader`;
        };
        const note = `${profile.name}: target policy is ${profile.targetPolicy}`;
        return buildDecision(legal, scores, chosen, why, note, undefined, (i) => shortLabel(state, legal[i]!));
      }

      if (first.type === 'reroll' || first.type === 'keepRoll') {
        const total = state.pending?.lastTotal ?? 0;
        const t = profile.rerollBelow;
        const doReroll = rerolls(profile, state);
        const chosen = legal.findIndex((a) => a.type === (doReroll ? 'reroll' : 'keepRoll'));
        const scores = legal.map((a) => (a.type === 'reroll' ? t : total));
        const why = (i: number) => {
          const isReroll = legal[i]!.type === 'reroll';
          if (t === 0) return isReroll ? `Reroll: ${profile.name} never rerolls (threshold 0)` : `Keep ${total}: ${profile.name} never rerolls (threshold 0)`;
          if (isReroll) return doReroll ? `Reroll: ${total} is below reroll threshold ${t}` : `Reroll: only done below ${t}, and ${total} is not`;
          return doReroll ? `Keep ${total}: below reroll threshold ${t}, so rerolling instead` : `Keep ${total}: at or above reroll threshold ${t}`;
        };
        const note = t === 0 ? `${profile.name}: never rerolls` : `${profile.name}: rerolls when the total is below ${t}`;
        return buildDecision(legal, scores, chosen, why, note, undefined, (i) => shortLabel(state, legal[i]!));
      }

      if (legal.length === 1) return onlyOption(state, first);

      const c = makeCtx(profile, state);
      const parts: Parts[] = [];
      const scores = legal.map((a) => {
        const pr = newParts();
        parts.push(pr);
        return scoreAction(c, a, pr);
      });
      const chosen = pickBest(scores, rng);
      const cfg = state.config;

      const why = (i: number): string => {
        const a = legal[i]!;
        const pr = parts[i]!;
        const label = shortLabel(state, a);
        switch (a.type) {
          case 'pass':
            return i === chosen ? `Pass: nothing scores above ${num(pr.base)}` : `Pass: baseline ${num(pr.base)}`;
          case 'buyTile': {
            const def = tileDef(cfg, state.shop[a.shopIndex]!);
            const bits = [`${pr.tagName ?? def.tags[0]} ${sgn(pr.tag)}`];
            if (pr.vpc !== 0) bits.push(`VP per coin ${sgn(pr.vpc)}`);
            if (pr.placeRaw > 0) {
              if (profile.placement === 'likely') bits.push(`lands ${Math.round(pr.placeRaw * 100)}% in ${profile.lookRolls ?? 3} rolls ${sgn(pr.place)}`);
              else {
                const n = Math.round(pr.placeRaw * 2);
                bits.push(`${n} adjacent ${profile.placement === 'adjacentScore' ? 'score' : 'combo'} ${n === 1 ? 'tile' : 'tiles'} ${sgn(pr.place)}`);
              }
            }
            bits.push(`cost ${sgn(-pr.cost, 2)}`);
            if (pr.replaced != null) bits.push(`replacing ${tileName(cfg, pr.replaced)} ${sgn(-pr.replace, 2)}`);
            return `${label}: ${bits.join(', ')}`;
          }
          case 'buyExpansion': {
            const def = tileDef(cfg, state.shop[a.shopIndex]!);
            const bits = [`${pr.tagName ?? def.tags[0]} ${sgn(pr.tag)}`];
            if (pr.insert !== 0 && def.insertTile) bits.push(`comes with a ${tileName(cfg, def.insertTile)} ${sgn(pr.insert)}`);
            bits.push(`cost ${sgn(-pr.cost, 2)}`);
            return `${label}: ${bits.join(', ')}`;
          }
          case 'buyMod':
            return `${modName(cfg, a.modId)}: mod weight ${fixed(pr.weight)}${pr.listed ? '' : ' (not in profile)'}, cost ${sgn(-pr.cost, 2)}`;
          case 'sellTile':
            return `${label}: ${num(pr.base)}`;
          default:
            return label;
        }
      };

      const late = state.round >= profile.switchRound;
      let note = `${profile.name}: round ${state.round} ${late ? '≥' : '<'} switch round ${profile.switchRound}, using ${late ? 'late' : 'early'} weights (${weightList(c.weights)})`;
      const blocked = parts.filter((x) => x.blocked).length;
      if (blocked > 0) note += `; ${blocked} mod ${blocked === 1 ? 'purchase' : 'purchases'} skipped to keep a ${profile.modReserve}-coin reserve`;
      const group = (i: number): string => {
        const a = legal[i]!;
        switch (a.type) {
          case 'buyTile': case 'buyExpansion': return `tile:${state.shop[a.shopIndex]}`;
          case 'buyMod': return `mod:${a.modId}`;
          case 'sellTile': return `sell:${c.p.board[a.slot]}`;
          default: return a.type;
        }
      };
      return buildDecision(legal, scores, chosen, why, note, group, (i) => shortLabel(state, legal[i]!));
    },
  };
}
