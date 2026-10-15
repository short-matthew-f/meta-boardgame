import { describe, expect, it } from 'vitest';
import { BOTS, botByName } from '../bots/index.ts';
import { randomBot } from '../bots/random.ts';
import { defaultConfig } from '../tiles/index.ts';
import { actionKey, createGame, legalActions, step } from '../engine/engine.ts';
import { Rng } from '../engine/rng.ts';
import { playGame } from '../sim/runner.ts';

const HEURISTICS = ['random', 'greedy', 'greedy-random', 'scorer', 'aggressor', 'turtle', 'expander'];

describe('heuristic bots', () => {
  for (const name of HEURISTICS) {
    it(`${name} only returns legal actions over 100 seeded games`, () => {
      const bot = botByName(name);
      const config = defaultConfig({ players: 3 });
      for (let seed = 1; seed <= 100; seed++) {
        let s = createGame(config, seed);
        const rng = new Rng(seed);
        let steps = 0;
        while (s.phase !== 'ended' && steps++ < 5000) {
          const legal = legalActions(s);
          const a = bot.choose(s, legal, rng);
          expect(legal.map(actionKey)).toContain(actionKey(a));
          s = step(s, a).state;
        }
        expect(s.phase).toBe('ended');
      }
    });
  }

  function meanFinal(botName: string, key: 'coins' | 'vp', games: number): number {
    const bot = botByName(botName);
    let total = 0;
    for (let seed = 1; seed <= games; seed++) {
      const seat = seed % 2; // alternate seats
      const lineup = seat === 0 ? [bot, randomBot] : [randomBot, bot];
      const rec = playGame(seed, lineup, defaultConfig({ players: 2 }));
      const standings = rec.events.filter((e) => e.t === 'roundEnded').at(-1)!;
      if (standings.t === 'roundEnded') total += standings.standings[seat]![key];
    }
    return total / games;
  }

  it('greedy ends with more coins than random on average over 200 games', () => {
    expect(meanFinal('greedy', 'coins', 200)).toBeGreaterThan(meanFinal('random', 'coins', 200));
  });

  it('scorer ends with more VP than random on average over 200 games', () => {
    expect(meanFinal('scorer', 'vp', 200)).toBeGreaterThan(meanFinal('random', 'vp', 200));
  });

  it('registry knows every archetype', () => {
    expect(Object.keys(BOTS).sort()).toEqual([...HEURISTICS, 'lookahead'].sort());
    expect(() => botByName('nope')).toThrow(/unknown bot/);
  });
});
