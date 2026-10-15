// The effect DSL interpreter: resolves who an effect hits, evaluates amounts
// and conditions, and runs effect lists against a mutable state. Used by the
// loops engine (engine.ts) and the shared-board rules (shared.ts). The two
// files import each other (movement triggers tiles, tiles run effects); only
// functions are shared, so the cycle is safe.
import type { Amount, Cond, Effect, Event, GameState, Resource, TileId, Who } from './types.ts';
import { rngInt } from './rng.ts';
import { countAdjacentWithTag, countOwnedWithTag, hasTag, isLocked, tileDef } from './board.ts';
import {
  adjacentOwnedWithClass, adjacentOwnedWithSharedTag, nextToCorner, ownedOnSide, ownedWithClass, ownedWithSharedTag,
} from './sharedBoard.ts';
import { sharedMoveToken, sharedTeleport } from './shared.ts';

export type Ctx = { st: GameState; events: Event[]; forcedDice: number[] | null; allowReroll: boolean };

export type EffectCtx = {
  /** The beneficiary: the owner for civic / private / toll / landmark, the visitor for public. */
  self: number;
  target: number | null;
  slot: number | null; // slot of the firing tile on self's board (shared mode: on the shared loop)
  source: TileId | string;
  coinLoss: Map<number, number>; // coins lost per player during this list (for reflect)
  /** Shared mode: owner of the firing tile (`who: 'owner'`). Loops mode: undefined, meaning self. */
  owner?: number;
  /** Shared mode: the player whose token triggered the tile. */
  mover?: number;
  /** Shared mode: totals moved from `target` to `self` by `pay` during this list. */
  paid?: { coins: number; vp: number };
};

export function newEc(self: number, target: number | null, slot: number | null, source: string): EffectCtx {
  return { self, target, slot, source, coinLoss: new Map() };
}

export function resolveWho(ctx: Ctx, who: Who, ec: EffectCtx): number[] {
  const n = ctx.st.players.length;
  switch (who) {
    case 'self': return [ec.self];
    case 'owner': return [ec.owner ?? ec.self];
    case 'target':
      if (ec.target == null) throw new Error('effect needs a target but none was chosen');
      return [ec.target];
    case 'others': return Array.from({ length: n }, (_, i) => i).filter((i) => i !== ec.self);
    case 'all': return Array.from({ length: n }, (_, i) => i);
  }
}

export type AmountCtx = Pick<EffectCtx, 'self' | 'slot' | 'target' | 'owner' | 'mover'>;

function loopsAmount(st: GameState, amount: Exclude<Amount, number>, ec: AmountCtx): number {
  if ('adjacentWithTag' in amount) {
    if (ec.slot == null) return 0;
    return Math.floor(countAdjacentWithTag(st, ec.self, ec.slot, amount.adjacentWithTag) * amount.per);
  }
  if ('ownedWithTag' in amount) return Math.floor(countOwnedWithTag(st, ec.self, amount.ownedWithTag) * amount.per);
  if ('laps' in amount) return Math.floor(st.players[ec.self]!.laps * amount.per);
  return 0; // shared-board kinds mean nothing on loops
}

/** Shared mode. Adjacency is the tile owner's; ownership counts are `self`'s; side counts are the mover's. */
function sharedAmount(st: GameState, amount: Exclude<Amount, number>, ec: AmountCtx): number {
  const owner = ec.owner ?? ec.self;
  let v = 0;
  if ('adjacentWithTag' in amount) v = ec.slot == null ? 0 : adjacentOwnedWithSharedTag(st, owner, ec.slot, amount.adjacentWithTag) * amount.per;
  else if ('adjacentWithClass' in amount) v = ec.slot == null ? 0 : adjacentOwnedWithClass(st, owner, ec.slot, amount.adjacentWithClass) * amount.per;
  else if ('ownedWithTag' in amount) v = ownedWithSharedTag(st, ec.self, amount.ownedWithTag) * amount.per;
  else if ('ownedWithClass' in amount) v = ownedWithClass(st, ec.self, amount.ownedWithClass) * amount.per;
  else if ('visitorOwnedOnSide' in amount) v = ec.slot == null ? 0 : ownedOnSide(st, ec.mover ?? ec.self, ec.slot) * amount.per;
  else if ('coinsHeldDiv' in amount) {
    const who = amount.of === 'target' ? ec.target : ec.self;
    v = who == null ? 0 : Math.floor(st.players[who]!.coins / amount.coinsHeldDiv) * amount.per;
  } else if ('cornersPassed' in amount) v = st.players[ec.self]!.cornersPassed * amount.per;
  else v = st.players[ec.self]!.laps * amount.per;
  return Math.floor(v);
}

export function evalAmount(st: GameState, amount: Amount, ec: AmountCtx): number {
  if (typeof amount === 'number') return amount;
  const v = st.shared ? sharedAmount(st, amount, ec) : loopsAmount(st, amount, ec);
  return amount.max != null ? Math.min(v, amount.max) : v;
}

