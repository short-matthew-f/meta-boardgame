// Shared-board variant options: perimeter, catchUpCoins, tollOnPass, buyoutPremium, and the landmarkRace ranking rule.
import { describe, expect, it } from 'vitest';
import { LANDMARK_RACE_MODE, createGame, legalActions, rankPlayers, step } from '../engine/engine.ts';
import type { Action, GameState } from '../engine/types.ts';
import { defaultConfig, defaultSharedConfig } from '../tiles/index.ts';
import { finish, game, put, roll, tolls } from './sharedHelpers.ts';

const coins = (s: GameState, i: number) => s.players[i]!.coins;
const has = (s: GameState, a: Action) => legalActions(s).some((x) => JSON.stringify(x) === JSON.stringify(a));

describe('perimeter', () => {
  it('splits 24 slots into 12, 8 and 6 per side for 2, 3 and 4 players', () => {
    for (const [players, side] of [[2, 12], [3, 8], [4, 6]] as const) {
      const s = createGame(defaultSharedConfig({ players, perimeter: 24 }), 1);
      expect(s.config.sideLength).toBe(side);
      expect(s.shared!.slots).toHaveLength(24);
      expect(s.players.map((p) => p.position)).toEqual(Array.from({ length: players }, (_, i) => i * side));
      expect(s.shared!.slots.filter((x) => x.corner != null)).toHaveLength(players);
    }
  });

  it('throws when the perimeter does not divide by the players', () => {
    expect(() => createGame(defaultSharedConfig({ players: 5, perimeter: 24 }), 1)).toThrow(/perimeter/);
    expect(() => createGame(defaultSharedConfig({ players: 4, perimeter: 30 }), 1)).toThrow(/perimeter/);
  });

  it('wins over sideLength, resolves again if players change, and is ignored in loops mode', () => {
    const base = defaultSharedConfig({ players: 4, perimeter: 32, sideLength: 10 });
    expect(base.sideLength).toBe(8);
    expect(createGame({ ...base, players: 2 }, 1).config.sideLength).toBe(16);
    const loops = createGame(defaultConfig({ players: 4, perimeter: 24 }), 1);
    expect(loops.config.boardSize).toBe(8);
    expect(loops.shared).toBeUndefined();
  });

  it('rejects a perimeter that leaves fewer than 2 slots per side', () => {
    expect(() => createGame(defaultSharedConfig({ players: 4, perimeter: 4 }), 1)).toThrow(/sideLength/);
  });

  it('the default (unset) board is unchanged', () => {
    expect(createGame(defaultSharedConfig({ players: 3 }), 1).shared!.slots).toHaveLength(30);
  });
});

describe('catchUpCoins', () => {
  it('seat i starts with startCoins + i × catchUpCoins in both board modes', () => {
    for (const cfg of [defaultSharedConfig({ players: 4, catchUpCoins: 2 }), defaultConfig({ players: 4, catchUpCoins: 2 })]) {
      expect(createGame(cfg, 1).players.map((p) => p.coins)).toEqual([5, 7, 9, 11]);
    }
    expect(createGame(defaultSharedConfig({ players: 3, catchUpCoins: 1, startCoins: 4 }), 1).players.map((p) => p.coins)).toEqual([4, 5, 6]);
  });

  it('defaults to 0 and rejects negative values', () => {
    expect(createGame(defaultSharedConfig({ players: 4 }), 1).players.map((p) => p.coins)).toEqual([5, 5, 5, 5]);
    expect(() => createGame(defaultSharedConfig({ catchUpCoins: -1 }), 1)).toThrow(/catchUpCoins/);
  });
});

