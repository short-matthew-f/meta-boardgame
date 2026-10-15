// Traffic on the shared loop: how likely each token is to pass or land on each
// slot in the next few rolls. Pure functions of dice and positions, used by the
// shared-board bots to place tiles (civics want traffic, tolls want landings).
//
// Everything is exact for the dice alone (movers, roll-agains and reroll tokens
// are ignored). A token only moves forward, so it passes the slot `d` places
// ahead within k rolls exactly when the sum of its k rolls is at least `d`;
// landing "at least once" is computed with an avoid-chain like `landingMass`
// in board.ts. Both depend only on (dice, board size, rolls) and the offset
// from the token, so the tables are memoised and a call is a rotation.
import type { DieSpec, GameState } from './types.ts';
import { effectiveDice, totalDistribution } from './board.ts';
import { sharedSize } from './sharedBoard.ts';

type Table = { pass: Float64Array; land: Float64Array };

const tables = new Map<string, Table>();

/** Masses by offset from the token: index `o` is the slot `o` places ahead (0 = the token's own slot, one full lap away). */
function relativeTable(dice: DieSpec[], size: number, rolls: number): Table {
  const key = `${dice.map((d) => d.sides).sort((a, b) => a - b).join(',')}|${size}|${rolls}`;
  let t = tables.get(key);
  if (t) return t;
  const step = totalDistribution(dice);

  // pass: P(sum of k rolls >= d), d = o (or size for o = 0)
  let sum = new Map<number, number>([[0, 1]]);
  for (let r = 0; r < rolls; r++) {
    const next = new Map<number, number>();
    for (const [s, p] of sum) for (const [x, q] of step) next.set(s + x, (next.get(s + x) ?? 0) + p * q);
    sum = next;
  }
  const pass = new Float64Array(size);
  for (let o = 0; o < size; o++) {
    const d = o === 0 ? size : o;
    let m = 0;
    for (const [s, p] of sum) if (s >= d) m += p;
    pass[o] = m;
  }

  // land: P(the token stops on the slot at least once within k rolls)
  const land = new Float64Array(size);
  for (let o = 0; o < size; o++) {
    let dist = new Map<number, number>([[0, 1]]);
    let avoid = 1;
    for (let r = 0; r < rolls; r++) {
      const next = new Map<number, number>();
      let hit = 0;
      for (const [pos, p] of dist) {
        for (const [x, q] of step) {
          const to = (pos + x) % size;
          if (to === o) hit += p * q;
          else next.set(to, (next.get(to) ?? 0) + p * q);
        }
      }
      avoid -= hit;
      dist = next;
    }
    land[o] = 1 - avoid;
  }
  t = { pass, land };
  tables.set(key, t);
  return t;
}

function rotate(rel: Float64Array, position: number, size: number): Map<number, number> {
  const out = new Map<number, number>();
  for (let s = 0; s < size; s++) out.set(s, rel[(((s - position) % size) + size) % size]!);
  return out;
}

/**
 * Probability that a token at `position` passes OR lands on each slot at least
 * once within its next `rolls` rolls. Exact, like `landingMass` (board.ts) but
 * counting every slot swept, so it is never below the landing mass.
 */
export function passMass(position: number, dice: DieSpec[], boardSize: number, rolls = 3): Map<number, number> {
  return rotate(relativeTable(dice, boardSize, rolls).pass, position, boardSize);
}

/** Same as `landingMass` in board.ts (memoised by dice, board size and rolls). */
export function landMass(position: number, dice: DieSpec[], boardSize: number, rolls = 3): Map<number, number> {
  return rotate(relativeTable(dice, boardSize, rolls).land, position, boardSize);
}

export type TrafficMaps = {
  /** The player the maps are relative to (the active player). */
  me: number;
  /** The opponent with the most VP (ties: most coins, then lowest seat); the maps below use it for `leaderLand`. */
  leader: number;
  rolls: number;
  /** Per slot: my token passes or lands within `rolls` rolls. */
  ownPass: number[];
  /** Per slot: my token lands. */
  ownLand: number[];
  /** Per slot: the sum over opponents of their pass masses. */
  oppPass: number[];
  /** Per slot: the sum over opponents of their landing masses. */
  oppLand: number[];
  /** Per slot: the VP leader's landing mass. */
  leaderLand: number[];
};

/** The opponent of `me` with the most VP, ties broken by coins then lower seat. */
export function vpLeader(state: GameState, me: number): number {
  let best = -1;
  for (const p of state.players) {
    if (p.id === me) continue;
    const b = best < 0 ? null : state.players[best]!;
    if (!b || p.vp > b.vp || (p.vp === b.vp && p.coins > b.coins)) best = p.id;
  }
  return best;
}

/**
 * Pass and landing masses for the shared loop, relative to the active player.
 * Compute once per decision: the legal list is a few hundred actions that all
 * read the same maps.
 */
export function trafficMaps(state: GameState, rolls = 3, me = state.activePlayer): TrafficMaps {
  const size = sharedSize(state.config);
  const zero = () => new Array<number>(size).fill(0);
  const leader = vpLeader(state, me);
  const out: TrafficMaps = { me, leader, rolls, ownPass: zero(), ownLand: zero(), oppPass: zero(), oppLand: zero(), leaderLand: zero() };
  for (const p of state.players) {
    const t = relativeTable(effectiveDice(state, p.id), size, rolls);
    for (let s = 0; s < size; s++) {
      const o = (((s - p.position) % size) + size) % size;
      if (p.id === me) {
        out.ownPass[s] = t.pass[o]!;
        out.ownLand[s] = t.land[o]!;
      } else {
        out.oppPass[s]! += t.pass[o]!;
        out.oppLand[s]! += t.land[o]!;
        if (p.id === leader) out.leaderLand[s] = t.land[o]!;
      }
    }
  }
  return out;
}
