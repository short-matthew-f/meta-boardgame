// Shared board mode: tile data, schema, text, replay, metrics and bots.
import { describe, expect, it } from 'vitest';
import { LANDMARK_RACE_MODE, VP_POOL_MODE, actionKey, createGame, legalActions, step } from '../engine/engine.ts';
import { Rng } from '../engine/rng.ts';
import { describeAction, describeEffects, describeEvent, describeLandmark, describeTile } from '../engine/describe.ts';
import type { Action, GameConfig, TileDef } from '../engine/types.ts';
import { LANDMARKS, SHARED_TILES, defaultConfig, defaultSharedConfig } from '../tiles/index.ts';
import { validateLandmarks, validateTiles } from '../tiles/schema.ts';
import { BOTS, botByName } from '../bots/index.ts';
import { batch, parseDice } from '../sim/batch.ts';
import { playGame, replay } from '../sim/runner.ts';
import { game, put, roll } from './sharedHelpers.ts';

// id: [cost, copies], from design/shared-board-tiles.md
const DESIGN: Record<string, Record<string, [number, number]>> = {
  civic: { market: [3, 5], caravanserai: [6, 3], 'pilgrim-road': [5, 3], bazaar: [5, 3], lighthouse: [5, 2], mill: [4, 3], amphitheatre: [9, 2], 'customs-house': [7, 2] },
  private: { mine: [4, 4], monument: [6, 3], workshop: [5, 3], stables: [4, 2], treasury: [7, 2], chapel: [5, 3], vineyard: [6, 2], watchtower: [5, 2] },
  toll: { tollbooth: [3, 4], bridge: [6, 2], inn: [5, 3], ferry: [5, 2], 'guard-post': [6, 2], tithe: [7, 1], 'bandit-camp': [4, 2], moneylender: [6, 2] },
  public: { shrine: [3, 5], well: [3, 4], fairground: [6, 3], springboard: [4, 2], oracle: [6, 2], library: [7, 2], harbour: [6, 2], festival: [8, 1] },
};
const LANDMARK_COSTS: Record<string, number> = { cathedral: 12, mint: 10, 'city-walls': 10, 'harbour-master': 10, observatory: 11, guildhall: 10, archive: 12, colosseum: 14 };