describe('tollOnPass', () => {
  const g = (tollOnPass: number) => game({ cfg: { tollOnPass } });

  it('charges floor(fraction × pay), at least 1, on a pass and the full amount on a landing', () => {
    // Bridge pays 2: passing at 0.5 charges 1, landing charges 2.
    const pass = g(0.5);
    put(pass, 5, 'bridge', 1);
    const rp = roll(pass, 6); // passes slot 5, lands on 6
    expect(coins(rp.state, 0)).toBe(4);
    expect(coins(rp.state, 1)).toBe(6);
    expect(tolls(rp.events)).toEqual([{ t: 'toll', payer: 0, owner: 1, tile: 'bridge', amount: 1, onPass: true }]);
    expect(rp.events.find((e) => e.t === 'tileFired')).toMatchObject({ tile: 'bridge', trigger: 'onPass', owner: 1, slot: 5 });

    const land = g(0.5);
    put(land, 5, 'bridge', 1);
    const rl = roll(land, 5);
    expect(coins(rl.state, 0)).toBe(3);
    expect(tolls(rl.events)).toEqual([{ t: 'toll', payer: 0, owner: 1, tile: 'bridge', amount: 2 }]);

    // a 1-coin Tollbooth rounds up to 1; Guard Post (3 tolls, pays 3) at 0.9 floors 2.7 to 2
    const small = g(0.1);
    put(small, 5, 'tollbooth', 1);
    expect(coins(roll(small, 6).state, 0)).toBe(4);
    const gp = g(0.9);
    put(gp, 5, 'guard-post', 1);
    put(gp, 3, 'tollbooth', 1);
    put(gp, 4, 'tollbooth', 1);
    const rg = roll(gp, 6);
    expect(tolls(rg.events).map((t) => [t.tile, t.amount])).toEqual([['tollbooth', 1], ['tollbooth', 1], ['guard-post', 2]]);
  });

  it('charges the pay after its cap, never more than the visitor has, and nothing at 0', () => {
    const s = g(1);
    put(s, 5, 'guard-post', 1);
    for (const slot of [1, 2, 3, 4]) put(s, slot, 'tollbooth', 1);
    s.players[0]!.coins = 2;
    const r = roll(s, 6);
    // four tollbooths at 1 each took 2 coins; the Guard Post (pay 3 after the cap) finds nothing left
    expect(coins(r.state, 0)).toBe(0);
    expect(tolls(r.events).map((t) => t.amount)).toEqual([1, 1, 0, 0, 0]);

    const off = g(0);
    put(off, 5, 'bridge', 1);
    const ro = roll(off, 6);
    expect(coins(ro.state, 0)).toBe(5);
    expect(tolls(ro.events)).toEqual([]);
  });

  it('does not fire Ferry, Tithe, Bandit Camp or Inn on a pass', () => {
    for (const id of ['ferry', 'tithe', 'bandit-camp', 'inn']) {
      const s = g(1);
      s.players[0]!.vp = 3;
      put(s, 5, id, 1);
      const r = roll(s, 6);
      expect(tolls(r.events), id).toEqual([]);
      expect(r.state.players[0]!.position, id).toBe(6);
      expect([coins(r.state, 0), r.state.players[0]!.vp], id).toEqual([5, 3]);
    }
  });

  it('does not charge the owner passing their own toll', () => {
    const s = g(1);
    put(s, 5, 'bridge', 0);
    expect(tolls(roll(s, 6).events)).toEqual([]);
  });

  it('respects tollFree: the flag is consumed by a pass toll, Harbour Master keeps it', () => {
    const f = g(1);
    put(f, 5, 'bridge', 1);
    f.players[0]!.flags.tollFree = 1;
    const r = roll(f, 6);
    expect(coins(r.state, 0)).toBe(5);
    expect(tolls(r.events)).toEqual([{ t: 'toll', payer: 0, owner: 1, tile: 'bridge', amount: 0, onPass: true }]);
    expect(r.state.players[0]!.flags.tollFree).toBe(0);

    const hm = g(1);
    put(hm, 5, 'bridge', 1);
    put(hm, 12, 'harbour-master', 0, true);
    hm.players[0]!.flags.tollFree = 1;
    const rh = roll(hm, 6);
    expect(coins(rh.state, 0)).toBe(5);
    expect(rh.state.players[0]!.flags.tollFree).toBe(1);
    expect(tolls(rh.events)[0]).toMatchObject({ amount: 0, onPass: true });
  });

  it('rejects a fraction above 1', () => {
    expect(() => createGame(defaultSharedConfig({ tollOnPass: 1.5 }), 1)).toThrow(/tollOnPass/);
  });
});

