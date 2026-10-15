// The display model. `toView` copies what the screen shows from a GameState;
// `applyEvent` advances it one engine event at a time while the presenter
// animates. It only mirrors what events say (counters, positions, tiles on the
// board, shop contents); every rule stays in engine/. After the last event the
// presenter replaces the whole view with `toView(after)`, so any drift is
// invisible by construction (tests/web-view.test.ts checks it stays at zero).
import type { Action, Event, GameState, TileId, Trigger } from '../engine/types.ts';
import { tileDef } from '../engine/board.ts';
import type { PlayerView, View } from './types.ts';

export function toView(state: GameState): View {
  return {
    round: state.round,
    activePlayer: state.activePlayer,
    phase: state.phase,
    players: state.players.map((p, i) => ({
      position: p.position,
      coins: p.coins,
      vp: p.vp,
      laps: p.laps,
      board: p.board.slice(),
      dice: p.dice.map((d) => ({ ...d })),
      mods: p.mods.slice(),
      locks: state.roundModifiers.filter((m) => m.kind === 'lock' && m.player === i).map((m) => (m as { slot: number }).slot),
    })),
    shop: state.shop.slice(),
  };
}

export function cloneView(v: View): View {
  return { ...v, players: v.players.map((p) => ({ ...p, board: p.board.slice(), dice: p.dice.map((d) => ({ ...d })), mods: p.mods.slice(), locks: p.locks.slice() })), shop: v.shop.slice() };
}

/** What the presenter knows about the step being played. */
export type StepCtx = { before: GameState; after: GameState; action: Action };

/** Number of slots a forward move of `player` travels, given the move event and the last roll. */
export function hopCount(from: number, to: number, size: number, passedStart: boolean, rollTotal: number | null): number {
  if (rollTotal != null && rollTotal > 0 && (from + rollTotal) % size === to) return rollTotal;
  const d = (to - from + size) % size;
  return d === 0 && passedStart ? size : d;
}

/** True when a `moved` event is a teleport (the previous event was a tile that teleports). */
export function isTeleport(prev: Event | undefined, state: GameState): boolean {
  if (!prev || prev.t !== 'tileFired') return false;
  const def = tileDef(state.config, prev.tile);
  const effects = def[prev.trigger as Trigger] ?? [];
  return effects.some((e) => e.op === 'teleport');
}

/**
 * Advance `view` by one event. Returns nothing; the caller animates around it.
 * Events that need no view change (attacked, tileFired, roundEnded, ...) are no-ops here.
 */
export function applyEvent(view: View, e: Event, ctx: StepCtx): void {
  switch (e.t) {
    case 'rolled':
      // Spending a Reroll token emits no event of its own; the new roll is where it shows.
      if (ctx.action.type === 'reroll') view.players[e.player]!.mods = ctx.after.players[e.player]!.mods.slice();
      return;
    case 'moved':
      view.players[e.player]!.position = e.to;
      return;
    case 'lap':
      view.players[e.player]!.laps = e.laps;
      return;
    case 'resource': {
      const p = view.players[e.player]!;
      p[e.res] = Math.max(0, p[e.res] + e.delta);
      return;
    }
    case 'bought': {
      const p = view.players[e.player]!;
      const a = ctx.action;
      if (a.type === 'buyTile' || a.type === 'buyExpansion') {
        view.shop.splice(a.shopIndex, 1);
        if (a.type === 'buyTile' && e.slot != null) p.board[e.slot] = e.item;
      } else if (a.type === 'buyMod') {
        // Mods change dice and the owned list through effect primitives; read the result.
        const q = ctx.after.players[e.player]!;
        p.mods = q.mods.slice();
        p.dice = q.dice.map((d) => ({ ...d }));
      }
      return;
    }
    case 'expanded': {
      const p = view.players[e.player]!;
      const q = ctx.after.players[e.player]!;
      p.board.splice(e.afterSlot + 1, 0, q.board[e.afterSlot + 1] ?? null);
      if (p.position > e.afterSlot) p.position += 1;
      p.locks = ctx.after.roundModifiers.filter((m) => m.kind === 'lock' && m.player === e.player).map((m) => (m as { slot: number }).slot);
      return;
    }
    case 'sold': {
      const p = view.players[e.player]!;
      const slot = soldSlot(ctx, e.player, e.tile);
      if (slot >= 0) p.board[slot] = null;
      p.locks = p.locks.filter((s) => s !== slot);
      return;
    }
    case 'locked': {
      const p = view.players[e.player]!;
      if (!p.locks.includes(e.slot)) p.locks.push(e.slot);
      return;
    }
    case 'shopRefilled':
      view.shop = e.shop.slice();
      return;
    default:
      return;
  }
}

function soldSlot(ctx: StepCtx, player: number, tile: TileId): number {
  const a = ctx.action;
  if (a.type === 'sellTile') return a.slot;
  const b = ctx.before.players[player]!.board;
  const f = ctx.after.players[player]!.board;
  return b.findIndex((t, i) => t === tile && f[i] == null);
}

/**
 * Which slot of `player`'s board a `tileFired` event refers to (events carry the
 * tile, not the slot). `used` counts earlier matches in this step so two copies
 * of one tile light up one after the other.
 */
export function firedSlot(view: View, player: number, tile: TileId, trigger: Trigger, passed: number[], used: Map<string, number>): number | null {
  const p = view.players[player]!;
  const slots: number[] = [];
  for (let s = 1; s < p.board.length; s++) if (p.board[s] === tile) slots.push(s);
  if (slots.length === 0) return null;
  if (trigger === 'onLand' && slots.includes(p.position)) return p.position;
  let pool = slots;
  if (trigger === 'onPass') {
    const inPassed = slots.filter((s) => passed.includes(s));
    if (inPassed.length > 0) pool = inPassed;
  }
  const key = `${player}:${tile}:${trigger}`;
  const n = used.get(key) ?? 0;
  used.set(key, n + 1);
  return pool[n % pool.length]!;
}
