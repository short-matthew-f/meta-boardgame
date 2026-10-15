// One-ply expected value. Each shop action is applied, the shop phase closed
// with `pass`, and the player's next roll averaged over every dice outcome.
// The score is (vp + coins × 0.5) differential against the leader.
// Only the best slot per tile is evaluated to keep the branching under ~40.
import type { Action, GameState, PlayerState } from '../engine/types.ts';
import { legalActions, previewRoll, step } from '../engine/engine.ts';
import { diceOutcomes, effectiveDice, landingDistribution, tileDef } from '../engine/board.ts';
import type { Bot } from './types.ts';

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

export const lookaheadBot: Bot = {
  name: 'lookahead',
  choose(state, legal, rng) {
    const me = state.activePlayer;
    const first = legal[0]!;
    if (legal.length === 1) return first;

    if (first.type === 'chooseTarget') {
      return argmax(legal, (a) => differential(step(state, a).state, me), rng);
    }
    if (first.type === 'reroll' || first.type === 'keepRoll') {
      const keep = step(state, { type: 'keepRoll' }).state;
      const keepV = keep.phase === 'shop' || keep.phase === 'ended' ? differential(keep, me) : differential(step(keep, previewTarget(keep, legalActions(keep))).state, me);
      // rerolling: average over outcomes of the next roll
      const rerollV = expectedAfterRoll({ ...state, pending: null }, me);
      return rerollV > keepV ? { type: 'reroll' } : { type: 'keepRoll' };
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

    return argmax(pruned, (a) => {
      const after = closeShop(step(state, a).state);
      if (after.phase === 'ended') return differential(after, me) * 10;
      return expectedAfterRoll(after, me);
    }, rng);
  },
};

function argmax<T>(items: T[], f: (x: T) => number, rng: { pick<U>(a: readonly U[]): U }): T {
  let best: T[] = [];
  let bestV = -Infinity;
  for (const it of items) {
    const v = f(it);
    if (v > bestV + 1e-9) { bestV = v; best = [it]; }
    else if (Math.abs(v - bestV) <= 1e-9) best.push(it);
  }
  return best.length === 1 ? best[0]! : rng.pick(best);
}