describe('buyoutPremium', () => {
  /** Player 0 is in the shop with a Market on offer and 10 coins; player 1 owns a Market at slot 4 (cost 3). */
  function shop(premium: number, coinsLeft = 10): GameState {
    const s = game({ cfg: { buyoutPremium: premium } });
    put(s, 4, 'market', 1);
    const r = roll(s, 1);
    r.state.shop = ['market'];
    r.state.players[0]!.coins = coinsLeft;
    return r.state;
  }

  it('is charged on a buyout on top of the price and the displaced owner refund is unchanged', () => {
    const s = shop(2);
    const r = step(s, { type: 'buyTile', shopIndex: 0, slot: 4 });
    expect(coins(r.state, 0)).toBe(5); // 10 - (3 + 2)
    expect(coins(r.state, 1)).toBe(6); // refund floor(3 × 0.5) = 1, not raised by the premium
    expect(r.events.find((e) => e.t === 'bought')).toMatchObject({ cost: 5, displaced: 1 });
  });

  it('is not charged on an empty slot or on replacing your own tile', () => {
    const s = shop(2);
    expect(coins(step(s, { type: 'buyTile', shopIndex: 0, slot: 6 }).state, 0)).toBe(7);
    put(s, 6, 'market', 0);
    expect(coins(step(s, { type: 'buyTile', shopIndex: 0, slot: 6 }).state, 0)).toBe(7);
  });

  it('makes a buyout illegal when the visitor cannot afford price plus premium', () => {
    const s = shop(2, 4);
    expect(has(s, { type: 'buyTile', shopIndex: 0, slot: 4 })).toBe(false);
    expect(has(s, { type: 'buyTile', shopIndex: 0, slot: 6 })).toBe(true);
    expect(has(shop(2, 5), { type: 'buyTile', shopIndex: 0, slot: 4 })).toBe(true);
  });

  it('is zero by default', () => {
    const r = step(shop(0), { type: 'buyTile', shopIndex: 0, slot: 4 });
    expect(coins(r.state, 0)).toBe(7);
  });

  it('is added after a Guildhall discount', () => {
    const s = shop(2);
    put(s, 12, 'guildhall', 0, true);
    const r = step(s, { type: 'buyTile', shopIndex: 0, slot: 4 });
    expect(coins(r.state, 0)).toBe(10 - (2 + 2));
  });
});

describe('landmarkRace ranking', () => {
  it('ranks by landmarks owned first, then VP, then coins', () => {
    const s = game({ cfg: { endMode: LANDMARK_RACE_MODE, endValue: 1 }, players: 3 });
    s.players[0]!.landmarks = ['cathedral'];
    s.players[0]!.vp = 0;
    s.players[1]!.landmarks = [];
    s.players[1]!.vp = 9;
    s.players[2]!.landmarks = ['mint'];
    s.players[2]!.vp = 2;
    expect(rankPlayers(s)).toEqual([2, 0, 1]);
    s.players[0]!.landmarks = ['cathedral', 'mint'];
    expect(rankPlayers(s)).toEqual([0, 2, 1]);
    s.players[2]!.landmarks = ['cathedral', 'mint'];
    s.players[2]!.vp = 0;
    s.players[0]!.coins = 1;
    s.players[2]!.coins = 3;
    expect(rankPlayers(s)).toEqual([2, 0, 1]); // equal landmarks and VP, coins decide
  });

  it('other end modes still rank by VP', () => {
    const s = game({ cfg: { endMode: 'turnCap' } });
    s.players[0]!.landmarks = ['cathedral'];
    s.players[1]!.vp = 1;
    expect(rankPlayers(s)).toEqual([1, 0]);
  });

  it('the Builder-style player with the landmark wins a landmarkRace over a VP leader', () => {
    const s = game({ cfg: { endMode: LANDMARK_RACE_MODE, endValue: 1 } });
    s.players[0]!.coins = 30;
    s.players[1]!.vp = 5;
    const st = step(roll(s, 1).state, { type: 'buyLandmark', landmarkId: 'cathedral', slot: 8 }).state;
    const { state } = finish(st);
    expect(state.players[1]!.vp).toBeGreaterThan(state.players[0]!.vp);
    expect(state.winner).toBe(0);
  });
});