function evalCond(st: GameState, cond: Cond, ec: EffectCtx): boolean {
  if ('flag' in cond) {
    const v = getFlag(st, ec.self, cond.flag);
    return cond.op === '>' ? v > cond.value : v === cond.value;
  }
  if ('adjacentWithTag' in cond) {
    if (ec.slot == null) return false;
    const n = st.shared
      ? adjacentOwnedWithSharedTag(st, ec.owner ?? ec.self, ec.slot, cond.adjacentWithTag)
      : countAdjacentWithTag(st, ec.self, ec.slot, cond.adjacentWithTag);
    return n >= cond.min;
  }
  if ('adjacentToCorner' in cond) return !!st.shared && ec.slot != null && nextToCorner(st.config, ec.slot);
  if ('visitor' in cond) return (ec.mover ?? ec.self) !== (ec.owner ?? ec.self);
  const total = st.pending?.lastTotal ?? 0;
  return cond.dieTotal === '>=' ? total >= cond.value : total <= cond.value;
}

export function getFlag(st: GameState, player: number, flag: string): number {
  const m = st.roundModifiers.find((x) => x.kind === 'flag' && x.player === player && x.flag === flag);
  if (m && m.kind === 'flag') return m.value;
  return st.players[player]!.flags[flag] ?? 0;
}

export function consumeFlag(st: GameState, player: number, flag: string): void {
  st.roundModifiers = st.roundModifiers.filter((x) => !(x.kind === 'flag' && x.player === player && x.flag === flag));
  if (st.players[player]!.flags[flag] != null) st.players[player]!.flags[flag] = 0;
}

export function changeResource(ctx: Ctx, player: number, res: Resource, delta: number, source: string): number {
  const p = ctx.st.players[player]!;
  const before = p[res];
  const after = Math.max(0, before + delta);
  const applied = after - before;
  if (applied === 0) return 0;
  p[res] = after;
  ctx.events.push({ t: 'resource', player, res, delta: applied, source });
  return applied;
}

function untilRef(st: GameState, rounds: number) {
  return { round: st.round + rounds, player: st.activePlayer };
}

export function runEffects(ctx: Ctx, effects: Effect[], ec: EffectCtx): void {
  const st = ctx.st;
  for (const e of effects) {
    switch (e.op) {
      case 'gain': {
        const amt = evalAmount(st, e.amount, ec);
        for (const q of e.who ? resolveWho(ctx, e.who, ec) : [ec.self]) changeResource(ctx, q, e.res, amt, ec.source);
        break;
      }
      case 'lose': {
        const amt = evalAmount(st, e.amount, ec);
        for (const q of resolveWho(ctx, e.who, ec)) {
          const applied = changeResource(ctx, q, e.res, -amt, ec.source);
          if (e.res === 'coins') ec.coinLoss.set(q, (ec.coinLoss.get(q) ?? 0) - applied);
        }
        break;
      }
      case 'steal': {
        const [t] = resolveWho(ctx, 'target', ec);
        const amt = Math.min(evalAmount(st, e.amount, ec), st.players[t!]![e.res]);
        if (amt > 0) {
          changeResource(ctx, t!, e.res, -amt, ec.source);
          changeResource(ctx, ec.self, e.res, amt, ec.source);
          if (e.res === 'coins') ec.coinLoss.set(t!, (ec.coinLoss.get(t!) ?? 0) + amt);
        }
        break;
      }
      case 'pay': {
        const res = e.res ?? 'coins';
        const [t] = resolveWho(ctx, 'target', ec);
        let full = evalAmount(st, e.amount, ec);
        if (e.cap != null) full = Math.min(full, e.cap);
        const has = st.players[t!]![res];
        if (has < full && e.orElse) {
          runEffects(ctx, e.orElse, ec);
          break;
        }
        const amt = Math.min(full, has);
        if (amt > 0) {
          changeResource(ctx, t!, res, -amt, ec.source);
          changeResource(ctx, ec.self, res, amt, ec.source);
          if (ec.paid) ec.paid[res] += amt;
          if (res === 'coins') ec.coinLoss.set(t!, (ec.coinLoss.get(t!) ?? 0) + amt);
        }
        break;
      }
      case 'move': {
        const by = evalAmount(st, e.by, ec);
        for (const q of resolveWho(ctx, e.who, ec)) moveToken(ctx, q, by);
        break;
      }
      case 'teleport': {
        for (const q of resolveWho(ctx, e.who, ec)) {
          if (st.shared) {
            sharedTeleport(ctx, q, e.to);
            continue;
          }
          const p = st.players[q]!;
          const from = p.position;
          let to = 0;
          if (e.to === 'random') [st.rngState, to] = rngInt(st.rngState, p.board.length);
          p.position = to;
          ctx.events.push({ t: 'moved', player: q, from, to, passedStart: false });
        }
        break;
      }
      case 'rollAgain': {
        if (st.pending) st.pending.rollAgain = true;
        break;
      }
      case 'setFlag': {
        for (const q of resolveWho(ctx, e.who, ec)) {
          if (e.rounds != null) {
            st.roundModifiers = st.roundModifiers.filter((m) => !(m.kind === 'flag' && m.player === q && m.flag === e.flag));
            st.roundModifiers.push({ kind: 'flag', player: q, flag: e.flag, value: e.value, until: untilRef(st, e.rounds) });
          } else {
            st.players[q]!.flags[e.flag] = e.value;
          }
        }
        break;
      }
      case 'lockTile': {
        for (const q of resolveWho(ctx, e.who, ec)) {
          const p = st.players[q]!;
          const slots: number[] = [];
          for (let s = 1; s < p.board.length; s++) if (p.board[s] != null && !isLocked(st, q, s)) slots.push(s);
          if (slots.length === 0) continue;
          let i: number;
          [st.rngState, i] = rngInt(st.rngState, slots.length);
          const slot = slots[i]!;
          st.roundModifiers.push({ kind: 'lock', player: q, slot, until: untilRef(st, e.rounds) });
          ctx.events.push({ t: 'locked', player: q, slot, tile: p.board[slot]!, by: ec.self });
        }
        break;
      }
      case 'reflect':
        break; // handled by runAttack
      case 'if': {
        if (evalCond(st, e.cond, ec)) runEffects(ctx, e.then, ec);
        else if (e.else) runEffects(ctx, e.else, ec);
        break;
      }
      case 'addDie': {
        st.players[ec.self]!.dice.push({ sides: e.sides });
        break;
      }
      case 'setDice': {
        for (const q of resolveWho(ctx, e.who, ec)) {
          st.roundModifiers = st.roundModifiers.filter((m) => !(m.kind === 'dice' && m.player === q));
          st.roundModifiers.push({ kind: 'dice', player: q, sides: e.sides, until: untilRef(st, e.rounds) });
        }
        break;
      }
      case 'replaceDie': {
        const dice = st.players[ec.self]!.dice;
        const i = dice.findIndex((d) => d.sides === e.from);
        if (i >= 0) dice[i] = { sides: e.to };
        break;
      }
    }
  }
}

