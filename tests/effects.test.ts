import { describe, expect, it } from 'vitest';
import { createGame, legalActions, makeConfig, step } from '../engine/engine.ts';
import type { Effect, GameConfig, GameState, TileDef } from '../engine/types.ts';
import { adjacentSlots, countAdjacentWithTag, landingDistribution } from '../engine/board.ts';
import { STARTER_MODS, STARTER_TILES, defaultConfig } from '../tiles/index.ts';
import { validateMods, validateTiles } from '../tiles/schema.ts';
import { randomBot } from '../bots/random.ts';
import { playGame } from '../sim/runner.ts';

/** A tile whose onLand runs `effects`; placed at slot 1 so a forced landing fires it. */
function tile(id: string, effects: Effect[], extra: Partial<TileDef> = {}): TileDef {
  return { id, name: id, cost: 1, copies: 1, tags: ['income'], onLand: effects, ...extra };
}

/** Game with 3 players, player 0 about to land on slot 1 with a forced d1 roll. */
function setup(tiles: TileDef[], place: (s: GameState) => void, cfg: Partial<GameConfig> = {}): GameState {
  const config = makeConfig({ players: 3, tileSet: tiles, modSet: STARTER_MODS, boardSize: 8, ...cfg });
  const s = createGame(config, 1);
  s.shop = [];
  s.bag = [];
  s.players.forEach((p) => (p.dice = [{ sides: 1 }])); // every roll is exactly 1
  place(s);
  return s;
}

function roll(s: GameState) {
  return step(s, { type: 'roll' });
}