describe('replacementTax', () => {
  /** Player 0 is in the shop with Markets on offer; player 1 owns a Market at slot 4, player 0 one at slot 6. */
  function shop(cfg: object, coinsLeft = 20): GameState {
    const s = game({ cfg });
    put(s, 4, 'market', 1);
    put(s, 6, 'market', 0);
    const r = roll(s, 1);
    r.state.shop = ['market', 'market', 'market'];
    r.state.players[0]!.coins = coinsLeft;
    return r.state;
  }
  const buy = (s: GameState, slot: number) => step(s, { type: 'buyTile', shopIndex: 0, slot });

  it('is charged to the bank on replacing an own tile and on a buyout, not on an empty slot', () => {
    const s = shop({ replacementTax: 2 });
    const empty = buy(s, 8);
    expect(coins(empty.state, 0)).toBe(17);
    expect(empty.events.find((e) => e.t === 'bought')).not.toHaveProperty('tax');
    const own = buy(s, 6);
    expect(coins(own.state, 0)).toBe(15); // 3 + 2
    expect(own.events.find((e) => e.t === 'bought')).toMatchObject({ cost: 5, tax: 2 });
    expect(own.state.players[0]!.replacements).toBe(1);
    const out = buy(s, 4);
    expect(coins(out.state, 0)).toBe(15);
    expect(coins(out.state, 1)).toBe(6); // refund only floor(3 × 0.5); the tax goes to nobody
    expect(out.events.find((e) => e.t === 'bought')).toMatchObject({ cost: 5, tax: 2, displaced: 1 });
  });

  it('stacks with the buyout premium', () => {
    const out = buy(shop({ replacementTax: 2, buyoutPremium: 1 }), 4);
    expect(coins(out.state, 0)).toBe(14);
    expect(out.events.find((e) => e.t === 'bought')).toMatchObject({ cost: 6, tax: 2 });
  });

  it('a landmark over an own tile pays it, on an empty slot does not', () => {
    const s = shop({ replacementTax: 2 }, 30);
    const own = step(s, { type: 'buyLandmark', landmarkId: 'cathedral', slot: 6 });
    expect(coins(own.state, 0)).toBe(30 - 12 - 2);
    expect(own.events.find((e) => e.t === 'bought')).toMatchObject({ cost: 14, tax: 2 });
    expect(coins(step(s, { type: 'buyLandmark', landmarkId: 'cathedral', slot: 8 }).state, 0)).toBe(18);
  });

  it('escalates as tax × k for the k-th replacement (2, 4, 6)', () => {
    let s = shop({ replacementTax: 2, replacementTaxEscalates: true, shopActions: 3 }, 40);
    const paid: number[] = [];
    for (const slot of [6, 4, 6]) {
      const before = coins(s, 0);
      const r = buy(s, slot);
      paid.push(before - coins(r.state, 0) - 3);
      s = r.state;
    }
    expect(paid).toEqual([2, 4, 6]);
    expect(s.players[0]!.replacements).toBe(3);
    // an empty-slot build in between neither pays nor counts
    const e = shop({ replacementTax: 2, replacementTaxEscalates: true }, 40);
    expect(e.players[0]!.replacements).toBe(0);
    expect(buy(e, 8).state.players[0]!.replacements).toBe(0);
  });

  it('legal actions exclude replacements the player cannot afford with the tax', () => {
    const s = shop({ replacementTax: 2 }, 4);
    expect(has(s, { type: 'buyTile', shopIndex: 0, slot: 8 })).toBe(true);
    expect(has(s, { type: 'buyTile', shopIndex: 0, slot: 6 })).toBe(false);
    expect(has(s, { type: 'buyTile', shopIndex: 0, slot: 4 })).toBe(false);
    const t = shop({ replacementTax: 2 }, 5);
    expect(has(t, { type: 'buyTile', shopIndex: 0, slot: 6 })).toBe(true);
    // a landmark over an own tile needs cost + tax
    const l = shop({ replacementTax: 2 }, 13);
    expect(has(l, { type: 'buyLandmark', landmarkId: 'cathedral', slot: 6 })).toBe(false);
    expect(has(l, { type: 'buyLandmark', landmarkId: 'cathedral', slot: 8 })).toBe(true);
  });

  it('is zero by default and rejects negative values', () => {
    expect(coins(buy(shop({}), 6).state, 0)).toBe(17);
    expect(() => createGame(defaultSharedConfig({ replacementTax: -1 }), 1)).toThrow(/replacementTax/);
  });
});
