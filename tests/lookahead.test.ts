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

describe('lookahead explanations', () => {
  it('decide matches choose and reports expected differential per candidate', () => {
    const config = defaultConfig({ players: 2 });
    let checked = 0;
    for (let seed = 1; seed <= 4; seed++) {
      let s = createGame(config, seed);
      const driver = new Rng(seed);
      let i = 0;
      while (s.phase !== 'ended') {
        const legal = legalActions(s);
        if (i % 3 === 0 || legal[0]!.type !== 'roll' && legal[0]!.type !== 'buyTile') {
          const a = new Rng(seed * 100 + i);
          const b = new Rng(seed * 100 + i);
          const chosen = lookaheadBot.choose(s, legal, a);
          const d = lookaheadBot.decide(s, legal, b);
          expect(actionKey(d.action)).toBe(actionKey(chosen));
          expect(b.next()).toBe(a.next());
          expect(actionKey(d.candidates[0]!.action)).toBe(actionKey(d.action));
          expect(d.candidates.length).toBeLessThanOrEqual(6);
          for (let k = 1; k < d.candidates.length; k++) expect(d.candidates[k]!.score).toBeLessThanOrEqual(d.candidates[k - 1]!.score);
          if (legal.length > 1) {
            for (const c of d.candidates) expect(c.why).toMatch(/EV [+−]\d+\.\d\d vs leader|ends the game/);
            expect(d.note).toMatch(/^one-ply expected value/);
          }
          checked++;
        }
        s = step(s, lookaheadBot.choose(s, legal, driver)).state;
        i++;
      }
    }
    expect(checked).toBeGreaterThan(30);
  });

  it('shop candidates name the tile and slot, and pruning is stated in the note', () => {
    const config = defaultConfig({ players: 2 });
    const s = createGame(config, 11);
    s.phase = 'shop';
    s.shopActionsLeft = 1;
    s.shop = ['shrine', 'monument'];
    s.players[0]!.coins = 6;
    const d = lookaheadBot.decide(s, legalActions(s), new Rng(1));
    const buy = d.candidates.find((c) => c.action.type === 'buyTile')!;
    expect(buy.why).toMatch(/^(Shrine|Monument) → slot [1-7]: EV [+−]\d+\.\d\d vs leader after next roll$/);
    expect(d.note).toMatch(/shop options pruned to the best slot per tile \(\d+ of \d+ evaluated\)/);
    const pass = d.candidates.find((c) => c.action.type === 'pass')!;
    expect(pass.why).toMatch(/^Pass: EV [+−]\d+\.\d\d vs leader after next roll$/);
  });

  it('reroll prompts compare keeping with the averaged reroll', () => {
    const config = defaultConfig({ players: 2 });
    const s = createGame(config, 3);
    s.players[0]!.mods.push('reroll');
    const rolled = step(s, { type: 'roll' }).state;
    const d = lookaheadBot.decide(rolled, legalActions(rolled), new Rng(1));
    expect(d.candidates).toHaveLength(2);
    expect(d.candidates.map((c) => c.why.split(':')[0]).sort()).toEqual(['Keep roll', 'Reroll']);
    expect(actionKey(d.action)).toBe(actionKey(lookaheadBot.choose(rolled, legalActions(rolled), new Rng(1))));
  });
});