describe('effect DSL, one test per op', () => {
  it('gain', () => {
    const s = setup([tile('t', [{ op: 'gain', res: 'vp', amount: 2 }, { op: 'gain', res: 'coins', amount: 3 }])], (s) => {
      s.players[0]!.board[1] = 't';
    });
    const r = roll(s);
    expect(r.state.players[0]!.vp).toBe(2);
    expect(r.state.players[0]!.coins).toBe(5 + 3);
    expect(r.events).toContainEqual({ t: 'tileFired', player: 0, tile: 't', trigger: 'onLand' });
    expect(r.events).toContainEqual({ t: 'resource', player: 0, res: 'vp', delta: 2, source: 't' });
  });

  it('gain with computed amounts (adjacentWithTag, ownedWithTag, laps)', () => {
    const inc = tile('inc', [{ op: 'gain', res: 'coins', amount: 1 }]);
    const t = tile('t', [
      { op: 'gain', res: 'coins', amount: { adjacentWithTag: 'income', per: 2 } },
      { op: 'gain', res: 'vp', amount: { ownedWithTag: 'income', per: 1 } },
      { op: 'gain', res: 'vp', amount: { laps: true, per: 0.5 } },
    ]);
    const s = setup([inc, t], (s) => {
      const p = s.players[0]!;
      p.board[1] = 't';
      p.board[2] = 'inc';
      p.board[5] = 'inc';
      p.laps = 5;
    });
    const r = roll(s);
    // adjacent to slot 1: slots 0 (Start, nothing) and 2 (inc) -> 1 × 2 coins
    expect(r.state.players[0]!.coins).toBe(5 + 2);
    // owned income tiles: t itself is tagged income in this helper, plus two inc -> 3 VP; floor(5 × 0.5) = 2 VP
    expect(r.state.players[0]!.vp).toBe(3 + 2);
  });

  it('lose (self / others / all) clamps at zero', () => {
    const s = setup([tile('t', [{ op: 'lose', res: 'coins', amount: 7, who: 'others' }, { op: 'lose', res: 'vp', amount: 1, who: 'all' }])], (s) => {
      s.players[0]!.board[1] = 't';
      s.players[1]!.coins = 2;
      s.players[2]!.vp = 3;
    });
    const r = roll(s);
    expect(r.state.players.map((p) => p.coins)).toEqual([5, 0, 0]);
    expect(r.state.players.map((p) => p.vp)).toEqual([0, 0, 2]);
  });

  it('steal asks for a target, then moves up to the amount the target has', () => {
    const s = setup([tile('t', [{ op: 'steal', res: 'coins', amount: 4 }])], (s) => {
      s.players[0]!.board[1] = 't';
      s.players[2]!.coins = 3;
    });
    const r = roll(s);
    expect(r.state.phase).toBe('roll');
    expect(legalActions(r.state)).toEqual([{ type: 'chooseTarget', player: 1 }, { type: 'chooseTarget', player: 2 }]);
    const r2 = step(r.state, { type: 'chooseTarget', player: 2 });
    expect(r2.state.players[2]!.coins).toBe(0);
    expect(r2.state.players[0]!.coins).toBe(8);
    expect(r2.state.phase).toBe('shop');
    expect(r2.events).toContainEqual({ t: 'attacked', attacker: 0, target: 2, tile: 't', cancelled: false });
  });

  it('move self forward triggers passes, laps and the landed tile; move target does not', () => {
    const s = setup(
      [
        tile('spring', [{ op: 'move', by: 3, who: 'self' }]),
        tile('cash', [{ op: 'gain', res: 'coins', amount: 10 }]),
        tile('toll', [], { onPass: [{ op: 'gain', res: 'coins', amount: 1 }], onLand: undefined }),
        tile('shove', [{ op: 'move', by: -3, who: 'target' }]),
      ],
      (s) => {
        const p = s.players[0]!;
        p.board[1] = 'spring';
        p.board[2] = 'toll';
        p.board[4] = 'cash';
        s.players[1]!.position = 1;
        s.players[1]!.board[6] = 'cash';
      },
    );
    const r = roll(s);
    expect(r.state.players[0]!.position).toBe(4);
    expect(r.state.players[0]!.coins).toBe(5 + 1 + 10);
    // now player 1 lands on slot 2 ... give them a shove tile there
    const s2 = r.state;
    s2.players[1]!.board[2] = 'shove';
    const r1 = step(step(s2, { type: 'pass' }).state, { type: 'roll' });
    const r2 = step(r1.state, { type: 'chooseTarget', player: 0 });
    expect(r2.state.players[0]!.position).toBe(1); // 4 - 3, no landing effect fired for the victim
    expect(r2.state.players[0]!.coins).toBe(16);
    // backward wrap
    s2.players[0]!.position = 1;
  });

  it('move backward wraps around the loop', () => {
    const s = setup([tile('shove', [{ op: 'move', by: -3, who: 'target' }])], (s) => {
      s.players[0]!.board[1] = 'shove';
      s.players[1]!.position = 1;
    });
    const r = step(roll(s).state, { type: 'chooseTarget', player: 1 });
    expect(r.state.players[1]!.position).toBe(6);
  });

  it('teleport to start pays no lap income; teleport random stays on the board', () => {
    const s = setup([tile('portal', [{ op: 'teleport', to: 'start', who: 'self' }]), tile('warp', [{ op: 'teleport', to: 'random', who: 'others' }])], (s) => {
      s.players[0]!.board[1] = 'portal';
      s.players[1]!.board[1] = 'warp';
    });
    const r = roll(s);
    expect(r.state.players[0]!.position).toBe(0);
    expect(r.state.players[0]!.laps).toBe(0);
    expect(r.state.players[0]!.coins).toBe(5);
    const r2 = step(step(r.state, { type: 'pass' }).state, { type: 'roll' });
    for (const p of r2.state.players) expect(p.position).toBeGreaterThanOrEqual(0);
    for (const p of r2.state.players) expect(p.position).toBeLessThan(8);
  });

  it('rollAgain rolls and moves again within the same turn', () => {
    const s = setup([tile('wind', [{ op: 'rollAgain' }])], (s) => {
      s.players[0]!.board[1] = 'wind';
    });
    const r = roll(s);
    expect(r.events.filter((e) => e.t === 'rolled')).toHaveLength(2);
    expect(r.state.players[0]!.position).toBe(2);
    expect(r.state.phase).toBe('shop');
  });

  it('rollAgain chains are capped by maxTriggerChain', () => {
    const s = setup([tile('wind', [{ op: 'rollAgain' }])], (s) => {
      for (let i = 1; i < 8; i++) s.players[0]!.board[i] = 'wind';
    }, { maxTriggerChain: 5 });
    const r = roll(s);
    expect(r.events.filter((e) => e.t === 'rolled')).toHaveLength(6);
    expect(r.state.phase).toBe('shop');
  });

  it('setFlag: permanent flags persist, round flags expire, and a shield cancels one attack', () => {
    const s = setup(
      [
        tile('tower', [{ op: 'setFlag', flag: 'shielded', value: 1, who: 'self', rounds: 1 }, { op: 'setFlag', flag: 'brave', value: 2, who: 'self' }]),
        tile('bandit', [{ op: 'steal', res: 'coins', amount: 2 }]),
      ],
      (s) => {
        s.players[0]!.board[1] = 'tower';
        s.players[1]!.board[1] = 'bandit';
        s.players[2]!.board[1] = 'bandit';
      },
    );
    let st = roll(s).state;
    expect(st.players[0]!.flags.brave).toBe(2);
    expect(st.roundModifiers).toContainEqual({ kind: 'flag', player: 0, flag: 'shielded', value: 1, until: { round: 2, player: 0 } });
    st = step(st, { type: 'pass' }).state;
    // player 1 attacks player 0: cancelled, shield consumed
    let r = step(roll(st).state, { type: 'chooseTarget', player: 0 });
    expect(r.events).toContainEqual({ t: 'attacked', attacker: 1, target: 0, tile: 'bandit', cancelled: true });
    expect(r.state.players[0]!.coins).toBe(5);
    st = step(r.state, { type: 'pass' }).state;
    // player 2 attacks: shield is gone
    r = step(roll(st).state, { type: 'chooseTarget', player: 0 });
    expect(r.events).toContainEqual({ t: 'attacked', attacker: 2, target: 0, tile: 'bandit', cancelled: false });
    expect(r.state.players[0]!.coins).toBe(3);
  });

  it('lockTile makes a random owned tile inert for N rounds', () => {
    const s = setup(
      [tile('sab', [{ op: 'lockTile', who: 'target', rounds: 2 }]), tile('cash', [{ op: 'gain', res: 'coins', amount: 10 }])],
      (s) => {
        s.players[0]!.board[1] = 'sab';
        s.players[1]!.board[1] = 'cash';
      },
    );
    const r = step(roll(s).state, { type: 'chooseTarget', player: 1 });
    expect(r.events).toContainEqual({ t: 'locked', player: 1, slot: 1, tile: 'cash', by: 0 });
    expect(r.state.roundModifiers).toContainEqual({ kind: 'lock', player: 1, slot: 1, until: { round: 3, player: 0 } });
    // player 1 lands on the locked tile and gets nothing
    const r1 = roll(step(r.state, { type: 'pass' }).state);
    expect(r1.state.players[1]!.coins).toBe(5);
    expect(r1.events.some((e) => e.t === 'tileFired')).toBe(false);
  });

  it('reflect returns part of the coin loss to the attacker, before other defenses', () => {
    const s = setup(
      [
        tile('bandit', [{ op: 'steal', res: 'coins', amount: 4 }]),
        tile('wall', [], { onTargeted: [{ op: 'reflect', fraction: 0.5 }], onLand: undefined }),
        tile('moat', [], { onTargeted: [{ op: 'lose', res: 'coins', amount: 2, who: 'target' }], onLand: undefined }),
      ],
      (s) => {
        s.players[0]!.board[1] = 'bandit';
        s.players[1]!.board[3] = 'wall';
        s.players[1]!.board[5] = 'moat';
        s.players[1]!.coins = 10;
      },
    );
    const r = step(roll(s).state, { type: 'chooseTarget', player: 1 });
    // attacker: 5 + 4 stolen - 2 reflected - 2 moat = 5
    expect(r.state.players[0]!.coins).toBe(5);
    expect(r.state.players[1]!.coins).toBe(6);
    const fired = r.events.filter((e) => e.t === 'tileFired').map((e) => (e.t === 'tileFired' ? e.tile : ''));
    expect(fired).toEqual(['bandit', 'wall', 'moat']);
  });

  it('if / else branches on flags, adjacency and die total', () => {
    const t = tile('t', [
      { op: 'if', cond: { flag: 'brave', op: '>', value: 0 }, then: [{ op: 'gain', res: 'vp', amount: 1 }], else: [{ op: 'gain', res: 'vp', amount: 10 }] },
      { op: 'if', cond: { adjacentWithTag: 'income', min: 1 }, then: [{ op: 'gain', res: 'coins', amount: 1 }] },
      { op: 'if', cond: { dieTotal: '<=', value: 1 }, then: [{ op: 'gain', res: 'coins', amount: 100 }] },
    ]);
    const s = setup([t], (s) => {
      s.players[0]!.board[1] = 't';
      s.players[0]!.board[2] = 't';
    });
    const r = roll(s);
    expect(r.state.players[0]!.vp).toBe(10);
    expect(r.state.players[0]!.coins).toBe(5 + 1 + 100);
  });

  it('addDie, replaceDie and setDice through the mod shop', () => {
    const config = makeConfig({ players: 2, tileSet: [], modSet: STARTER_MODS, startCoins: 50 });
    let s = createGame(config, 2);
    s = step(step(s, { type: 'roll' }).state, { type: 'buyMod', modId: 'second-die' }).state;
    expect(s.players[0]!.dice).toEqual([{ sides: 6 }, { sides: 4 }]);
    s = step(step(s, { type: 'roll' }).state, { type: 'pass' }).state; // player 1
    s = step(step(s, { type: 'roll' }).state, { type: 'buyMod', modId: 'heavy-die' }).state;
    expect(s.players[0]!.dice).toEqual([{ sides: 8 }, { sides: 4 }]);
    expect(legalActions(s).some((a) => a.type === 'buyMod' && a.modId === 'heavy-die')).toBe(false);
    s = step(step(s, { type: 'roll' }).state, { type: 'buyMod', modId: 'haste' }).state; // player 1
    expect(s.roundModifiers).toContainEqual({ kind: 'dice', player: 1, sides: 8, until: { round: 3, player: 1 } });
    s = step(s, { type: 'roll' }).state; // player 0 round 3
    s = step(s, { type: 'pass' }).state;
    const r = step(s, { type: 'roll' }); // player 1 rolls d8 under haste
    const rolled = r.events.find((e) => e.t === 'rolled')!;
    if (rolled.t === 'rolled') expect(rolled.dice).toHaveLength(1);
  });

  it('reroll token offers a one-time reroll choice', () => {
    const config = makeConfig({ players: 2, tileSet: [], modSet: STARTER_MODS, startCoins: 50 });
    let s = createGame(config, 11);
    s = step(step(s, { type: 'roll' }).state, { type: 'buyMod', modId: 'reroll' }).state;
    s = step(step(s, { type: 'roll' }).state, { type: 'pass' }).state;
    const r = step(s, { type: 'roll' });
    expect(legalActions(r.state)).toEqual([{ type: 'reroll' }, { type: 'keepRoll' }]);
    const r2 = step(r.state, { type: 'reroll' });
    expect(r2.events.filter((e) => e.t === 'rolled')).toHaveLength(1);
    expect(r2.state.players[0]!.mods).toEqual([]);
    expect(r2.state.phase).toBe('shop');
  });
});