describe('shared tile data', () => {
  it('has the 32 tiles of the design with its costs, copies and classes', () => {
    expect(SHARED_TILES).toHaveLength(32);
    for (const [cls, tiles] of Object.entries(DESIGN)) {
      for (const [id, [cost, copies]] of Object.entries(tiles)) {
        const t = SHARED_TILES.find((x) => x.id === id);
        expect(t, id).toBeDefined();
        expect([t!.class, t!.cost, t!.copies], id).toEqual([cls, cost, copies]);
      }
    }
    expect(SHARED_TILES.reduce((n, t) => n + t.copies, 0)).toBe(83);
  });

  it('has the 8 landmarks', () => {
    expect(Object.fromEntries(LANDMARKS.map((l) => [l.id, l.cost]))).toEqual(LANDMARK_COSTS);
    const passives = Object.assign({}, ...LANDMARKS.map((l) => l.passive ?? {}));
    expect(Object.keys(passives).sort()).toEqual(['civicBonus', 'dieSides', 'endGameVpPerTiles', 'noReplace', 'shopDiscount', 'tollFree', 'visitorLandVp']);
  });

  it('validates, and the tags keep weight-table bots working', () => {
    expect(validateTiles(SHARED_TILES)).toEqual([]);
    expect(validateLandmarks(LANDMARKS, SHARED_TILES.map((t) => t.id))).toEqual([]);
    const tag = (id: string) => SHARED_TILES.find((t) => t.id === id)!.tags;
    expect(tag('market')).toContain('income');
    expect(tag('shrine')).toContain('score');
    for (const id of ['stables', 'springboard', 'oracle', 'harbour', 'ferry']) expect(tag(id)).toContain('mover');
    for (const id of ['bazaar', 'chapel', 'library', 'workshop']) expect(tag(id)).toContain('combo');
    for (const t of SHARED_TILES.filter((x) => x.class === 'toll')) expect(t.tags).toContain('attack');
    expect(tag('watchtower')).toContain('defense');
  });

  it('the schema rejects malformed shared data', () => {
    const base = SHARED_TILES.find((t) => t.id === 'market')!;
    const bad = (patch: Partial<TileDef> & Record<string, unknown>) => validateTiles([{ ...base, ...patch }]);
    expect(bad({ class: 'weird' as never })).toEqual(expect.arrayContaining([expect.stringContaining('class')]));
    expect(bad({ effects: undefined })).toEqual(expect.arrayContaining([expect.stringContaining('effects')]));
    expect(bad({ onLand: [{ op: 'rollAgain' }] })).toEqual(expect.arrayContaining([expect.stringContaining('onLand')]));
    expect(bad({ class: 'toll', effects: [{ op: 'gain', res: 'coins', amount: 1 }] })).toEqual(expect.arrayContaining([expect.stringContaining('pay')]));
    expect(bad({ effects: [{ op: 'pay', amount: 1, cap: 'x' } as never] })).not.toEqual([]);
    expect(bad({ effects: [{ op: 'gain', res: 'coins', amount: { ownedWithClass: 'nope', per: 1 } } as never] })).not.toEqual([]);
    expect(bad({ effects: [{ op: 'gain', res: 'coins', amount: { coinsHeldDiv: 5, per: 1, of: 'you' } } as never] })).not.toEqual([]);
    expect(bad({ effects: [{ op: 'teleport', to: 'moon', who: 'self' } as never] })).not.toEqual([]);
    expect(bad({ effects: [{ op: 'if', cond: { adjacentToCorner: false }, then: [] } as never] })).not.toEqual([]);
    expect(validateTiles([{ ...base, effects: [{ op: 'pay', amount: 1, orElse: [{ op: 'move', by: -3, who: 'target' }] }], class: 'toll' }])).toEqual([]);
    const lm = LANDMARKS[0]!;
    expect(validateLandmarks([{ ...lm, passive: { bogus: 1 } }])).not.toEqual([]);
    expect(validateLandmarks([{ ...lm, passive: { dieSides: 0 } }])).not.toEqual([]);
    expect(validateLandmarks([lm, lm])).not.toEqual([]);
    expect(validateLandmarks([lm], ['cathedral'])).not.toEqual([]);
    expect(validateLandmarks([{ ...lm, cost: -1 }])).not.toEqual([]);
  });

  it('every shared tile fires at least once in a scripted position, without throwing', () => {
    for (const t of SHARED_TILES) {
      const owner = t.class === 'private' ? 0 : 1;
      const s = game({ players: 3 });
      put(s, 3, t.id, owner);
      s.players[0]!.coins = 20;
      s.players[0]!.vp = 3;
      const r = roll(s, 3);
      expect(r.events.filter((e) => e.t === 'tileFired' && e.tile === t.id).length, t.id).toBeGreaterThan(0);
      if (t.class === 'civic') expect(roll(s, 4).events.some((e) => e.t === 'tileFired' && e.trigger === 'onPass'), `${t.id} pass`).toBe(true);
    }
  });

  it('every landmark fires on its owner\'s landing', () => {
    for (const l of LANDMARKS) {
      const s = game();
      put(s, 3, l.id, 0, true);
      const r = roll(s, 3);
      expect(r.events.some((e) => e.t === 'tileFired' && e.tile === l.id), l.id).toBe(true);
    }
  });
});

