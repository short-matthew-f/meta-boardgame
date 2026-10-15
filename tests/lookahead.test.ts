import { describe, expect, it } from 'vitest';
import { batch } from '../sim/batch.ts';
import { lookaheadBot } from '../bots/lookahead.ts';
import { defaultConfig } from '../tiles/index.ts';
import { actionKey, createGame, legalActions, step } from '../engine/engine.ts';
import { Rng } from '../engine/rng.ts';

describe('lookahead bot', () => {
  it('only returns legal actions', () => {
    const config = defaultConfig({ players: 2 });
    for (let seed = 1; seed <= 5; seed++) {
      let s = createGame(config, seed);
      const rng = new Rng(seed);
      while (s.phase !== 'ended') {
        const legal = legalActions(s);
        const a = lookaheadBot.choose(s, legal, rng);
        expect(legal.map(actionKey)).toContain(actionKey(a));
        s = step(s, a).state;
      }
    }
  });

  it('beats random at least 60% of the time in a 2-player lineup over 500 games', () => {
    const r = batch({ games: 500, seedStart: 1, lineup: ['lookahead', 'random'] });
    expect(r.metrics.winRateByBot['lookahead']!.rate).toBeGreaterThanOrEqual(0.6);
  }, 120_000);
});
