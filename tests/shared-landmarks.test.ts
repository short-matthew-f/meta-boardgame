// Shared board mode: landmarks and their passives, buyouts, the shop, and the end modes.
import { describe, expect, it } from 'vitest';
import { LANDMARK_RACE_MODE, VP_POOL_MODE, legalActions, makeConfig, step } from '../engine/engine.ts';
import { effectiveDice } from '../engine/board.ts';
import type { Action, GameState } from '../engine/types.ts';
import { LANDMARKS, SHARED_TILES } from '../tiles/index.ts';
import { finish, fired, game, put, roll, type Opts } from './sharedHelpers.ts';

const coins = (s: GameState, i: number) => s.players[i]!.coins;
const pile = (s: GameState) => [...s.discard, ...s.bag, ...s.shop];
const has = (s: GameState, a: Action) => legalActions(s).some((x) => JSON.stringify(x) === JSON.stringify(a));

/** The active player rolls one slot and is in the shop with `shop` on offer. */
function inShop(o: Opts, shop: string[], coinsLeft: number, prep: (s: GameState) => void = () => {}): GameState {
  const s = game(o);
  prep(s);
  const r = roll(s, 1);
  r.state.shop = shop;
  r.state.players[r.state.activePlayer]!.coins = coinsLeft;
  return r.state;
}