/**
 * Move a token by `by` slots. The active player's own forward moves trigger
 * passes, laps and landings like a roll; every other move (backward, or of a
 * non-active player) just relocates the token.
 */
export function moveToken(ctx: Ctx, player: number, by: number): void {
  const st = ctx.st;
  if (by === 0) return;
  if (st.shared) return sharedMoveToken(ctx, player, by);
  const p = st.players[player]!;
  const size = p.board.length;
  if (player === st.activePlayer && by > 0 && st.pending) {
    st.pending.chain += 1;
    if (st.pending.chain > st.config.maxTriggerChain) {
      const from = p.position;
      p.position = (from + by) % size;
      ctx.events.push({ t: 'moved', player, from, to: p.position, passedStart: false });
      return;
    }
    enqueueForwardMove(ctx, player, by);
    return;
  }
  const from = p.position;
  p.position = (((from + by) % size) + size) % size;
  ctx.events.push({ t: 'moved', player, from, to: p.position, passedStart: false });
}

/** Loops mode: queue the passes, laps and landing of a forward move, then the caller drains the queue. */
export function enqueueForwardMove(ctx: Ctx, player: number, by: number): void {
  const st = ctx.st;
  const p = st.players[player]!;
  const size = p.board.length;
  const from = p.position;
  const q = st.pending!.queue;
  let passedStart = false;
  for (let i = 1; i <= by; i++) {
    const slot = (from + i) % size;
    if (slot === 0) {
      passedStart = true;
      q.push({ kind: 'lapIncome', player });
      for (let s = 1; s < size; s++) {
        const id = p.board[s];
        if (id != null && tileDef(st.config, id).onLap) q.push({ kind: 'tile', player, slot: s, tile: id, trigger: 'onLap' });
      }
    }
    if (i < by && slot !== 0) {
      const id = p.board[slot];
      if (id == null) continue;
      const def = tileDef(st.config, id);
      if (def.onPass) q.push({ kind: 'tile', player, slot, tile: id, trigger: 'onPass' });
      else if (st.config.fireOnPass && def.onLand && !hasTag(def, 'mover')) {
        q.push({ kind: 'tile', player, slot, tile: id, trigger: 'onPass', effectsOf: 'onLand' });
      }
    }
  }
  const to = (from + by) % size;
  p.position = to;
  ctx.events.push({ t: 'moved', player, from, to, passedStart });
  q.push({ kind: 'land', player, slot: to });
}
