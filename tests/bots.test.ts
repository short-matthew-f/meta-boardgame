import { describe, expect, it } from 'vitest';
import { BOTS, botByName } from '../bots/index.ts';
import { randomBot } from '../bots/random.ts';
import { defaultConfig } from '../tiles/index.ts';
import { actionKey, createGame, legalActions, step } from '../engine/engine.ts';
import type { Action, GameState } from '../engine/types.ts';
import { Rng } from '../engine/rng.ts';
import { playGame } from '../sim/runner.ts';
import { shortLabel } from '../bots/explain.ts';

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

// ---------------------------------------------------------------------------
// Explanations: decide() must agree with choose() and describe what it weighed.

type Position = { state: GameState; legal: Action[]; seed: number };

/** Positions from games played by a mixed lineup: every prompt, plus every 5th ordinary step. */
function samplePositions(max: number): Position[] {
  const lineup = ['random', 'aggressor', 'greedy', 'scorer', 'random', 'turtle', 'expander'].map(botByName);
  const out: Position[] = [];
  for (let seed = 1; seed <= 40 && out.length < max; seed++) {
    let s = createGame(defaultConfig({ players: 3 }), seed);
    const driver = new Rng(seed);
    let i = 0;
    while (s.phase !== 'ended' && i < 2000) {
      const legal = legalActions(s);
      const prompt = legal[0]!.type === 'chooseTarget' || legal[0]!.type === 'reroll';
      if ((prompt || i % 5 === 0) && out.length < max) out.push({ state: s, legal, seed: seed * 10_000 + i });
      s = step(s, lineup[(seed + i) % lineup.length]!.choose(s, legal, driver)).state;
      i++;
    }
  }
  return out;
}

