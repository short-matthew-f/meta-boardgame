import { describe, expect, it } from 'vitest';
import { applyEvent, cloneView, firedSlot, hopCount, isTeleport, toView } from '../web/viewmodel.ts';
import { createGame, legalActions, step } from '../engine/engine.ts';
import { Rng } from '../engine/rng.ts';
import { botByName } from '../bots/index.ts';
import { defaultConfig } from '../tiles/index.ts';
import type { Event, GameState, Trigger } from '../engine/types.ts';
import type { View } from '../web/types.ts';

const LINEUPS = [
  ['scorer', 'aggressor', 'turtle', 'expander'],
  ['random', 'random', 'random', 'random'],
  ['lookahead', 'greedy', 'aggressor', 'random'],
];

// Fields the display advances event by event. The rest is reset from the truth.
function core(v: View, locks = true) {
  return {
    shop: v.shop,
    players: v.players.map((p) => ({ position: p.position, coins: p.coins, vp: p.vp, laps: p.laps, board: p.board, mods: p.mods, dice: p.dice, ...(locks ? { locks: [...p.locks].sort() } : {}) })),
  };
}

describe('view model', () => {
  it('advancing event by event lands exactly on the post-step state', () => {
    let steps = 0;
    const seen = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      const names = LINEUPS[seed % LINEUPS.length]!;
      let state = createGame(defaultConfig({ players: 4, endMode: seed % 3 === 0 ? 'vpRace' : 'turnCap', endValue: seed % 3 === 0 ? 20 : 12 }), seed);
      const rng = new Rng(seed);
      while (state.phase !== 'ended') {
        const legal = legalActions(state);
        const action = botByName(names[state.activePlayer]!).choose(state, legal, rng);
        const r = step(state, action);
        const view = toView(state);
        for (const e of r.events) { applyEvent(view, e, { before: state, after: r.state, action }); seen.add(e.t); }
        const truth = toView(r.state);
        // Lock expiry at the end of a turn has no event, so it only shows in the final re-render.
        const locks = r.state.activePlayer === state.activePlayer && r.state.round === state.round;
        expect(core(view, locks), `seed ${seed} step ${steps} ${JSON.stringify(action)}`).toEqual(core(truth, locks));
        state = r.state;
        steps++;
      }
    }
    expect(steps).toBeGreaterThan(1000);
    for (const t of ['rolled', 'moved', 'lap', 'tileFired', 'resource', 'attacked', 'bought', 'expanded', 'shopRefilled', 'roundEnded', 'gameEnded'])
      expect(seen.has(t), `no ${t} event exercised`).toBe(true);
  });

  it('cloneView is deep', () => {
    const s = createGame(defaultConfig({ players: 2 }), 1);
    const a = toView(s);
    const b = cloneView(a);
    b.players[0]!.board[1] = 'shrine';
    b.shop.pop();
    expect(a.players[0]!.board[1]).toBeNull();
    expect(a.shop.length).toBe(6);
  });

  it('hopCount uses the roll total for full laps and falls back to the distance', () => {
    expect(hopCount(2, 5, 8, false, 3)).toBe(3);
    expect(hopCount(2, 2, 8, true, 8)).toBe(8);
    expect(hopCount(6, 1, 8, true, null)).toBe(3);
    expect(hopCount(3, 3, 8, true, null)).toBe(8);
    expect(hopCount(5, 7, 8, false, 2)).toBe(2); // springboard after a roll of 3 does not reuse the total
    expect(hopCount(5, 7, 8, false, 3)).toBe(2);
  });

  it('detects a teleport from the tile that just fired', () => {
    const s = createGame(defaultConfig({ players: 2 }), 1);
    const portal: Event = { t: 'tileFired', player: 0, tile: 'portal', trigger: 'onLand' };
    const spring: Event = { t: 'tileFired', player: 0, tile: 'springboard', trigger: 'onLand' };
    expect(isTeleport(portal, s)).toBe(true);
    expect(isTeleport(spring, s)).toBe(false);
    expect(isTeleport(undefined, s)).toBe(false);
  });

  it('firedSlot picks the landed slot, then walks through duplicates', () => {
    const s: GameState = createGame(defaultConfig({ players: 2 }), 1);
    const v = toView(s);
    v.players[0]!.board[2] = 'market';
    v.players[0]!.board[5] = 'market';
    v.players[0]!.position = 5;
    const used = new Map<string, number>();
    expect(firedSlot(v, 0, 'market', 'onLand', [], used)).toBe(5);
    const trig: Trigger = 'onLap';
    expect(firedSlot(v, 0, 'market', trig, [], used)).toBe(2);
    expect(firedSlot(v, 0, 'market', trig, [], used)).toBe(5);
    expect(firedSlot(v, 0, 'shrine', trig, [], used)).toBeNull();
    expect(firedSlot(v, 0, 'market', 'onPass', [5], new Map())).toBe(5);
  });
});
