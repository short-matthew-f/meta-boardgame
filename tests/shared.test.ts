// Shared board mode: geometry, corners, and the trigger rule of each tile class.
import { describe, expect, it } from 'vitest';
import { createGame, legalActions, step } from '../engine/engine.ts';
import { nextCorner, sharedSize, sideOf } from '../engine/sharedBoard.ts';
import { defaultConfig, defaultSharedConfig } from '../tiles/index.ts';
import { fired, game, put, roll, tolls } from './sharedHelpers.ts';

const coins = (s: ReturnType<typeof game>, i: number) => s.players[i]!.coins;

describe('board geometry', () => {
  for (const n of [2, 3, 4]) {
    it(`${n} players: ${n * 10} slots, a corner every 10`, () => {
      const s = createGame(defaultSharedConfig({ players: n }), 1);
      expect(s.shared!.slots).toHaveLength(n * 10);
      expect(sharedSize(s.config)).toBe(n * 10);
      const corners = s.shared!.slots.flatMap((c, i) => (c.corner != null ? [[i, c.corner]] : []));
      expect(corners).toEqual(Array.from({ length: n }, (_, p) => [p * 10, p]));
      expect(s.shared!.slots.every((c) => c.tile == null && c.owner == null)).toBe(true);
      expect(s.players.every((p) => p.board.length === 0 && p.position === 0)).toBe(true);
      expect(s.players.every((p) => p.cornersPassed === 0 && p.landmarks.length === 0)).toBe(true);
    });
  }

  it('nextCorner is the next corner clockwise, strictly after the position', () => {
    const c = defaultSharedConfig({ players: 4 });
    expect([0, 1, 5, 9, 10, 19, 20, 35, 39].map((p) => nextCorner(c, p))).toEqual([10, 10, 10, 10, 20, 20, 30, 0, 0]);
    expect(nextCorner(defaultSharedConfig({ players: 2, sideLength: 6 }), 7)).toBe(0);
    expect([0, 9, 10, 19].map((p) => sideOf(c, p))).toEqual([0, 0, 1, 1]);
  });

  it('sideLength changes the board', () => {
    const s = createGame(defaultSharedConfig({ players: 3, sideLength: 5 }), 1);
    expect(s.shared!.slots).toHaveLength(15);
    expect(s.shared!.slots.filter((c) => c.corner != null)).toHaveLength(3);
  });

  it('loops mode is untouched: no shared state, no landmarks', () => {
    const s = createGame(defaultConfig({ players: 2 }), 1);
    expect(s.shared).toBeUndefined();
    expect(s.players[0]!.board).toHaveLength(8);
    expect(s.players[0]).toMatchObject({ cornersPassed: 0, landmarks: [] });
  });

  it('startDice sets the dice in both modes', () => {
    const two = [{ sides: 6 }, { sides: 6 }];
    expect(createGame(defaultConfig({ startDice: two }), 1).players[0]!.dice).toEqual(two);
    expect(createGame(defaultSharedConfig({ startDice: two }), 1).players[3]!.dice).toEqual(two);
    expect(createGame(defaultConfig(), 1).players[0]!.dice).toEqual([{ sides: 6 }]);
  });
});