describe('landmark effects and passives', () => {
  it('a landmark fires on its owner\'s own pass and landing, once, and never for others', () => {
    const s = game();
    put(s, 5, 'cathedral', 0, true);
    expect(roll(s, 5).state.players[0]!.vp).toBe(3); // landing once even with landBonus 2
    expect(roll(s, 6).state.players[0]!.vp).toBe(3); // pass
    const other = game();
    other.activePlayer = 1;
    other.players[1]!.position = 0;
    put(other, 5, 'cathedral', 0, true);
    expect(roll(other, 6).state.players[0]!.vp).toBe(0);
  });

  it('civicBonus (Mint): the owner gains 1 more on every civic fire, for anyone\'s token', () => {
    const s = game();
    put(s, 3, 'market', 1);
    put(s, 15, 'mint', 1, true);
    const r = roll(s, 4); // passes the market
    expect(coins(r.state, 1)).toBe(5 + 1 + 1);
    expect(r.events).toContainEqual({ t: 'resource', player: 1, res: 'coins', delta: 1, source: 'mint' });
    const land = roll(s, 3);
    expect(coins(land.state, 1)).toBe(7);
  });

  it('noReplace (City Walls): nobody else can build over any of the owner\'s tiles', () => {
    const o = { cfg: {} };
    const shop = ['market'];
    const s = inShop(o, shop, 10, (g) => { put(g, 13, 'mine', 1); put(g, 15, 'city-walls', 1, true); put(g, 16, 'mine', 1); });
    expect(has(s, { type: 'buyTile', shopIndex: 0, slot: 13 })).toBe(false);
    expect(has(s, { type: 'buyTile', shopIndex: 0, slot: 16 })).toBe(false);
    expect(has(s, { type: 'buyTile', shopIndex: 0, slot: 14 })).toBe(true);
    // without the walls the same slots are open
    const free = inShop(o, shop, 10, (g) => { put(g, 13, 'mine', 1); });
    expect(has(free, { type: 'buyTile', shopIndex: 0, slot: 13 })).toBe(true);
    // the owner can still rebuild their own tiles, but not the landmark itself
    const mine = inShop(o, shop, 10, (g) => { g.activePlayer = 1; g.players[1]!.position = 10; put(g, 13, 'mine', 1); put(g, 15, 'city-walls', 1, true); });
    expect(has(mine, { type: 'buyTile', shopIndex: 0, slot: 13 })).toBe(true);
    expect(has(mine, { type: 'buyTile', shopIndex: 0, slot: 15 })).toBe(false);
  });

  it('dieSides (Observatory): the owner rolls d8; a round dice modifier still wins', () => {
    const s = game();
    put(s, 5, 'observatory', 1, true);
    expect(effectiveDice(s, 1)).toEqual([{ sides: 8 }]);
    expect(effectiveDice(s, 0)).toEqual([{ sides: 1 }]);
    s.roundModifiers.push({ kind: 'dice', player: 1, sides: 4, until: { round: 3, player: 0 } });
    expect(effectiveDice(s, 1)).toEqual([{ sides: 4 }]);
    const two = game({ cfg: { startDice: [{ sides: 6 }, { sides: 6 }] } });
    two.players[0]!.dice = [{ sides: 6 }, { sides: 6 }];
    put(two, 5, 'observatory', 0, true);
    expect(effectiveDice(two, 0)).toEqual([{ sides: 8 }, { sides: 8 }]);
  });

  it('shopDiscount (Guildhall): shop tiles cost the owner 1 less, never below 0', () => {
    const prep = (g: GameState) => { put(g, 5, 'guildhall', 0, true); };
    const s = inShop({}, ['mine'], 3, prep); // Mine costs 4
    expect(has(s, { type: 'buyTile', shopIndex: 0, slot: 8 })).toBe(true);
    const r = step(s, { type: 'buyTile', shopIndex: 0, slot: 8 });
    expect(coins(r.state, 0)).toBe(0);
    expect(r.events.find((e) => e.t === 'bought')).toMatchObject({ item: 'mine', cost: 3 });
    const noHall = inShop({}, ['mine'], 3);
    expect(has(noHall, { type: 'buyTile', shopIndex: 0, slot: 8 })).toBe(false);
    const free = { id: 'free', name: 'Free', cost: 0, copies: 1, tags: ['income' as const], class: 'civic' as const, effects: [] };
    const f = inShop({ cfg: { tileSet: [...SHARED_TILES, free] } }, ['free'], 0, prep);
    expect(step(f, { type: 'buyTile', shopIndex: 0, slot: 8 }).events.find((e) => e.t === 'bought')).toMatchObject({ cost: 0 });
  });

  it('endGameVpPerTiles (Archive): floor(tiles owned / 2) VP at game end, before the last roundEnded', () => {
    const s = game({ cfg: { endMode: 'turnCap', endValue: 1 } });
    for (const slot of [12, 13, 14, 16, 17]) put(s, slot, 'shrine', 1); // 5 tiles
    put(s, 15, 'archive', 1, true); // + the landmark = 6 owned
    const { state, events } = finish(s);
    const end = events.filter((e) => e.t === 'resource' && e.source === 'endgame');
    expect(end).toEqual([{ t: 'resource', player: 1, res: 'vp', delta: 3, source: 'endgame' }]);
    expect(state.players[1]!.vp).toBeGreaterThanOrEqual(3);
    const last = [...events].reverse().find((e) => e.t === 'roundEnded');
    expect(last?.t === 'roundEnded' && last.standings[1]!.vp).toBe(state.players[1]!.vp);
    expect(events.findIndex((e) => e.t === 'resource' && e.source === 'endgame')).toBeLessThan(events.findIndex((e) => e.t === 'gameEnded'));
  });

  it('visitorLandVp (Colosseum): the owner gains 2 VP when a visitor lands, not on a pass or their own landing', () => {
    const s = game();
    put(s, 5, 'colosseum', 1, true);
    const land = roll(s, 5);
    expect([land.state.players[1]!.vp, land.state.players[0]!.vp]).toEqual([2, 0]);
    expect(roll(s, 6).state.players[1]!.vp).toBe(0);
    const own = game();
    own.activePlayer = 1;
    put(own, 15, 'colosseum', 1, true);
    expect(roll(own, 5).state.players[1]!.vp).toBe(2); // the landmark's own effect, once
  });

  it('tollFree (Harbour Master) is a permanent passive', () => {
    const s = game();
    put(s, 5, 'bridge', 1);
    put(s, 12, 'harbour-master', 0, true);
    expect(coins(roll(s, 5).state, 0)).toBe(5);
  });
});