describe('text', () => {
  it('describes every tile and landmark without gaps', () => {
    for (const t of SHARED_TILES) {
      const text = describeTile(t, SHARED_TILES);
      expect(text, t.id).toContain(t.name);
      expect(text, t.id).not.toMatch(/undefined|NaN|\[object/);
      expect(text, t.id).toContain(t.class!);
    }
    for (const l of LANDMARKS) expect(describeLandmark(l), l.id).not.toMatch(/undefined|NaN|\[object/);
  });

  it('reads the class roles', () => {
    const get = (id: string) => describeTile(SHARED_TILES.find((t) => t.id === id)!);
    expect(get('tollbooth')).toContain('visitor pays owner 1 coin');
    expect(get('bandit-camp')).toContain('if they cannot, move visitor −3 instead');
    expect(get('guard-post')).toContain('at most 3 coins');
    expect(get('moneylender')).toContain('per 5 coins held by the visitor');
    expect(get('shrine')).toContain('visitor: gain 1 VP');
    expect(get('springboard')).toContain('owner gains 1 coin');
    expect(get('festival')).toContain('others gain 1 coin');
    expect(get('vineyard')).toContain('max 4');
    expect(get('ferry')).toContain('visitor to the next corner');
    expect(describeLandmark(LANDMARKS.find((l) => l.id === 'archive')!)).toContain('1 VP per 2 tiles');
    expect(describeEffects([{ op: 'if', cond: { adjacentToCorner: true }, then: [{ op: 'gain', res: 'coins', amount: 1 }] }])).toContain('next to a corner');
  });

  it('describes the new actions and events', () => {
    const s = game();
    put(s, 13, 'mine', 1);
    put(s, 14, 'market', 0);
    const st = roll(s, 1).state;
    st.shop = ['bridge'];
    st.players[0]!.coins = 20;
    expect(describeAction(st, { type: 'buyTile', shopIndex: 0, slot: 13 })).toBe('Buy Bridge (6c) → slot 13, buying out Mine from Player 2 (they get 2c)');
    expect(describeAction(st, { type: 'buyTile', shopIndex: 0, slot: 14 })).toContain('replacing Market');
    expect(describeAction(st, { type: 'buyLandmark', landmarkId: 'cathedral', slot: 5 })).toBe('Build Cathedral landmark (12c) → slot 5');
    expect(describeAction(st, { type: 'sellTile', slot: 14 })).toBe('Sell Market from slot 14 for 1c');
    expect(describeEvent({ t: 'toll', payer: 0, owner: 1, tile: 'tollbooth', amount: 1 })).toBe('  P1 pays P2 1 coins at tollbooth');
    expect(describeEvent({ t: 'toll', payer: 0, owner: 1, tile: 'tollbooth', amount: 0 })).toBe('  P1 pays P2 nothing at tollbooth');
    expect(describeEvent({ t: 'corner', player: 0, own: true, income: 4 })).toContain('own corner, +4');
    expect(describeEvent({ t: 'tileFired', player: 0, tile: 'market', trigger: 'onPass', owner: 1, slot: 3 })).toContain("P2's at slot 3");
    expect(describeEvent({ t: 'bought', player: 0, item: 'bridge', cost: 6, slot: 13, displaced: 1 })).toContain('buying out P2');
    // loops text is unchanged
    expect(describeEvent({ t: 'tileFired', player: 0, tile: 'market', trigger: 'onLand' })).toBe('  P1 market fires (onLand)');
    expect(describeEvent({ t: 'lap', player: 0, laps: 1, income: 3 })).toBe('  P1 completes lap 1, +3 coins');
  });
});

describe('--dice', () => {
  it('parses NdM', () => {
    expect(parseDice('2d6')).toEqual([{ sides: 6 }, { sides: 6 }]);
    expect(parseDice('d8')).toEqual([{ sides: 8 }]);
    expect(parseDice('1d6+1d4')).toEqual([{ sides: 6 }, { sides: 4 }]);
    expect(() => parseDice('6')).toThrow(/bad --dice/);
    expect(() => parseDice('0d6')).toThrow();
  });
});

describe('replay and metrics', () => {
  const config = defaultSharedConfig({ players: 3, maxRounds: 30 });

  it('(seed, actions) replays a shared game exactly', () => {
    let seen = { corner: false, toll: false, buyout: false };
    for (let seed = 1; seed <= 40; seed++) {
      const rec = playGame(seed, ['random', 'greedy', 'scorer'].map(botByName), config);
      const again = replay(seed, config, rec.actions);
      expect(again.events).toEqual(rec.events);
      expect(again.state.winner).toBe(rec.winner);
      expect(JSON.stringify(again.state)).toBe(JSON.stringify(replay(seed, config, rec.actions).state));
      seen = {
        corner: seen.corner || rec.events.some((e) => e.t === 'corner'),
        toll: seen.toll || rec.events.some((e) => e.t === 'toll'),
        buyout: seen.buyout || rec.events.some((e) => e.t === 'bought' && e.displaced != null),
      };
    }
    expect(seen).toEqual({ corner: true, toll: true, buyout: true });
  });

  it('adds the shared metrics in shared mode only', () => {
    const shared = batch({ games: 20, lineup: ['random', 'greedy', 'scorer'], config: { boardMode: 'shared' } }).metrics;
    expect(Object.keys(shared.firesByClass!).sort()).toEqual(['civic', 'landmark', 'private', 'public', 'toll']);
    expect(shared.cornerIncomePerGame).toBeGreaterThan(0);
    expect(shared.tollsPerGame).toBeGreaterThan(0);
    expect(shared.tollCoinsPerGame).toBeGreaterThan(0);
    expect(shared.tollCoinsPerGame!).toBeLessThanOrEqual(shared.tollsPerGame! * 3 + 1e-9);
    const loops = batch({ games: 5 }).metrics;
    expect('firesByClass' in loops || 'tollsPerGame' in loops || 'cornerIncomePerGame' in loops).toBe(false);
  });

  it('batch --board shared uses the shared config; dice and side length override', () => {
    const r = batch({ games: 2, lineup: ['random', 'random'], config: { boardMode: 'shared', sideLength: 6, startDice: parseDice('2d6') } });
    expect(r.metrics.players).toBe(2);
    expect(r.metrics.games).toBe(2);
  });
});

describe('bots in shared mode', () => {
  const modes: [GameConfig['endMode'], number][] = [['turnCap', 12], ['vpRace', 12], ['lapRace', 3], [VP_POOL_MODE, 25], [LANDMARK_RACE_MODE, 2]];

  for (const players of [2, 3, 4]) {
    it(`random bots finish 10 games with ${players} players in every end mode`, () => {
      for (const [endMode, endValue] of modes) {
        const config = defaultSharedConfig({ players, endMode, endValue, maxRounds: 40 });
        for (let seed = 1; seed <= 10; seed++) {
          const rec = playGame(seed, Array.from({ length: players }, () => botByName('random')), config);
          const last = rec.events[rec.events.length - 1]!;
          expect(last.t, `${endMode} ${seed}`).toBe('gameEnded');
          expect(rec.rounds).toBeLessThanOrEqual(40);
        }
      }
    });
  }

  it('every existing bot completes 3 games', () => {
    for (const name of Object.keys(BOTS).filter((n) => n !== 'random')) {
      const config = defaultSharedConfig({ players: 3, maxRounds: 15 });
      for (let seed = 1; seed <= 3; seed++) {
        const rec = playGame(seed, [name, 'random', 'greedy'].map(botByName), config);
        expect(rec.events[rec.events.length - 1]!.t, `${name} ${seed}`).toBe('gameEnded');
      }
    }
  });

  it('choose and decide agree and only return legal actions', () => {
    for (const name of Object.keys(BOTS)) {
      const bot = botByName(name);
      let state = createGame(defaultSharedConfig({ players: 3, maxRounds: 10 }), 5);
      const driver = new Rng(9);
      let checked = 0;
      for (let i = 0; i < 80 && state.phase !== 'ended'; i++) {
        const legal = legalActions(state);
        const a = bot.choose(state, legal, new Rng(i));
        const d = bot.decide(state, legal, new Rng(i));
        expect(actionKey(d.action), `${name} step ${i}`).toBe(actionKey(a));
        expect(legal.some((x) => actionKey(x) === actionKey(a))).toBe(true);
        expect(d.candidates.length).toBeGreaterThan(0);
        for (const c of d.candidates) expect(c.why).not.toMatch(/undefined|NaN/);
        checked++;
        state = step(state, driver.pick(legal) as Action).state;
      }
      expect(checked).toBeGreaterThan(20);
    }
  });

  it('loops mode still works with the same bots', () => {
    const rec = playGame(3, ['greedy', 'scorer'].map(botByName), defaultConfig({ players: 2 }));
    expect(rec.events[rec.events.length - 1]!.t).toBe('gameEnded');
  });
});
