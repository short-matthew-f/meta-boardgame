// Loop-board helpers shared by the engine, bots and metrics.
import type { DieSpec, GameConfig, GameState, PlayerState, Tag, TileDef, TileId } from './types.ts';

export function tileDef(config: GameConfig, id: TileId): TileDef {
  const def = config.tileSet.find((t) => t.id === id);
  if (!def) throw new Error(`unknown tile ${id}`);
  return def;
}

export function tileIndex(config: GameConfig): Map<TileId, TileDef> {
  return new Map(config.tileSet.map((t) => [t.id, t]));
}

export function hasTag(def: TileDef | undefined, tag: Tag): boolean {
  return !!def && def.tags.includes(tag);
}

/** Slots adjacent to `slot` on a loop of `size` (distinct, excluding itself). */
export function adjacentSlots(slot: number, size: number): number[] {
  if (size <= 1) return [];
  if (size === 2) return [(slot + 1) % 2];
  return [(slot - 1 + size) % size, (slot + 1) % size];
}

/** Is slot `slot` of `player` currently locked (inert)? */
export function isLocked(state: GameState, player: number, slot: number): boolean {
  return state.roundModifiers.some((m) => m.kind === 'lock' && m.player === player && m.slot === slot);
}

/** Active (non-null, non-locked) tile at a slot. */
export function activeTile(state: GameState, player: number, slot: number): TileDef | undefined {
  const id = state.players[player]!.board[slot];
  if (id == null || isLocked(state, player, slot)) return undefined;
  return tileDef(state.config, id);
}

export function countAdjacentWithTag(state: GameState, player: number, slot: number, tag: Tag): number {
  const size = state.players[player]!.board.length;
  let n = 0;
  for (const s of adjacentSlots(slot, size)) if (hasTag(activeTile(state, player, s), tag)) n++;
  return n;
}

export function countOwnedWithTag(state: GameState, player: number, tag: Tag): number {
  const p = state.players[player]!;
  let n = 0;
  for (let s = 0; s < p.board.length; s++) if (hasTag(activeTile(state, player, s), tag)) n++;
  return n;
}

export function ownedTileCount(p: PlayerState): number {
  return p.board.filter((t) => t != null).length;
}

/** The dice a player will actually roll, after round-scoped dice modifiers. */
export function effectiveDice(state: GameState, player: number): DieSpec[] {
  const p = state.players[player]!;
  const mod = state.roundModifiers.find((m) => m.kind === 'dice' && m.player === player);
  if (mod && mod.kind === 'dice') return p.dice.map(() => ({ sides: mod.sides }));
  return p.dice;
}

/** All (total, probability) outcomes of rolling a dice set. */
export function totalDistribution(dice: DieSpec[]): Map<number, number> {
  let dist = new Map<number, number>([[0, 1]]);
  for (const d of dice) {
    const next = new Map<number, number>();
    for (const [sum, p] of dist) {
      for (let f = 1; f <= d.sides; f++) {
        const s = sum + f;
        next.set(s, (next.get(s) ?? 0) + p / d.sides);
      }
    }
    dist = next;
  }
  return dist;
}

/**
 * Probability mass over the slots the token lands on with its next roll.
 * Shared by Greedy, Lookahead, and the placement metric.
 */
export function landingDistribution(position: number, dice: DieSpec[], boardSize: number): Map<number, number> {
  const out = new Map<number, number>();
  for (const [total, p] of totalDistribution(dice)) {
    const slot = (position + total) % boardSize;
    out.set(slot, (out.get(slot) ?? 0) + p);
  }
  return out;
}

/** Every concrete dice outcome (one value per die) with its probability. */
export function diceOutcomes(dice: DieSpec[]): { values: number[]; p: number }[] {
  let outs: { values: number[]; p: number }[] = [{ values: [], p: 1 }];
  for (const d of dice) {
    const next: { values: number[]; p: number }[] = [];
    for (const o of outs) for (let f = 1; f <= d.sides; f++) next.push({ values: [...o.values, f], p: o.p / d.sides });
    outs = next;
  }
  return outs;
}

/**
 * Probability that the token lands on each slot at least once within the
 * next `rolls` rolls (exact, by tracking the position distribution).
 * "Likely landing slot" for placement decisions.
 */
export function landingMass(position: number, dice: DieSpec[], boardSize: number, rolls = 3): Map<number, number> {
  const stepDist = totalDistribution(dice);
  // state: Map<position, Map<landedMask?>> would explode; instead track
  // P(not yet landed on s) per slot via independent position chains.
  // Positions are a Markov chain; P(land on s within k rolls) = 1 - P(avoid s for k rolls).
  const out = new Map<number, number>();
  for (let s = 0; s < boardSize; s++) {
    let dist = new Map<number, number>([[position, 1]]);
    let avoid = 1;
    for (let r = 0; r < rolls; r++) {
      const next = new Map<number, number>();
      let hit = 0;
      for (const [pos, p] of dist) {
        for (const [total, q] of stepDist) {
          const to = (pos + total) % boardSize;
          if (to === s) hit += p * q;
          else next.set(to, (next.get(to) ?? 0) + p * q);
        }
      }
      avoid -= hit;
      dist = next;
    }
    out.set(s, 1 - avoid);
  }
  return out;
}
