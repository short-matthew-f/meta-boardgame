import { describe, expect, it } from 'vitest';
import { HumanPlayer } from '../web/human.ts';
import { createGame, legalActions } from '../engine/engine.ts';
import { defaultConfig } from '../tiles/index.ts';
import type { Action, GameState } from '../engine/types.ts';
import type { Affordances } from '../web/types.ts';

function shopState(): GameState {
  const s = createGame(defaultConfig({ players: 3 }), 4);
  s.phase = 'shop';
  s.shopActionsLeft = 1;
  s.shop = ['shrine', 'expansion', 'monument', 'market', 'bandit-camp', 'tailwind'];
  const p = s.players[0]!;
  p.coins = 5;
  p.board[3] = 'market';
  return s;
}

function start(state: GameState) {
  const h = new HumanPlayer();
  let aff!: Affordances;
  h.onChange = (a) => { aff = a; };
  const legal = legalActions(state);
  const done = h.act(state, legal);
  let result: Action | null | undefined;
  void done.then((r) => { result = r; });
  return { h, legal, get aff() { return aff; }, get result() { return result; }, done };
}

describe('HumanPlayer', () => {
  it('offers Roll in the roll phase and resolves with the legal roll action', async () => {
    const s = createGame(defaultConfig({ players: 2 }), 1);
    const t = start(s);
    expect(t.aff.prompt).toBe('Roll the dice');
    expect(t.aff.buttons.map((b) => b.label)).toEqual(['Roll']);
    t.h.clickButton(t.aff.buttons[0]!.action);
    await expect(t.done).resolves.toEqual({ type: 'roll' });
  });

  it('ignores actions that are not legal', async () => {
    const s = createGame(defaultConfig({ players: 2 }), 1);
    const t = start(s);
    t.h.clickButton({ type: 'pass' });
    t.h.clickSlot(2);
    t.h.clickShop(0);
    t.h.clickMod('fog');
    t.h.clickBoard(1);
    await Promise.resolve();
    expect(t.result).toBeUndefined();
    t.h.cancel();
    await expect(t.done).resolves.toBeNull();
  });

  it('shop: select a tile, slots light up (empty vs replace), click a slot buys', async () => {
    const t = start(shopState());
    expect(t.aff.prompt).toBe('Buy a tile, a mod, sell, or pass');
    expect(t.aff.shopClickable).toEqual([0, 1, 3, 4]); // 5 coins: shrine, expansion, market, bandit camp
    t.h.clickShop(2); // monument costs 6: not clickable
    expect(t.aff.shopSelected).toBeNull();
    t.h.clickShop(0);
    expect(t.aff.shopSelected).toBe(0);
    expect(t.aff.prompt).toBe('Pick a slot for Shrine');
    expect(t.aff.cancel).toBe(true);
    expect(t.aff.slotTargets.length).toBe(7);
    expect(t.aff.slotTargets.find((x) => x.slot === 3)).toEqual({ slot: 3, replaces: true });
    expect(t.aff.slotTargets.find((x) => x.slot === 4)).toEqual({ slot: 4, replaces: false });
    expect(t.aff.slotTargets.some((x) => x.slot === 0)).toBe(false);
    t.h.clickSlot(0); // Start is not a legal slot
    await Promise.resolve();
    expect(t.result).toBeUndefined();
    t.h.clickSlot(4);
    await expect(t.done).resolves.toEqual({ type: 'buyTile', shopIndex: 0, slot: 4 });
  });

  it('expansion tiles light up gaps, not slots', async () => {
    const t = start(shopState());
    t.h.clickShop(1);
    expect(t.aff.slotTargets).toEqual([]);
    expect(t.aff.gapTargets).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(t.aff.prompt).toContain('Click a +');
    t.h.clickGap(3);
    await expect(t.done).resolves.toEqual({ type: 'buyExpansion', shopIndex: 1, afterSlot: 3 });
  });

  it('cancel backs out of a half-chosen action; selecting again toggles off', () => {
    const t = start(shopState());
    t.h.clickShop(0);
    t.h.clickCancel();
    expect(t.aff.shopSelected).toBeNull();
    expect(t.aff.slotTargets).toEqual([]);
    t.h.clickShop(0);
    t.h.clickShop(0);
    expect(t.aff.shopSelected).toBeNull();
  });

  it('click an owned tile to sell it; Sell for Nc resolves', async () => {
    const t = start(shopState());
    expect(t.aff.sellable).toEqual([3]);
    t.h.clickSlot(3);
    expect(t.aff.sellSelected).toBe(3);
    expect(t.aff.prompt).toBe('Sell Market from slot 3?');
    expect(t.aff.buttons.map((b) => b.label)).toEqual(['Sell for 1c']);
    t.h.clickButton(t.aff.buttons[0]!.action);
    await expect(t.done).resolves.toEqual({ type: 'sellTile', slot: 3 });
  });

  it('buys a mod with one click and passes with the Pass button', async () => {
    const a = start(shopState());
    a.h.clickMod('reroll');
    await expect(a.done).resolves.toEqual({ type: 'buyMod', modId: 'reroll' });
    const b = start(shopState());
    b.h.clickButton({ type: 'pass' });
    await expect(b.done).resolves.toEqual({ type: 'pass' });
  });

  it('only legal targets are clickable when choosing a target', async () => {
    const s = createGame(defaultConfig({ players: 3 }), 2);
    s.pending!.choice = { kind: 'chooseTarget', player: 0, slot: 2, tile: 'bandit-camp', trigger: 'onLand' };
    const t = start(s);
    expect(t.aff.targets).toEqual([1, 2]);
    expect(t.aff.prompt).toBe('Choose a target for Bandit Camp');
    t.h.clickBoard(0); // yourself: not legal
    await Promise.resolve();
    expect(t.result).toBeUndefined();
    t.h.clickBoard(2);
    await expect(t.done).resolves.toEqual({ type: 'chooseTarget', player: 2 });
  });

  it('reroll prompt offers Reroll and Keep', async () => {
    const s = createGame(defaultConfig({ players: 2 }), 2);
    s.pending!.choice = { kind: 'reroll', player: 0, dice: [3, 2] };
    const t = start(s);
    expect(t.aff.buttons.map((b) => b.label)).toEqual(['Reroll', 'Keep 5']);
    t.h.clickButton(t.aff.buttons[0]!.action);
    await expect(t.done).resolves.toEqual({ type: 'reroll' });
  });

  it('affordances are cleared once an action is taken or cancelled', async () => {
    const t = start(shopState());
    t.h.clickButton({ type: 'pass' });
    await t.done;
    expect(t.aff.buttons).toEqual([]);
    expect(t.h.waiting).toBe(false);
  });
});