describe('buyouts', () => {
  it('pay the shop tile\'s cost, refund the displaced owner half of the old cost, discard the old tile', () => {
    const s = inShop({}, ['bridge'], 10, (g) => put(g, 13, 'mine', 1));
    const r = step(s, { type: 'buyTile', shopIndex: 0, slot: 13 });
    expect(r.state.shared!.slots[13]).toMatchObject({ tile: 'bridge', owner: 0 });
    expect([coins(r.state, 0), coins(r.state, 1)]).toEqual([4, 5 + 2]);
    expect(r.events).toContainEqual({ t: 'resource', player: 1, res: 'coins', delta: 2, source: 'buyout' });
    expect(r.events.find((e) => e.t === 'bought')).toEqual({ t: 'bought', player: 0, item: 'bridge', cost: 6, slot: 13, displaced: 1 });
    expect(pile(r.state)).toContain('mine'); // discarded (the shop refill may already have reshuffled it)
  });

  it('replacing your own tile gives no refund and no displaced owner; empty slots neither', () => {
    const s = inShop({}, ['bridge'], 10, (g) => put(g, 13, 'mine', 0));
    const r = step(s, { type: 'buyTile', shopIndex: 0, slot: 13 });
    expect(r.events.find((e) => e.t === 'bought')).not.toHaveProperty('displaced');
    expect(r.events.some((e) => e.t === 'resource' && e.source === 'buyout')).toBe(false);
    expect(coins(r.state, 1)).toBe(5);
  });

  it('buyoutRefund is configurable', () => {
    const s = inShop({ cfg: { buyoutRefund: 1 } }, ['bridge'], 10, (g) => put(g, 13, 'mine', 1));
    expect(coins(step(s, { type: 'buyTile', shopIndex: 0, slot: 13 }).state, 1)).toBe(5 + 4);
  });

  it('protectOwnSide blocks buyouts on the owner\'s own side only', () => {
    const prep = (g: GameState) => { put(g, 13, 'mine', 1); put(g, 3, 'mine', 1); put(g, 14, 'mine', 0); };
    const on = inShop({ cfg: { protectOwnSide: true } }, ['bridge'], 10, prep);
    expect(has(on, { type: 'buyTile', shopIndex: 0, slot: 13 })).toBe(false); // P1's tile on P1's side
    expect(has(on, { type: 'buyTile', shopIndex: 0, slot: 3 })).toBe(true); // P1's tile on P0's side
    expect(has(on, { type: 'buyTile', shopIndex: 0, slot: 14 })).toBe(true); // my own, anywhere
    const off = inShop({}, ['bridge'], 10, prep);
    expect(has(off, { type: 'buyTile', shopIndex: 0, slot: 13 })).toBe(true);
  });

  it('corners and landmarks can never be built over', () => {
    const s = inShop({}, ['bridge'], 10, (g) => put(g, 13, 'cathedral', 0, true));
    expect(has(s, { type: 'buyTile', shopIndex: 0, slot: 13 })).toBe(false);
    expect(has(s, { type: 'buyTile', shopIndex: 0, slot: 10 })).toBe(false);
    expect(has(s, { type: 'buyTile', shopIndex: 0, slot: 0 })).toBe(false);
  });
});

describe('landmark purchase and sale', () => {
  it('each player may buy each landmark once, onto an empty slot or over their own tile', () => {
    const s = inShop({}, [], 20, (g) => { put(g, 4, 'mine', 0); put(g, 5, 'mine', 1); });
    expect(has(s, { type: 'buyLandmark', landmarkId: 'cathedral', slot: 8 })).toBe(true);
    expect(has(s, { type: 'buyLandmark', landmarkId: 'cathedral', slot: 4 })).toBe(true); // over my own tile
    expect(has(s, { type: 'buyLandmark', landmarkId: 'cathedral', slot: 5 })).toBe(false); // not over another's
    expect(has(s, { type: 'buyLandmark', landmarkId: 'cathedral', slot: 10 })).toBe(false); // not a corner
    const r = step(s, { type: 'buyLandmark', landmarkId: 'cathedral', slot: 4 });
    expect(r.state.players[0]).toMatchObject({ coins: 8, landmarks: ['cathedral'] });
    expect(r.state.shared!.slots[4]).toMatchObject({ tile: 'cathedral', owner: 0 });
    expect(pile(r.state)).toContain('mine'); // discarded (the shop refill may already have reshuffled it)
    expect(r.events.find((e) => e.t === 'bought')).toMatchObject({ item: 'cathedral', cost: 12, slot: 4 });
    // P1's turn: P0 is done; P1 may buy the same landmark, P0 may not buy it twice
    const later = { ...r.state };
    expect(later.activePlayer).toBe(1);
    later.players = later.players.map((p) => ({ ...p }));
    later.players[1]!.coins = 20;
    later.phase = 'shop';
    later.shopActionsLeft = 1;
    expect(has(later, { type: 'buyLandmark', landmarkId: 'cathedral', slot: 8 })).toBe(true);
    later.activePlayer = 0;
    later.players[0]!.coins = 20;
    expect(legalActions(later).some((a) => a.type === 'buyLandmark' && a.landmarkId === 'cathedral')).toBe(false);
    expect(legalActions(later).some((a) => a.type === 'buyLandmark' && a.landmarkId === 'mint')).toBe(true);
  });

  it('an unaffordable landmark is not offered', () => {
    const s = inShop({}, [], 9);
    expect(legalActions(s).some((a) => a.type === 'buyLandmark')).toBe(false);
  });

  it('tiles can be sold for half; landmarks cannot', () => {
    const s = inShop({}, [], 0, (g) => { put(g, 4, 'bridge', 0); put(g, 6, 'cathedral', 0, true); put(g, 7, 'mine', 1); });
    const sells = legalActions(s).filter((a) => a.type === 'sellTile');
    expect(sells).toEqual([{ type: 'sellTile', slot: 4 }]);
    const r = step(s, { type: 'sellTile', slot: 4 });
    expect(coins(r.state, 0)).toBe(3);
    expect(r.state.shared!.slots[4]).toMatchObject({ tile: null, owner: null });
  });
});