describe('corners', () => {
  it('passing another player\'s corner pays cornerIncome, own corner pays double and is a lap', () => {
    const s = game();
    s.players[0]!.position = 5;
    const r1 = roll(s, 6); // passes 10 (P1's), lands 11
    expect(coins(r1.state, 0)).toBe(5 + 2);
    expect(r1.events.filter((e) => e.t === 'corner')).toEqual([{ t: 'corner', player: 0, own: false, income: 2 }]);
    expect(r1.state.players[0]).toMatchObject({ cornersPassed: 1, laps: 0 });
    expect(r1.events.some((e) => e.t === 'lap')).toBe(false);

    s.players[0]!.position = 15;
    const r2 = roll(s, 6); // passes 20 = slot 0, P0's own corner
    expect(coins(r2.state, 0)).toBe(5 + 4);
    expect(r2.events.filter((e) => e.t === 'corner')).toEqual([{ t: 'corner', player: 0, own: true, income: 4 }]);
    expect(r2.state.players[0]).toMatchObject({ cornersPassed: 1, laps: 1, position: 1 });
    expect(r2.events.find((e) => e.t === 'lap')).toMatchObject({ player: 0, laps: 1 });
    expect(r2.events.find((e) => e.t === 'moved')).toMatchObject({ from: 15, to: 1, passedStart: true });
  });

  it('landing on a corner counts, and cornerIncome is configurable', () => {
    const s = game({ cfg: { cornerIncome: 3 } });
    const r = roll(s, 10); // P0 from 0 lands on P1's corner
    expect(coins(r.state, 0)).toBe(5 + 3);
    expect(r.state.players[0]!.cornersPassed).toBe(1);
    expect(r.state.players[0]!.position).toBe(10);
  });

  it('a long roll crosses several corners in order', () => {
    const s = game({ players: 3 });
    const r = roll(s, 25); // 0 -> 25: passes 10 and 20
    expect(r.state.players[0]!.cornersPassed).toBe(2);
    expect(coins(r.state, 0)).toBe(5 + 4);
  });
});

describe('civic: any token, pass and land, owner benefits', () => {
  it('fires for the owner on every pass and landing of anyone', () => {
    const s = game();
    put(s, 3, 'market', 1);
    put(s, 7, 'market', 1);
    const r = roll(s, 7);
    expect(coins(r.state, 1)).toBe(5 + 2);
    expect(coins(r.state, 0)).toBe(5);
    const f = r.events.filter((e) => e.t === 'tileFired');
    expect(f).toEqual([
      { t: 'tileFired', player: 0, tile: 'market', trigger: 'onPass', owner: 1, slot: 3 },
      { t: 'tileFired', player: 0, tile: 'market', trigger: 'onLand', owner: 1, slot: 7 },
    ]);
  });

  it('also fires for the owner\'s own token, once on landing', () => {
    const s = game();
    s.activePlayer = 1;
    put(s, 13, 'market', 1);
    const r = roll(s, 3);
    expect(coins(r.state, 1)).toBe(6);
  });

  it('Pilgrim Road pays only when a visitor goes by; Lighthouse reads the roll', () => {
    const s = game();
    put(s, 3, 'pilgrim-road', 1);
    expect(roll(s, 4).state.players[1]!.vp).toBe(1);
    const own = game();
    own.activePlayer = 1;
    put(own, 13, 'pilgrim-road', 1);
    expect(roll(own, 4).state.players[1]!.vp).toBe(0);

    const l = game();
    put(l, 3, 'lighthouse', 1);
    expect(coins(roll(l, 5).state, 1)).toBe(5 + 2);
    expect(coins(roll(l, 4).state, 1)).toBe(5 + 1);
  });

  it('Mill pays more next to a corner; Customs House counts the mover\'s tiles on its side', () => {
    const s = game();
    put(s, 1, 'mill', 1);
    put(s, 5, 'mill', 1);
    put(s, 9, 'mill', 1);
    expect(coins(roll(s, 9).state, 1)).toBe(5 + 2 + 1 + 2);

    const c = game();
    put(c, 4, 'customs-house', 1);
    put(c, 1, 'market', 0);
    put(c, 2, 'shrine', 0);
    put(c, 3, 'market', 1);
    put(c, 14, 'market', 0); // other side: not counted
    expect(coins(roll(c, 4).state, 1)).toBe(5 + 1 + 2); // market 1, customs house: P0 owns 2 tiles on side 0
  });

  it('Bazaar counts only its owner\'s adjacent civics', () => {
    const s = game();
    put(s, 4, 'market', 1);
    put(s, 5, 'bazaar', 1);
    put(s, 6, 'market', 0);
    const r = roll(s, 5);
    expect(coins(r.state, 1)).toBe(5 + 1 + 1); // market + bazaar (1 adjacent own civic)
  });
});