describe('bot explanations', () => {
  const positions = samplePositions(150);

  it('sampled positions cover shop turns, target prompts and reroll prompts', () => {
    expect(positions.length).toBeGreaterThanOrEqual(100);
    const kinds = new Set(positions.map((p) => p.legal[0]!.type));
    expect(kinds.has('roll')).toBe(true);
    expect(kinds.has('chooseTarget')).toBe(true);
    expect(kinds.has('reroll')).toBe(true);
    expect(positions.filter((p) => p.state.phase === 'shop').length).toBeGreaterThanOrEqual(50);
  });

  for (const name of Object.keys(BOTS).sort()) {
    it(`${name}: decide returns the action choose returns, with the same Rng use, over 100+ positions`, () => {
      const bot = botByName(name);
      // lookahead is slow; 60 positions still includes prompts because they are always sampled
      const subset = name === 'lookahead' ? positions.filter((_, i) => i % 2 === 0 || positions[i]!.legal[0]!.type !== 'roll').slice(0, 70) : positions;
      expect(subset.length).toBeGreaterThanOrEqual(50);
      for (const { state, legal, seed } of subset) {
        const a = new Rng(seed);
        const b = new Rng(seed);
        const chosen = bot.choose(state, legal, a);
        const d = bot.decide(state, legal, b);
        expect(actionKey(d.action)).toBe(actionKey(chosen));
        // identical Rng consumption: the next draw agrees
        expect(b.next()).toBe(a.next());
      }
    }, 120_000);

    it(`${name}: candidates are sorted, capped at 6, start with the chosen action and explain themselves`, () => {
      const bot = botByName(name);
      const subset = positions.filter((_, i) => i % 3 === 0).slice(0, 40);
      for (const { state, legal, seed } of subset) {
        const d = bot.decide(state, legal, new Rng(seed));
        const keys = legal.map(actionKey);
        expect(d.candidates.length).toBeGreaterThanOrEqual(1);
        expect(d.candidates.length).toBeLessThanOrEqual(6);
        expect(actionKey(d.candidates[0]!.action)).toBe(actionKey(d.action));
        expect(keys).toContain(actionKey(d.action));
        for (let i = 0; i < d.candidates.length; i++) {
          const c = d.candidates[i]!;
          expect(keys).toContain(actionKey(c.action));
          expect(Number.isFinite(c.score)).toBe(true);
          expect(c.why.length).toBeGreaterThan(0);
          expect(c.why).not.toMatch(/undefined|NaN|\[object|Infinity/);
          if (i > 0) expect(c.score).toBeLessThanOrEqual(d.candidates[i - 1]!.score);
        }
        const keysSeen = d.candidates.map((c) => actionKey(c.action));
        expect(new Set(keysSeen).size).toBe(keysSeen.length);
        if (d.note != null) expect(d.note).not.toMatch(/undefined|NaN|\[object/);
      }
    }, 120_000);
  }

  /** First sampled position matching `pred`; any bot can be asked about any position. */
  function find(pred: (p: Position) => boolean): Position {
    const p = positions.find(pred);
    if (!p) throw new Error('no sampled position matches');
    return p;
  }

  it('random lists up to 6 options with a note naming the legal count', () => {
    const p = find((x) => x.legal.length > 6);
    const d = botByName('random').decide(p.state, p.legal, new Rng(p.seed));
    expect(d.candidates).toHaveLength(6);
    expect(d.note).toBe(`picked uniformly at random from ${p.legal.length} legal actions`);
    expect(d.candidates[0]!.why).toBe(`${d.candidates[0]!.why.split(':')[0]}: equal chance, 1 in ${p.legal.length}`);
  });

  it('a lone legal action is reported as such', () => {
    const p = find((x) => x.legal.length === 1 && x.legal[0]!.type === 'roll');
    const d = botByName('scorer').decide(p.state, p.legal, new Rng(1));
    expect(d.candidates).toEqual([{ action: { type: 'roll' }, score: 0, why: 'Roll: only legal action' }]);
  });

  it('profile bots show the scoring components for a purchase', () => {
    // Hand-built position: scorer with a Shrine and a Market offered, empty board.
    const config = defaultConfig({ players: 2 });
    const s = createGame(config, 1);
    s.phase = 'shop';
    s.shopActionsLeft = 1;
    s.shop = ['shrine', 'wall'];
    s.players[0]!.coins = 5;
    const legal = legalActions(s);
    const d = botByName('scorer').decide(s, legal, new Rng(1));
    expect(d.action.type).toBe('buyTile');
    expect(d.candidates[0]!.why).toMatch(/^Shrine → slot \d: score \+3\.0, VP per coin \+1\.3, cost −0\.45$/);
    expect(d.note).toBe('scorer: round 1 < switch round 999, using early weights (score 3, combo 1, income 0.5, expansion −2, attack −2, defense −2, mover 1); 3 mod purchases skipped to keep a 6-coin reserve');
    // Wall is offered and shown with its negative tag weight
    expect(d.candidates.some((c) => c.why.startsWith('Wall → slot') && c.why.includes('defense −2.0, cost −0.60'))).toBe(true);
    // Pass is the baseline
    const pass = d.candidates.find((c) => c.action.type === 'pass');
    expect(pass?.why).toBe('Pass: baseline 0');
  });

  it('greedy reports the weight set in force and the landing-chance term', () => {
    const config = defaultConfig({ players: 2 });
    const s = createGame(config, 2);
    s.phase = 'shop';
    s.shopActionsLeft = 1;
    s.round = 9;
    s.shop = ['shrine'];
    s.players[0]!.coins = 3;
    const d = botByName('greedy').decide(s, legalActions(s), new Rng(1));
    expect(d.note).toBe('greedy: round 9 ≥ switch round 8, using late weights (score 3, combo 1.5, income 0.5, expansion −2, attack −2, defense −2, mover 1); 1 mod purchase skipped to keep a 6-coin reserve');
    expect(d.action.type).toBe('buyTile');
    expect(d.candidates[0]!.why).toMatch(/^Shrine → slot \d: score \+3\.0, lands \d+% in 3 rolls \+\d\.\d, cost −0\.45$/);
  });

  it('pass wins with its own explanation when nothing scores above its weight', () => {
    const config = defaultConfig({ players: 2 });
    const s = createGame(config, 3);
    s.phase = 'shop';
    s.shopActionsLeft = 1;
    s.shop = ['bandit-camp'];
    s.players[0]!.coins = 4;
    const d = botByName('scorer').decide(s, legalActions(s), new Rng(1));
    expect(d.action).toEqual({ type: 'pass' });
    expect(d.candidates[0]).toEqual({ action: { type: 'pass' }, score: 0, why: 'Pass: nothing scores above 0' });
  });

  it('mods and sales read as weights', () => {
    const config = defaultConfig({ players: 2 });
    const s = createGame(config, 4);
    s.phase = 'shop';
    s.shopActionsLeft = 1;
    s.shop = [];
    s.players[0]!.coins = 12;
    s.players[0]!.board[2] = 'market';
    const d = botByName('aggressor').decide(s, legalActions(s), new Rng(1));
    const fog = d.candidates.find((c) => c.action.type === 'buyMod' && c.action.modId === 'fog');
    expect(fog?.why).toBe('Fog: mod weight 2.0, cost −0.75');
    const sell = d.candidates.find((c) => c.action.type === 'sellTile');
    expect(sell?.why).toBe('Sell Market from slot 2: −5');
    expect(d.action.type).toBe('buyMod'); // the highest-weighted mod beats Pass and Sell
  });

  it('replacing an owned tile shows the penalty', () => {
    const config = defaultConfig({ players: 2 });
    const s = createGame(config, 4);
    s.phase = 'shop';
    s.shopActionsLeft = 1;
    s.shop = ['shrine'];
    s.players[0]!.coins = 5;
    for (let slot = 2; slot < s.players[0]!.board.length; slot++) s.players[0]!.board[slot] = 'market';
    const d = botByName('scorer').decide(s, legalActions(s), new Rng(1));
    expect(d.candidates[0]!.why).toBe('Shrine → slot 1: score +3.0, VP per coin +1.3, cost −0.45');
    expect(d.candidates[1]!.why).toBe('Shrine → slot 2: score +3.0, VP per coin +1.3, cost −0.45, replacing Market −1.20');
  });

  it('target prompts name the stat that decided', () => {
    const config = defaultConfig({ players: 3 });
    const s = createGame(config, 5);
    s.players[0]!.vp = 2;
    s.players[1]!.vp = 7;
    s.players[2]!.vp = 4;
    s.players[1]!.coins = 1;
    s.players[2]!.coins = 9;
    s.activePlayer = 0;
    s.phase = 'roll';
    s.pending = { queue: [], choice: { kind: 'chooseTarget', player: 0, slot: 1, tile: 'bandit-camp', trigger: 'onLand' }, rollAgain: false, lastTotal: 0, chain: 0 };
    const legal = legalActions(s);
    const vp = botByName('scorer').decide(s, legal, new Rng(1));
    expect(vp.action).toEqual({ type: 'chooseTarget', player: 1 });
    expect(vp.candidates.map((c) => c.why)).toEqual(['Player 2: VP leader (7 VP)', 'Player 3: 4 VP, behind the leader']);
    const coins = botByName('greedy').decide(s, legal, new Rng(1));
    expect(coins.action).toEqual({ type: 'chooseTarget', player: 2 });
    expect(coins.candidates[0]!.why).toBe('Player 3: coin leader (9 coins)');
  });

  it('reroll prompts compare the total with the threshold', () => {
    const config = defaultConfig({ players: 2 });
    const s = createGame(config, 6);
    s.phase = 'roll';
    s.pending = { queue: [], choice: { kind: 'reroll', player: 0, dice: [4] }, rollAgain: false, lastTotal: 4, chain: 0 };
    const keep = botByName('greedy').decide(s, legalActions(s), new Rng(1));
    expect(keep.action).toEqual({ type: 'keepRoll' });
    expect(keep.candidates[0]!.why).toBe('Keep 4: at or above reroll threshold 3');
    s.pending.lastTotal = 2;
    const again = botByName('greedy').decide(s, legalActions(s), new Rng(1));
    expect(again.action).toEqual({ type: 'reroll' });
    expect(again.candidates[0]!.why).toBe('Reroll: 2 is below reroll threshold 3');
  });
});

describe('decide() candidate labels', () => {
  it('lists each option once when the shop holds two copies of a tile', () => {
    for (const bot of Object.values(BOTS)) {
      const s = createGame(defaultConfig({ players: 2 }), 7);
      s.phase = 'shop';
      s.shopActionsLeft = 1;
      s.shop = ['bandit-camp', 'bandit-camp', 'market', 'market', 'shrine', 'shrine'];
      s.players[0]!.coins = 20;
      const d = bot.decide(s, legalActions(s), new Rng(3));
      const labels = d.candidates.map((c) => shortLabel(s, c.action));
      expect(new Set(labels).size, `${bot.name}: ${labels.join(' | ')}`).toBe(labels.length);
      expect(d.candidates[0]!.action).toEqual(d.action);
    }
  });
});
