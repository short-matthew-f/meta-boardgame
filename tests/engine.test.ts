import { describe, expect, it } from 'vitest';
import { actionKey, createGame, legalActions, makeConfig, step } from '../engine/engine.ts';
import type { Action, EndMode, GameState } from '../engine/types.ts';
import { Rng } from '../engine/rng.ts';
import { randomBot } from '../bots/random.ts';
import { playGame, replay } from '../sim/runner.ts';
import { STARTER_MODS } from '../tiles/index.ts';

const EMPTY = (over: Partial<Parameters<typeof makeConfig>[0]> = {}) => makeConfig({ tileSet: [], modSet: [], ...over });

describe('engine core (empty tile set)', () => {
  const modes: [EndMode, number][] = [['turnCap', 15], ['vpRace', 30], ['lapRace', 6]];

  for (const players of [2, 3, 4]) {
    for (const [endMode, endValue] of modes) {
      it(`terminates with ${players} random bots in ${endMode}`, () => {
        const config = EMPTY({ players, endMode, endValue, maxRounds: 40 });
        for (let seed = 1; seed <= 10; seed++) {
          const rec = playGame(seed, Array(players).fill(randomBot), config);
          const roundsBound = endMode === 'turnCap' ? endValue : endMode === 'lapRace' ? Math.min(config.maxRounds, endValue * config.boardSize) : config.maxRounds;
          // with no tiles and no mods a turn is exactly roll + pass
          expect(rec.actions.length).toBeLessThanOrEqual(roundsBound * players * 2);
          expect(rec.events.at(-1)!.t).toBe('gameEnded');
          const ended = rec.events.at(-1)! as Extract<(typeof rec.events)[number], { t: 'gameEnded' }>;
          if (endMode === 'turnCap') expect(ended.rounds).toBe(endValue);
          if (endMode === 'lapRace') expect(ended.reason).toBe('lapRace');
          if (endMode === 'vpRace') expect(ended.reason).toBe('maxRounds'); // no VP exists with no tiles
        }
      });
    }
  }

  it('lap race ends at the end of the round the Nth lap is completed', () => {
    const config = EMPTY({ players: 3, endMode: 'lapRace', endValue: 2 });
    const rec = playGame(7, Array(3).fill(randomBot), config);
    const lapEvents = rec.events.filter((e) => e.t === 'lap');
    const first = lapEvents.find((e) => e.t === 'lap' && e.laps >= 2)!;
    const idx = rec.events.indexOf(first);
    const roundOfLap = rec.events.slice(0, idx).filter((e) => e.t === 'roundEnded').length + 1;
    const ended = rec.events.at(-1)! as Extract<(typeof rec.events)[number], { t: 'gameEnded' }>;
    expect(ended.rounds).toBe(roundOfLap);
    // every player took the same number of turns
    const rolls = rec.events.filter((e) => e.t === 'rolled');
    const perPlayer = [0, 1, 2].map((p) => rolls.filter((e) => e.t === 'rolled' && e.player === p).length);
    expect(new Set(perPlayer).size).toBe(1);
  });

  it('replaying (seed, actions) reproduces identical events', () => {
    const config = makeConfig({ players: 4, modSet: STARTER_MODS });
    for (let seed = 1; seed <= 20; seed++) {
      const rec = playGame(seed, Array(4).fill(randomBot), config);
      const again = replay(seed, config, rec.actions);
      expect(again.events).toEqual(rec.events);
      expect(again.state.winner).toBe(rec.winner);
    }
  });

  it('every accepted action is in legalActions and every other action is rejected', () => {
    const config = makeConfig({ players: 3, modSet: STARTER_MODS });
    let state = createGame(config, 42);
    const rng = new Rng(1);
    const universe: Action[] = [
      { type: 'roll' }, { type: 'reroll' }, { type: 'keepRoll' }, { type: 'pass' },
      { type: 'chooseTarget', player: 0 }, { type: 'chooseTarget', player: 1 }, { type: 'chooseTarget', player: 2 },
      { type: 'buyTile', shopIndex: 0, slot: 1 }, { type: 'buyExpansion', shopIndex: 0, afterSlot: 0 },
      { type: 'buyMod', modId: 'reroll' }, { type: 'buyMod', modId: 'fog' }, { type: 'buyMod', modId: 'nope' },
      { type: 'sellTile', slot: 1 }, { type: 'sellTile', slot: 0 },
    ];
    let checked = 0;
    while (state.phase !== 'ended' && checked < 400) {
      const legal = legalActions(state);
      const legalKeys = new Set(legal.map(actionKey));
      for (const a of universe) {
        if (legalKeys.has(actionKey(a))) expect(() => step(state, a)).not.toThrow();
        else expect(() => step(state, a)).toThrow(/illegal action/);
        checked++;
      }
      state = step(state, rng.pick(legal)).state;
    }
    expect(checked).toBeGreaterThan(100);
  });

  it('step does not mutate its input', () => {
    const config = makeConfig({ players: 2, modSet: STARTER_MODS });
    const s0 = createGame(config, 3);
    const snapshot = JSON.stringify(s0);
    const s1 = step(s0, { type: 'roll' }).state;
    expect(JSON.stringify(s0)).toBe(snapshot);
    expect(s1).not.toBe(s0);
  });

  it('lap income is paid on passing and landing on Start', () => {
    const config = EMPTY({ players: 2, boardSize: 4 });
    let s: GameState = createGame(config, 1);
    s.players[0]!.position = 2;
    const r = step(s, { type: 'roll' });
    const rolled = r.events.find((e) => e.t === 'rolled')!;
    const total = rolled.t === 'rolled' ? rolled.total : 0;
    const lap = r.events.find((e) => e.t === 'lap');
    expect(!!lap).toBe(2 + total >= 4);
    if (lap) expect(r.state.players[0]!.coins).toBe(config.startCoins + config.lapIncome * Math.floor((2 + total) / 4));
  });

  it('round modifiers expire when their owner\'s next turn ends', () => {
    const config = makeConfig({ players: 3, modSet: STARTER_MODS, startCoins: 20 });
    let s = createGame(config, 5);
    s = step(s, { type: 'roll' }).state;
    s = step(s, { type: 'buyMod', modId: 'fog' }).state; // player 0 fogs others
    const fogged = () => s.roundModifiers.filter((m) => m.kind === 'dice').map((m) => m.player).sort();
    expect(fogged()).toEqual([1, 2]);
    // players 1 and 2 roll under fog (d4)
    for (const p of [1, 2]) {
      expect(s.activePlayer).toBe(p);
      const r = step(s, { type: 'roll' });
      const rolled = r.events.find((e) => e.t === 'rolled')!;
      if (rolled.t === 'rolled') expect(rolled.total).toBeLessThanOrEqual(4);
      s = step(r.state, { type: 'pass' }).state;
    }
    expect(s.round).toBe(2);
    expect(fogged()).toEqual([1, 2]); // still active until player 0's next turn ends
    s = step(s, { type: 'roll' }).state;
    s = step(s, { type: 'pass' }).state;
    expect(fogged()).toEqual([]);
  });

  it('winner is highest VP, then coins, then fewer tiles', () => {
    const config = EMPTY({ players: 3, endMode: 'turnCap', endValue: 1 });
    let s = createGame(config, 9);
    s.players[0]!.vp = 5; s.players[0]!.coins = 1;
    s.players[1]!.vp = 5; s.players[1]!.coins = 9;
    s.players[2]!.vp = 4; s.players[2]!.coins = 99;
    while (s.phase !== 'ended') s = step(s, legalActions(s)[0]!).state;
    expect(s.winner).toBe(1);
  });
});