describe('shop and board', () => {
  it('buyTile places or replaces; replaced tiles are discarded with no refund', () => {
    const config = makeConfig({ players: 2, tileSet: STARTER_TILES, modSet: [], startCoins: 50 });
    let s = createGame(config, 3);
    s.shop = ['market', 'shrine', 'expansion'];
    s.players.forEach((p) => (p.dice = [{ sides: 1 }]));
    s = step(s, { type: 'roll' }).state;
    s = step(s, { type: 'buyTile', shopIndex: 0, slot: 5 }).state;
    expect(s.players[0]!.board[5]).toBe('market');
    expect(s.players[0]!.coins).toBe(47);
    s = step(step(s, { type: 'roll' }).state, { type: 'pass' }).state;
    s = step(s, { type: 'roll' }).state;
    const legal = legalActions(s);
    expect(legal).toContainEqual({ type: 'buyTile', shopIndex: 0, slot: 5 });
    expect(legal.some((a) => a.type === 'buyTile' && a.slot === 0)).toBe(false);
    expect(legal.some((a) => a.type === 'buyTile' && s.shop[a.shopIndex] === 'expansion')).toBe(false);
    s = step(s, { type: 'buyTile', shopIndex: 0, slot: 5 }).state; // shrine over market
    expect(s.players[0]!.board[5]).toBe('shrine');
    expect(s.discard).toContain('market');
    expect(s.players[0]!.coins).toBe(44);
  });

  it('sellTile refunds half and clears the slot', () => {
    const config = makeConfig({ players: 2, tileSet: STARTER_TILES, modSet: [], startCoins: 0 });
    let s = createGame(config, 3);
    s.players[0]!.board[3] = 'cathedral';
    s = step(s, { type: 'roll' }).state;
    const r = step(s, { type: 'sellTile', slot: 3 });
    expect(r.state.players[0]!.board[3]).toBeNull();
    expect(r.state.players[0]!.coins).toBe(5);
    expect(r.events).toContainEqual({ t: 'sold', player: 0, tile: 'cathedral', refund: 5 });
  });

  it('expansion grows the loop, keeps the token on its tile, and Expansion+ inserts a Market', () => {
    const config = makeConfig({ players: 2, tileSet: STARTER_TILES, modSet: [], startCoins: 50 });
    let s = createGame(config, 3);
    s.shop = ['expansion', 'expansion-plus'];
    s.players[0]!.board[2] = 'shrine';
    s.players[0]!.position = 2;
    s.players[0]!.dice = [{ sides: 1 }];
    s = step(s, { type: 'roll' }).state; // moves to 3
    s = step(s, { type: 'buyExpansion', shopIndex: 0, afterSlot: 1 }).state;
    const p = s.players[0]!;
    expect(p.board).toHaveLength(9);
    expect(p.board[2]).toBeNull();
    expect(p.board[3]).toBe('shrine');
    expect(p.position).toBe(4);
    s = step(step(s, { type: 'roll' }).state, { type: 'pass' }).state;
    s = step(s, { type: 'roll' }).state;
    s = step(s, { type: 'buyExpansion', shopIndex: 0, afterSlot: 8 }).state;
    expect(s.players[0]!.board).toHaveLength(10);
    expect(s.players[0]!.board[9]).toBe('market');
    expect(s.discard).toEqual(expect.arrayContaining(['expansion', 'expansion-plus']));
  });

  it('shop refills from the bag and reshuffles the discard when the bag is empty', () => {
    const config = makeConfig({ players: 2, tileSet: STARTER_TILES, modSet: [], startCoins: 50, shopSize: 2 });
    let s = createGame(config, 3);
    s.shop = ['market', 'shrine'];
    s.bag = [];
    s.discard = ['mine'];
    s = step(s, { type: 'roll' }).state;
    const r = step(s, { type: 'buyTile', shopIndex: 0, slot: 1 });
    expect(r.state.shop).toEqual(['shrine', 'mine']);
    expect(r.state.discard).toEqual([]);
    expect(r.events).toContainEqual({ t: 'shopRefilled', shop: ['shrine', 'mine'] });
  });

  it('adjacency is correct on the loop, including after expansion', () => {
    expect(adjacentSlots(0, 8)).toEqual([7, 1]);
    expect(adjacentSlots(7, 8)).toEqual([6, 0]);
    expect(adjacentSlots(3, 8)).toEqual([2, 4]);
    expect(adjacentSlots(0, 2)).toEqual([1]);
    const config = makeConfig({ players: 2, tileSet: STARTER_TILES, modSet: [], startCoins: 50 });
    const s = createGame(config, 3);
    const p = s.players[0]!;
    p.board[1] = 'market';
    p.board[7] = 'mine';
    p.board[4] = 'workshop';
    expect(countAdjacentWithTag(s, 0, 0, 'income')).toBe(2); // Start's neighbours wrap: 7 and 1
    expect(countAdjacentWithTag(s, 0, 4, 'income')).toBe(0);
    // insert after slot 0 -> market shifts to 2, Start's neighbours are now 8 (mine) and 1 (empty)
    s.shop = ['expansion'];
    let st = step(s, { type: 'roll' }).state;
    st = step(st, { type: 'buyExpansion', shopIndex: 0, afterSlot: 0 }).state;
    expect(st.players[0]!.board[2]).toBe('market');
    expect(countAdjacentWithTag(st, 0, 0, 'income')).toBe(1);
    expect(countAdjacentWithTag(st, 0, 1, 'income')).toBe(1);
    expect(countAdjacentWithTag(st, 0, 8, 'income')).toBe(0);
  });

  it('landing distribution sums to 1 and wraps the loop', () => {
    const d = landingDistribution(6, [{ sides: 6 }], 8);
    let sum = 0;
    for (const p of d.values()) sum += p;
    expect(sum).toBeCloseTo(1);
    expect(d.get(7)).toBeCloseTo(1 / 6);
    expect(d.get(0)).toBeCloseTo(1 / 6);
    expect(d.get(4)).toBeCloseTo(1 / 6);
    expect(d.get(5)).toBeUndefined();
  });
});