describe('private: only the owner\'s own token', () => {
  it('fires on pass once and on landing landBonus times', () => {
    const s = game();
    put(s, 3, 'mine', 0);
    put(s, 7, 'mine', 0);
    const r = roll(s, 7);
    expect(coins(r.state, 0)).toBe(5 + 4 + 8);
    expect(fired(r.events, 'mine', 'onPass')).toBe(1);
    expect(fired(r.events, 'mine', 'onLand')).toBe(2);
    const one = game({ cfg: { landBonus: 1 } });
    put(one, 3, 'mine', 0);
    expect(coins(roll(one, 3).state, 0)).toBe(9);
  });

  it('never fires for another player\'s token', () => {
    const s = game();
    put(s, 3, 'mine', 1);
    put(s, 7, 'monument', 1);
    const r = roll(s, 7);
    expect(r.events.some((e) => e.t === 'tileFired')).toBe(false);
    expect(coins(r.state, 0)).toBe(5);
    expect(coins(r.state, 1)).toBe(5);
  });

  it('Stables (a mover) runs once on landing, never on a pass, and chains', () => {
    const pass = game();
    put(pass, 3, 'stables', 0);
    const r0 = roll(pass, 4);
    expect(fired(r0.events, 'stables')).toBe(0);
    expect(r0.state.players[0]!.position).toBe(4);

    const s = game();
    put(s, 5, 'stables', 0);
    put(s, 7, 'stables', 0);
    put(s, 6, 'market', 1);
    const r = roll(s, 5); // lands 5 -> moves 2: passes 6, lands 7 -> moves 2 -> 9
    expect(r.state.players[0]!.position).toBe(9);
    expect(fired(r.events, 'stables')).toBe(2);
    expect(coins(r.state, 1)).toBe(6);
  });

  it('computed amounts: Workshop, Treasury, Chapel, Vineyard', () => {
    const w = game({ cfg: { landBonus: 1 } });
    put(w, 1, 'market', 0);
    put(w, 2, 'market', 0);
    put(w, 3, 'market', 1); // not mine
    put(w, 4, 'workshop', 0);
    expect(coins(roll(w, 4).state, 0)).toBe(5 + 1 + 1 + 2);

    const t = game({ cfg: { landBonus: 1 } });
    put(t, 3, 'treasury', 0);
    t.players[0]!.coins = 14;
    expect(coins(roll(t, 3).state, 0)).toBe(14 + 4);

    const c = game({ cfg: { landBonus: 1 } });
    put(c, 4, 'chapel', 0);
    put(c, 3, 'mine', 0);
    put(c, 5, 'monument', 0);
    put(c, 6, 'monument', 1); // not adjacent
    expect(roll(c, 4).state.players[0]!.vp).toBe(2);

    const v = game({ cfg: { landBonus: 1 } });
    put(v, 3, 'vineyard', 0);
    v.players[0]!.cornersPassed = 7;
    expect(roll(v, 3).state.players[0]!.vp).toBe(4);
    const v2 = game({ cfg: { landBonus: 1 } });
    put(v2, 3, 'vineyard', 0);
    v2.players[0]!.cornersPassed = 2;
    expect(roll(v2, 3).state.players[0]!.vp).toBe(2);
  });
});

