// Shared-board geometry and read-only queries: corners, sides, neighbours,
// ownership counts and landmark passives. Pure functions over state; nothing
// here runs effects or changes anything (see shared.ts for the rules).
// Imports only types, so board.ts, effects.ts and shared.ts can all use it.
import type {
  GameConfig, GameState, LandmarkDef, LandmarkId, Passive, SharedSlot, Tag, TileClass, TileDef, TileId,
} from './types.ts';

// ---------------------------------------------------------------------------
// Lookups (cached per array, config sets are shared by every state of a game)

const cache = new WeakMap<object, Map<string, unknown>>();

function indexOf<T extends { id: string }>(list: readonly T[]): Map<string, T> {
  let m = cache.get(list) as Map<string, T> | undefined;
  if (!m) {
    m = new Map(list.map((x) => [x.id, x]));
    cache.set(list, m);
  }
  return m;
}

export function landmarkDef(config: Pick<GameConfig, 'landmarkSet'>, id: LandmarkId): LandmarkDef | undefined {
  return indexOf(config.landmarkSet).get(id);
}

export function sharedTileDef(config: Pick<GameConfig, 'tileSet'>, id: TileId): TileDef | undefined {
  return indexOf(config.tileSet).get(id);
}

/** Cost of whatever stands in a slot (tile or landmark). */
export function itemCost(config: GameConfig, id: string): number {
  return (landmarkDef(config, id) ?? sharedTileDef(config, id))?.cost ?? 0;
}

// ---------------------------------------------------------------------------
// Geometry. Slot p × sideLength is player p's corner; the slots after it up to
// the next corner are p's side.

export function sharedSize(c: Pick<GameConfig, 'players' | 'sideLength'>): number {
  return c.players * c.sideLength;
}

export function makeSharedSlots(c: Pick<GameConfig, 'players' | 'sideLength'>): SharedSlot[] {
  const slots: SharedSlot[] = [];
  for (let i = 0; i < sharedSize(c); i++) {
    slots.push({ tile: null, owner: null, corner: i % c.sideLength === 0 ? i / c.sideLength : null });
  }
  return slots;
}

export function isCorner(c: Pick<GameConfig, 'sideLength'>, slot: number): boolean {
  return slot % c.sideLength === 0;
}

/** The side a slot is on: the player whose corner starts it. */
export function sideOf(c: Pick<GameConfig, 'sideLength'>, slot: number): number {
  return Math.floor(slot / c.sideLength);
}

/** The next corner clockwise, strictly after `pos`. */
export function nextCorner(c: Pick<GameConfig, 'players' | 'sideLength'>, pos: number): number {
  return ((Math.floor(pos / c.sideLength) + 1) * c.sideLength) % sharedSize(c);
}

export function nextToCorner(c: Pick<GameConfig, 'sideLength'>, slot: number): boolean {
  const r = slot % c.sideLength;
  return r === 1 || r === c.sideLength - 1;
}

/** The slots either side of `slot` on the shared loop. */
export function sharedNeighbours(c: Pick<GameConfig, 'players' | 'sideLength'>, slot: number): number[] {
  const n = sharedSize(c);
  return [(slot - 1 + n) % n, (slot + 1) % n];
}

// ---------------------------------------------------------------------------
// Ownership

/** Id of the tile or landmark at `slot` if `player` owns it. */
export function ownedAt(st: GameState, player: number, slot: number): string | null {
  const s = st.shared!.slots[slot];
  return s && s.owner === player ? s.tile : null;
}

/** Slots `player` owns (tiles and landmarks). */
export function ownedSlots(st: GameState, player: number): number[] {
  const out: number[] = [];
  st.shared!.slots.forEach((s, i) => { if (s.owner === player && s.tile != null) out.push(i); });
  return out;
}

export function ownedSharedCount(st: GameState, player: number): number {
  let n = 0;
  for (const s of st.shared!.slots) if (s.owner === player && s.tile != null) n++;
  return n;
}

export function ownedSharedCost(st: GameState, player: number): number {
  let n = 0;
  for (const s of st.shared!.slots) if (s.owner === player && s.tile != null) n += itemCost(st.config, s.tile);
  return n;
}

/** Tiles (not landmarks) `player` owns that satisfy `pred`. */
function countOwned(st: GameState, player: number, pred: (d: TileDef) => boolean, slots?: Iterable<number>): number {
  const all = st.shared!.slots;
  let n = 0;
  const check = (s: SharedSlot | undefined) => {
    if (!s || s.owner !== player || s.tile == null) return;
    const d = sharedTileDef(st.config, s.tile);
    if (d && pred(d)) n++;
  };
  if (slots) for (const i of slots) check(all[i]);
  else for (const s of all) check(s);
  return n;
}

export function ownedWithClass(st: GameState, player: number, cls: TileClass): number {
  return countOwned(st, player, (d) => d.class === cls);
}

export function ownedWithSharedTag(st: GameState, player: number, tag: Tag): number {
  return countOwned(st, player, (d) => d.tags.includes(tag));
}

export function adjacentOwnedWithClass(st: GameState, owner: number, slot: number, cls: TileClass): number {
  return countOwned(st, owner, (d) => d.class === cls, sharedNeighbours(st.config, slot));
}

export function adjacentOwnedWithSharedTag(st: GameState, owner: number, slot: number, tag: Tag): number {
  return countOwned(st, owner, (d) => d.tags.includes(tag), sharedNeighbours(st.config, slot));
}

/** Tiles `player` owns on the side `slot` is on. */
export function ownedOnSide(st: GameState, player: number, slot: number): number {
  const c = st.config;
  const side = sideOf(c, slot);
  const slots: number[] = [];
  for (let i = side * c.sideLength + 1; i < (side + 1) * c.sideLength; i++) slots.push(i);
  return countOwned(st, player, () => true, slots);
}

// ---------------------------------------------------------------------------
// Landmark passives

function passivesOf(st: GameState, player: number): Passive[] {
  const out: Passive[] = [];
  for (const id of st.players[player]!.landmarks) {
    const p = landmarkDef(st.config, id)?.passive;
    if (p) out.push(p);
  }
  return out;
}

export function hasPassive(st: GameState, player: number, key: 'noReplace' | 'tollFree'): boolean {
  return passivesOf(st, player).some((p) => p[key]);
}

export function passiveSum(st: GameState, player: number, key: 'civicBonus' | 'shopDiscount' | 'visitorLandVp'): number {
  let n = 0;
  for (const p of passivesOf(st, player)) n += p[key] ?? 0;
  return n;
}

/** The owner's dice sides from a `dieSides` passive, if any. */
export function passiveDieSides(st: GameState, player: number): number | null {
  let sides: number | null = null;
  for (const p of passivesOf(st, player)) if (p.dieSides != null) sides = Math.max(sides ?? 0, p.dieSides);
  return sides;
}

/** What a shop tile costs `player` after a `shopDiscount` passive. Loops mode: the printed cost. */
export function discountedCost(st: GameState, player: number, cost: number): number {
  if (!st.shared) return cost;
  return Math.max(0, cost - passiveSum(st, player, 'shopDiscount'));
}