describe('starter data', () => {
  it('every starter tile and mod validates against the schema', () => {
    expect(validateTiles(STARTER_TILES)).toEqual([]);
    expect(validateMods(STARTER_MODS)).toEqual([]);
  });

  it('has 23 tiles and 63 copies', () => {
    expect(STARTER_TILES).toHaveLength(23);
    expect(STARTER_TILES.reduce((n, t) => n + t.copies, 0)).toBe(63);
  });

  it('the schema rejects bad data', () => {
    expect(validateTiles([{ id: 'x', name: 'x', cost: 1, copies: 1, tags: ['income'] }])).not.toEqual([]);
    expect(validateTiles([{ id: 'x', name: 'x', cost: 1, copies: 1, tags: ['nope'], onLand: [] }])).not.toEqual([]);
    expect(validateTiles([{ id: 'x', name: 'x', cost: 1, copies: 1, tags: ['income'], onLand: [{ op: 'explode' }] }])).not.toEqual([]);
  });

  for (const endMode of ['turnCap', 'vpRace', 'lapRace'] as const) {
    it(`a game with the full bag terminates (${endMode})`, () => {
      const endValue = { turnCap: 15, vpRace: 30, lapRace: 6 }[endMode];
      for (let seed = 1; seed <= 15; seed++) {
        const rec = playGame(seed, Array(4).fill(randomBot), defaultConfig({ endMode, endValue }));
        expect(rec.events.at(-1)!.t).toBe('gameEnded');
        expect(rec.rounds).toBeLessThanOrEqual(50);
      }
    });
  }
});