describe('end modes in shared mode', () => {
  it('landmarkRace ends at the end of the round in which a player owns that many', () => {
    const s = game({ cfg: { endMode: LANDMARK_RACE_MODE, endValue: 2 } });
    put(s, 4, 'mint', 0, true);
    s.players[0]!.coins = 30;
    let st = roll(s, 1).state;
    expect(st.endTrigger).toBeNull();
    st = step(st, { type: 'buyLandmark', landmarkId: 'cathedral', slot: 8 }).state;
    expect(st.endTrigger).toEqual({ reason: 'landmarkRace', endsAfterRound: 1 });
    expect(st.phase).toBe('roll');
    expect(st.activePlayer).toBe(1); // P1 still plays the round
    const { state, events } = finish(st);
    expect(events.find((e) => e.t === 'gameEnded')).toMatchObject({ reason: 'landmarkRace', rounds: 1 });
    expect(state.winner).not.toBeNull();
  });

  it('landmarkRace does not trigger below the target', () => {
    const s = game({ cfg: { endMode: LANDMARK_RACE_MODE, endValue: 3, maxRounds: 3 } });
    put(s, 4, 'mint', 0, true);
    s.players[0]!.coins = 30;
    const st = step(roll(s, 1).state, { type: 'buyLandmark', landmarkId: 'cathedral', slot: 8 }).state;
    expect(st.endTrigger).toBeNull();
  });

  it('lapRace counts own-corner passes; vpPool and vpRace work as before', () => {
    const lap = game({ cfg: { endMode: 'lapRace', endValue: 1 } });
    lap.players[0]!.position = 18;
    const st = roll(lap, 3).state;
    expect(st.players[0]!.laps).toBe(1);
    expect(step(st, { type: 'pass' }).state.endTrigger).toMatchObject({ reason: 'lapRace' });

    const pool = game({ cfg: { endMode: VP_POOL_MODE, endValue: 2 } });
    put(pool, 3, 'amphitheatre', 1);
    put(pool, 4, 'amphitheatre', 1);
    const pst = step(roll(pool, 4).state, { type: 'pass' }).state;
    expect(pst.endTrigger).toMatchObject({ reason: 'vpPool' });

    const race = game({ cfg: { endMode: 'vpRace', endValue: 2 } });
    put(race, 3, 'amphitheatre', 0);
    put(race, 4, 'monument', 0);
    expect(step(roll(race, 4).state, { type: 'pass' }).state.endTrigger).toMatchObject({ reason: 'vpRace' });
  });

  it('tileEndVp counts everything owned in shared mode, landmarks included', () => {
    const s = game({ cfg: { endMode: 'turnCap', endValue: 1, tileEndVp: 0.5 } });
    put(s, 12, 'shrine', 1); // 3
    put(s, 14, 'cathedral', 1, true); // 12
    const { events } = finish(s);
    expect(events.filter((e) => e.t === 'resource' && e.source === 'endgame')).toContainEqual({ t: 'resource', player: 1, res: 'vp', delta: 7, source: 'endgame' });
  });

  it('makeConfig defaults are loops-compatible', () => {
    const c = makeConfig();
    expect([c.boardMode, c.landmarkSet.length, c.startDice, c.protectOwnSide]).toEqual(['loops', 0, [{ sides: 6 }], false]);
    expect(LANDMARKS).toHaveLength(8);
    expect(fired([], 'x')).toBe(0);
  });
});