describe('toll: only a visitor landing, the visitor pays the owner', () => {
  it('fires only on landing and never for the owner', () => {
    const s = game();
    put(s, 5, 'tollbooth', 1);
    const pass = roll(s, 6);
    expect(tolls(pass.events)).toHaveLength(0);
    expect(coins(pass.state, 0)).toBe(5);

    const land = roll(s, 5);
    expect(tolls(land.events)).toEqual([{ t: 'toll', payer: 0, owner: 1, tile: 'tollbooth', amount: 1 }]);
    expect(coins(land.state, 0)).toBe(4);
    expect(coins(land.state, 1)).toBe(6);

    const own = game();
    own.activePlayer = 1;
    put(own, 15, 'tollbooth', 1);
    expect(tolls(roll(own, 5).events)).toHaveLength(0);
  });

  it('pay is capped: Guard Post counts the owner\'s tolls, max 3; Moneylender reads the visitor\'s coins', () => {
    const g = (extra: number) => {
      const s = game();
      put(s, 5, 'guard-post', 1);
      for (let i = 0; i < extra; i++) put(s, 12 + i, 'tollbooth', 1);
      return s;
    };
    expect(tolls(roll(g(1), 5).events)[0]!.amount).toBe(2);
    expect(tolls(roll(g(4), 5).events)[0]!.amount).toBe(3);
    expect(coins(roll(g(4), 5).state, 1)).toBe(5 + 3);

    const m = (c: number) => {
      const s = game();
      put(s, 5, 'moneylender', 1);
      s.players[0]!.coins = c;
      return tolls(roll(s, 5).events)[0]!.amount;
    };
    expect([m(4), m(12), m(30)]).toEqual([0, 2, 3]);
  });

  it('pay with orElse: Bandit Camp takes 2 coins, or moves the visitor back 3 if they cannot pay', () => {
    const s = game();
    put(s, 5, 'bandit-camp', 1);
    const rich = roll(s, 5);
    expect(coins(rich.state, 0)).toBe(3);
    expect(rich.state.players[0]!.position).toBe(5);

    s.players[0]!.coins = 1;
    const poor = roll(s, 5);
    expect(coins(poor.state, 0)).toBe(1);
    expect(coins(poor.state, 1)).toBe(5);
    expect(poor.state.players[0]!.position).toBe(2);
    expect(tolls(poor.events)[0]!.amount).toBe(0);
  });

  it('a toll pays what the visitor has when there is no orElse; Tithe moves VP; Inn also gives the visitor VP', () => {
    const s = game();
    put(s, 5, 'bridge', 1);
    s.players[0]!.coins = 1;
    const r = roll(s, 5);
    expect([coins(r.state, 0), coins(r.state, 1), tolls(r.events)[0]!.amount]).toEqual([0, 6, 1]);

    const t = game();
    put(t, 5, 'tithe', 1);
    t.players[0]!.vp = 2;
    const rt = roll(t, 5);
    expect([rt.state.players[0]!.vp, rt.state.players[1]!.vp]).toEqual([1, 1]);
    expect(tolls(rt.events)[0]).toMatchObject({ amount: 0, vp: 1 });

    const i = game();
    put(i, 5, 'inn', 1);
    const ri = roll(i, 5);
    expect([coins(ri.state, 0), coins(ri.state, 1), ri.state.players[0]!.vp]).toEqual([3, 7, 1]);
  });

  it('tollFree: a flag skips one toll and is consumed; Harbour Master skips all and keeps the flag', () => {
    const s = game();
    put(s, 5, 'tollbooth', 1);
    s.players[0]!.flags.tollFree = 1;
    const free = roll(s, 5);
    expect(coins(free.state, 0)).toBe(5);
    expect(tolls(free.events)).toEqual([{ t: 'toll', payer: 0, owner: 1, tile: 'tollbooth', amount: 0 }]);
    expect(free.state.players[0]!.flags.tollFree).toBe(0);
    const next = game();
    next.players = free.state.players;
    put(next, 5, 'tollbooth', 1);
    next.players[0]!.position = 0;
    expect(coins(roll(next, 5).state, 0)).toBe(4);

    const hm = game();
    put(hm, 5, 'tollbooth', 1);
    put(hm, 12, 'harbour-master', 0, true);
    hm.players[0]!.flags.tollFree = 1;
    const r = roll(hm, 5);
    expect(coins(r.state, 0)).toBe(5);
    expect(r.state.players[0]!.flags.tollFree).toBe(1);
    expect(tolls(r.events)[0]!.amount).toBe(0);
  });

  it('Watchtower pays 2 and arms tollFree', () => {
    const s = game({ cfg: { landBonus: 1 } });
    put(s, 3, 'watchtower', 0);
    const r = roll(s, 3);
    expect(coins(r.state, 0)).toBe(7);
    expect(r.state.players[0]!.flags.tollFree).toBe(1);
  });

  it('Ferry pays 1 and jumps to the next corner without corner income', () => {
    const s = game();
    put(s, 5, 'ferry', 1);
    const r = roll(s, 5);
    expect(r.state.players[0]!.position).toBe(10);
    expect(coins(r.state, 0)).toBe(4);
    expect(r.events.some((e) => e.t === 'corner')).toBe(false);
    expect(r.state.players[0]!.cornersPassed).toBe(0);

    const w = game();
    w.players[0]!.position = 10;
    put(w, 15, 'ferry', 1);
    expect(roll(w, 5).state.players[0]!.position).toBe(0); // wraps to P0's own corner
  });
});

