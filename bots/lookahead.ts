// One-ply expected value. Each shop action is applied, the shop phase closed
// with `pass`, and the player's next roll averaged over every dice outcome.
// The score is (vp + coins × 0.5) differential against the leader.
// Only the best slot per tile is evaluated to keep the branching under ~40.
import type { Action, GameState, PlayerState } from '../engine/types.ts';
import type { Rng } from '../engine/rng.ts';
import { legalActions, previewRoll, step } from '../engine/engine.ts';
import { diceOutcomes, effectiveDice, landingDistribution, tileDef } from '../engine/board.ts';
import type { Bot, Decision } from './types.ts';
import { buildDecision, onlyOption, pickBest, sgn, shortLabel } from './explain.ts';

const COIN_WEIGHT = 0.5;
/** Owned tiles count as assets at a fraction of their cost, so a one-ply search still invests. */
const ASSET_WEIGHT = 0.45;

function material(s: GameState, p: PlayerState): number {
  let assets = 0;
  for (const id of p.board) if (id != null) assets += tileDef(s.config, id).cost;
  return p.vp + p.coins * COIN_WEIGHT + assets * ASSET_WEIGHT;
}

function differential(s: GameState, me: number): number {
  let best = -Infinity;
  for (const p of s.players) if (p.id !== me) best = Math.max(best, material(s, p));
  return material(s, s.players[me]!) - best;
}

/** Pick targets inside a preview: the opponent with the most material. */
function previewTarget(s: GameState, legal: Action[]): Action {
  let best = legal[0]!;
  let bestV = -Infinity;
  for (const a of legal) {
    if (a.type !== 'chooseTarget') continue;
    const v = material(s, s.players[a.player]!);
    if (v > bestV) { bestV = v; best = a; }
  }
  return best;
}

/** Expected differential after `me` takes one more roll from `s`. */
export function expectedAfterRoll(s: GameState, me: number): number {
  const dice = effectiveDice(s, me);
  let ev = 0;
  for (const o of diceOutcomes(dice)) {
    const next = previewRoll(s, me, o.values, previewTarget);
    ev += o.p * differential(next, me);
  }
  return ev;
}

function closeShop(s: GameState): GameState {
  let st = s;
  let guard = 0;
  while (st.phase === 'shop' && guard++ < 10) st = step(st, { type: 'pass' }).state;
  return st;
}

/**
 * Every option the bot weighs, with its expected differential. Shared by
 * `choose` and `decide`. `rule` says how the winner is picked: 'argmax' with
 * Rng tie-breaks, or 'reroll' (items are [keepRoll, reroll]; reroll only when strictly better).
 */
type Evaluation = {
  kind: 'target' | 'reroll' | 'shop';
  rule: 'argmax' | 'reroll';
  items: Action[];
  values: number[];
  /** Shop options after which the game is over (valued at ten times the differential). */
  ends: boolean[];
  /** How many legal actions the pruning left out of `items`. */
  pruned: number;
};

function evaluate(state: GameState, legal: Action[]): Evaluation {
  const me = state.activePlayer;
  const first = legal[0]!;

  if (first.type === 'chooseTarget') {
    return {
      kind: 'target', rule: 'argmax', items: legal, ends: [], pruned: 0,
      values: legal.map((a) => differential(step(state, a).state, me)),
    };
  }
  if (first.type === 'reroll' || first.type === 'keepRoll') {
    const keep = step(state, { type: 'keepRoll' }).state;
    const keepV = keep.phase === 'shop' || keep.phase === 'ended' ? differential(keep, me) : differential(step(keep, previewTarget(keep, legalActions(keep))).state, me);
    // rerolling: average over outcomes of the next roll
    const rerollV = expectedAfterRoll({ ...state, pending: null }, me);
    return { kind: 'reroll', rule: 'reroll', items: [{ type: 'keepRoll' }, { type: 'reroll' }], values: [keepV, rerollV], ends: [], pruned: 0 };
  }

  // Shop phase: prune buyTile to the best slot per tile by landing probability
  const p = state.players[me]!;
  const dist = landingDistribution(p.position, effectiveDice(state, me), p.board.length);
  const bestSlot = new Map<number, { action: Action; score: number }>();
  const pruned: Action[] = [];
  for (const a of legal) {
    if (a.type === 'buyTile') {
      const def = tileDef(state.config, state.shop[a.shopIndex]!);
      const old = p.board[a.slot];
      const score = (def.onLand ? (dist.get(a.slot) ?? 0) : 0) - (old != null ? 0.05 * tileDef(state.config, old).cost : 0) + (old == null ? 0.001 : 0);
      const cur = bestSlot.get(a.shopIndex);
      if (!cur || score > cur.score) bestSlot.set(a.shopIndex, { action: a, score });
    } else if (a.type === 'buyExpansion') {
      if (a.afterSlot === p.position) pruned.push(a); // one insertion point: right after the token
    } else pruned.push(a);
  }
  for (const { action } of bestSlot.values()) pruned.push(action);

  const ends: boolean[] = [];
  const values = pruned.map((a) => {
    const after = closeShop(step(state, a).state);
    if (after.phase === 'ended') { ends.push(true); return differential(after, me) * 10; }
    ends.push(false);
    return expectedAfterRoll(after, me);
  });
  return { kind: 'shop', rule: 'argmax', items: pruned, values, ends, pruned: legal.length - pruned.length };
}

function pickIndex(ev: Evaluation, rng: Rng): number {
  if (ev.rule === 'reroll') return ev.values[1]! > ev.values[0]! ? 1 : 0;
  return pickBest(ev.values, rng);
}

export const lookaheadBot: Bot = {
  name: 'lookahead',

  choose(state, legal, rng) {
    if (legal.length === 1) return legal[0]!;
    const ev = evaluate(state, legal);
    return ev.items[pickIndex(ev, rng)]!;
  },

  decide(state, legal, rng): Decision {
    if (legal.length === 1) return onlyOption(state, legal[0]!);
    const ev = evaluate(state, legal);
    const chosen = pickIndex(ev, rng);
    const why = (i: number): string => {
      const a = ev.items[i]!;
      const v = ev.values[i]!;
      if (ev.kind === 'target') return `${shortLabel(state, a)}: EV ${sgn(v, 2)} vs leader after the attack resolves`;
      if (ev.kind === 'reroll') {
        return a.type === 'reroll'
          ? `Reroll: EV ${sgn(v, 2)} vs leader, averaged over the new roll`
          : `Keep roll: EV ${sgn(v, 2)} vs leader with the current roll`;
      }
      if (ev.ends[i]) return `${shortLabel(state, a)}: ends the game, ${sgn(ev.values[i]! / 10, 2)} vs leader (counted ×10)`;
      return `${shortLabel(state, a)}: EV ${sgn(v, 2)} vs leader after next roll`;
    };
    let note = 'one-ply expected value: (VP + 0.5 × coins + 0.45 × cost of owned tiles) against the best opponent';
    if (ev.pruned > 0) note += `; shop options pruned to the best slot per tile (${ev.items.length} of ${legal.length} evaluated)`;
    return buildDecision(ev.items, ev.values, chosen, why, note, undefined, (i) => shortLabel(state, ev.items[i]!));
  },
};