describe('public: only landing, the visitor benefits, the owner gets a premium', () => {
  it('pays the visitor on landing, nothing on a pass, nothing to the owner', () => {
    const s = game();
    put(s, 5, 'well', 1);
    const pass = roll(s, 6);
    expect(pass.events.some((e) => e.t === 'tileFired')).toBe(false);
    const land = roll(s, 5);
    expect([coins(land.state, 0), coins(land.state, 1)]).toEqual([7, 5]);
  });

  it('runs twice for the owner on their own tile', () => {
    const s = game();
    put(s, 5, 'well', 0);
    const r = roll(s, 5);
    expect(coins(r.state, 0)).toBe(9);
    expect(fired(r.events, 'well')).toBe(2);
  });

  it('who: owner echoes to the owner: Springboard moves the visitor and pays the owner 1; Harbour jumps and pays 2', () => {
    const s = game();
    put(s, 3, 'springboard', 1);
    const r = roll(s, 3);
    expect(r.state.players[0]!.position).toBe(6);
    expect([coins(r.state, 0), coins(r.state, 1)]).toEqual([5, 6]);

    const own = game();
    put(own, 3, 'springboard', 0);
    const ro = roll(own, 3);
    expect(ro.state.players[0]!.position).toBe(6);
    expect(coins(ro.state, 0)).toBe(6); // a mover runs once, even on the owner's own tile

    const h = game();
    put(h, 4, 'harbour', 1);
    const rh = roll(h, 4);
    expect(rh.state.players[0]!.position).toBe(10);
    expect([coins(rh.state, 0), coins(rh.state, 1)]).toEqual([5, 7]); // no corner income for the jump
  });

  it('Festival: visitor 2, everyone else 1', () => {
    const s = game({ players: 3 });
    put(s, 4, 'festival', 1);
    const r = roll(s, 4);
    expect(r.state.players.map((p) => p.coins)).toEqual([7, 6, 6]);
  });

  it('Oracle rolls again; Library counts its owner\'s adjacent public tiles', () => {
    const o = game();
    put(o, 3, 'oracle', 1);
    const r = roll(o, 3);
    expect(r.events.filter((e) => e.t === 'rolled')).toHaveLength(2);
    expect(r.state.players[0]!.position).toBe(6); // the second roll is three d1s again

    const l = game();
    put(l, 5, 'library', 1);
    put(l, 4, 'shrine', 1);
    put(l, 6, 'shrine', 0);
    expect(roll(l, 5).state.players[0]!.vp).toBe(1);
  });
});

describe('legal actions and rejection', () => {
  it('buyTile targets every non-corner slot; corners and unaffordable tiles are not offered', () => {
    const s = game();
    s.shop = ['market', 'bridge'];
    s.players[0]!.coins = 10;
    const r = roll(s, 1);
    const legal = legalActions(r.state);
    const buys = legal.filter((a) => a.type === 'buyTile');
    expect(buys).toHaveLength(2 * 18);
    expect(buys.some((a) => a.type === 'buyTile' && a.slot % 10 === 0)).toBe(false);
    expect(() => step(r.state, { type: 'buyTile', shopIndex: 0, slot: 10 })).toThrow(/illegal/);
    s.players[0]!.coins = 3;
    const poor = legalActions(roll(s, 1).state).filter((a) => a.type === 'buyTile');
    expect(poor.every((a) => a.type === 'buyTile' && a.shopIndex === 0)).toBe(true);
  });
});
