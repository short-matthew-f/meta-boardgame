// Shared-board bots: traffic maps, class-aware placement, the two shared archetypes, Lookahead pruning.
import { describe, expect, it } from 'vitest';
import { BOTS, botByName } from '../bots/index.ts';
import { actionKey, createGame, legalActions, step } from '../engine/engine.ts';
import { landingMass } from '../engine/board.ts';
import { Rng } from '../engine/rng.ts';
import { passMass, trafficMaps, vpLeader } from '../engine/traffic.ts';
import type { Action, DieSpec, GameState } from '../engine/types.ts';
import { defaultSharedConfig } from '../tiles/index.ts';
import { placementValue } from '../sim/batch.ts';
import { game, put } from './sharedHelpers.ts';

const d = (...sides: number[]): DieSpec[] => sides.map((s) => ({ sides: s }));
const sum = (m: Map<number, number>) => [...m.values()].reduce((a, b) => a + b, 0);

/** Brute force: enumerate every sequence of `rolls` totals; P(slot swept) and P(slot landed on) at least once. */
function brute(position: number, dice: DieSpec[], size: number, rolls: number) {
  let totals = [{ t: 0, p: 1 }];
  for (const die of dice) totals = totals.flatMap(({ t, p }) => Array.from({ length: die.sides }, (_, f) => ({ t: t + f + 1, p: p / die.sides })));
  const pass = new Array<number>(size).fill(0);
  const land = new Array<number>(size).fill(0);
  const walk = (pos: number, left: number, p: number, passed: Set<number>, landed: Set<number>) => {
    if (left === 0) {
      for (const s of passed) pass[s]! += p;
      for (const s of landed) land[s]! += p;
      return;
    }
    for (const { t, p: q } of totals) {
      const np = new Set(passed);
      const nl = new Set(landed);
      for (let i = 1; i <= t; i++) np.add((pos + i) % size);
      nl.add((pos + t) % size);
      walk((pos + t) % size, left - 1, p * q, np, nl);
    }
  };
  walk(position, rolls, 1, new Set(), new Set());
  return { pass, land };
}

describe('passMass', () => {
  it('a d1 sweeps exactly the next `rolls` slots, wrapping the loop', () => {
    const m = passMass(8, d(1), 10, 3);
    expect([...m.entries()].filter(([, p]) => p > 0).map(([s]) => s).sort((a, b) => a - b)).toEqual([0, 1, 9]);
    for (const s of [9, 0, 1]) expect(m.get(s)).toBeCloseTo(1, 12);
    expect(m.size).toBe(10);
    // one roll of a d1: only the next slot
    expect([...passMass(0, d(1), 10, 1).entries()].filter(([, p]) => p > 0)).toEqual([[1, 1]]);
  });

  it('sums to the expected distance travelled when the board is bigger than any trip', () => {
    // d6, 3 rolls: E[distance] = 10.5 and the longest trip is 18 < 40, so every slot swept is a different slot
    expect(sum(passMass(5, d(6), 40, 3))).toBeCloseTo(10.5, 10);
    expect(sum(passMass(0, d(6), 40, 1))).toBeCloseTo(3.5, 10);
    // landing: three rolls land on three distinct slots
    expect(sum(landingMass(5, d(6), 40, 3))).toBeCloseTo(3, 10);
  });

  it('matches enumeration of every roll sequence, including trips longer than the loop', () => {
    for (const [dice, size, rolls, pos] of [[d(6), 20, 3, 7], [d(6, 6), 20, 3, 15], [d(6, 6), 40, 3, 0], [d(8), 30, 2, 29]] as [DieSpec[], number, number, number][]) {
      const exact = brute(pos, dice, size, rolls);
      const pass = passMass(pos, dice, size, rolls);
      const land = landingMass(pos, dice, size, rolls);
      for (let s = 0; s < size; s++) {
        expect(pass.get(s)!, `pass ${dice.length}d${dice[0]!.sides} size ${size} slot ${s}`).toBeCloseTo(exact.pass[s]!, 10);
        expect(land.get(s)!, `land slot ${s}`).toBeCloseTo(exact.land[s]!, 10);
      }
    }
  });

  it('is never below the landing mass and never above 1', () => {
    for (const dice of [d(6), d(6, 6), d(4, 8)]) {
      const pass = passMass(3, dice, 40, 3);
      const land = landingMass(3, dice, 40, 3);
      for (let s = 0; s < 40; s++) {
        expect(pass.get(s)!).toBeGreaterThanOrEqual(land.get(s)! - 1e-12);
        expect(pass.get(s)!).toBeLessThanOrEqual(1 + 1e-12);
      }
    }
  });
});

describe('trafficMaps', () => {
  function scene(): GameState {
    const s = game({ players: 3 });
    s.players.forEach((p, i) => { p.dice = i === 2 ? d(6, 6) : d(6); });
    s.players[0]!.position = 4;
    s.players[1]!.position = 12;
    s.players[2]!.position = 25;
    s.players[1]!.vp = 2;
    s.players[2]!.vp = 5;
    return s;
  }

  it('splits own and opponent masses and names the VP leader', () => {
    const s = scene();
    expect(vpLeader(s, 0)).toBe(2);
    expect(vpLeader(s, 2)).toBe(1);
    const t = trafficMaps(s, 3);
    const size = 30;
    expect(t.leader).toBe(2);
    expect(t.ownPass).toHaveLength(size);
    const own = landingMass(4, d(6), size, 3);
    const p1 = landingMass(12, d(6), size, 3);
    const p2 = landingMass(25, d(6, 6), size, 3);
    const p1p = passMass(12, d(6), size, 3);
    const p2p = passMass(25, d(6, 6), size, 3);
    for (let slot = 0; slot < size; slot++) {
      expect(t.ownLand[slot]).toBeCloseTo(own.get(slot)!, 12);
      expect(t.oppLand[slot]).toBeCloseTo(p1.get(slot)! + p2.get(slot)!, 12);
      expect(t.oppPass[slot]).toBeCloseTo(p1p.get(slot)! + p2p.get(slot)!, 12);
      expect(t.leaderLand[slot]).toBeCloseTo(p2.get(slot)!, 12);
      expect(t.ownPass[slot]).toBeGreaterThanOrEqual(t.ownLand[slot]! - 1e-12);
    }
  });

  it('is relative to the active player and respects dice changes (Observatory rolls a d8)', () => {
    const s = scene();
    s.activePlayer = 1;
    expect(trafficMaps(s).me).toBe(1);
    expect(trafficMaps(s).leader).toBe(2);
    s.activePlayer = 0;
    const before = trafficMaps(s).ownLand.slice();
    s.players[0]!.landmarks.push('observatory'); // dieSides 8
    const after = trafficMaps(s).ownLand;
    expect(after).not.toEqual(before);
    expect(after[4 + 8]).toBeGreaterThan(before[4 + 8]!);
  });
});

// ---------------------------------------------------------------------------
// Every registered bot in shared mode

const ALL = Object.keys(BOTS).sort();

describe('shared-mode bots', () => {
  it('ten bots are registered, including landlord and builder', () => {
    expect(ALL).toHaveLength(10);
    expect(ALL).toContain('landlord');
    expect(ALL).toContain('builder');
  });

  for (const name of ALL) {
    it(`${name} finishes 20 seeded shared games at 2, 3 and 4 players and only plays legal actions`, () => {
      const bot = botByName(name);
      for (const players of [2, 3, 4]) {
        for (let seed = 1; seed <= 20; seed++) {
          let s = createGame(defaultSharedConfig({ players }), seed);
          const rng = new Rng(seed);
          let steps = 0;
          while (s.phase !== 'ended' && steps++ < 5000) {
            const legal = legalActions(s);
            const a = bot.choose(s, legal, rng);
            expect(legal.map(actionKey), `${name} ${players}p seed ${seed}`).toContain(actionKey(a));
            s = step(s, a).state;
          }
          expect(s.phase).toBe('ended');
        }
      }
    }, 120_000);
  }
});

// ---------------------------------------------------------------------------
// decide() agrees with choose() and explains itself

type Position = { state: GameState; legal: Action[]; seed: number };

/** Shop-phase positions (plus every 7th roll step) from shared games played by a mixed lineup. */
function samplePositions(max: number): Position[] {
  const lineup = ['random', 'greedy', 'landlord', 'builder', 'scorer', 'aggressor', 'turtle', 'expander'].map(botByName);
  const out: Position[] = [];
  for (let seed = 1; seed <= 30 && out.length < max; seed++) {
    const players = 2 + (seed % 3);
    let s = createGame(defaultSharedConfig({ players }), seed);
    const driver = new Rng(seed);
    let i = 0;
    while (s.phase !== 'ended' && i < 3000) {
      const legal = legalActions(s);
      if ((s.phase === 'shop' && legal.length > 1 && i % 3 === 0) || i % 7 === 0) {
        if (out.length < max) out.push({ state: s, legal, seed: seed * 10_000 + i });
      }
      s = step(s, lineup[(seed + i) % lineup.length]!.choose(s, legal, driver)).state;
      i++;
    }
  }
  return out;
}

describe('shared-mode explanations', () => {
  const positions = samplePositions(120);

  it('samples cover big shop phases, landmark purchases and buyouts', () => {
    expect(positions.filter((p) => p.state.phase === 'shop' && p.legal.length > 50).length).toBeGreaterThanOrEqual(20);
    expect(positions.some((p) => p.legal.some((a) => a.type === 'buyLandmark'))).toBe(true);
    expect(positions.some((p) => p.legal.some((a) => a.type === 'buyTile' && p.state.shared!.slots[a.slot]!.owner !== null && p.state.shared!.slots[a.slot]!.owner !== p.state.activePlayer))).toBe(true);
  });

  for (const name of ALL) {
    it(`${name}: decide returns the action choose returns with the same Rng use`, () => {
      const bot = botByName(name);
      const subset = name === 'lookahead' ? positions.filter((_, i) => i % 3 === 0) : positions;
      for (const { state, legal, seed } of subset) {
        const a = new Rng(seed);
        const b = new Rng(seed);
        const chosen = bot.choose(state, legal, a);
        const dec = bot.decide(state, legal, b);
        expect(actionKey(dec.action)).toBe(actionKey(chosen));
        expect(b.next()).toBe(a.next());
      }
    }, 120_000);
  }

  for (const name of ['greedy', 'scorer', 'aggressor', 'turtle', 'expander', 'landlord', 'builder', 'lookahead']) {
    it(`${name}: candidates are sorted, capped at 6, distinct tiles first, with readable text`, () => {
      const bot = botByName(name);
      for (const { state, legal, seed } of positions.filter((_, i) => i % 2 === 0).slice(0, 40)) {
        const dec = bot.decide(state, legal, new Rng(seed));
        const keys = legal.map(actionKey);
        expect(dec.candidates.length).toBeGreaterThanOrEqual(1);
        expect(dec.candidates.length).toBeLessThanOrEqual(6);
        expect(actionKey(dec.candidates[0]!.action)).toBe(actionKey(dec.action));
        for (let i = 0; i < dec.candidates.length; i++) {
          const c = dec.candidates[i]!;
          expect(keys).toContain(actionKey(c.action));
          expect(Number.isFinite(c.score)).toBe(true);
          expect(c.why).not.toMatch(/undefined|NaN|\[object|Infinity/);
          if (i > 0) expect(c.score).toBeLessThanOrEqual(dec.candidates[i - 1]!.score);
        }
        // at most 3 slots for one tile are ever in the running
        const perTile = new Map<string, number>();
        for (const c of dec.candidates) {
          if (c.action.type === 'buyTile') {
            const k = state.shop[c.action.shopIndex]!;
            perTile.set(k, (perTile.get(k) ?? 0) + 1);
          }
        }
        for (const n of perTile.values()) expect(n).toBeLessThanOrEqual(3);
      }
    }, 120_000);
  }
});

// ---------------------------------------------------------------------------
// Scripted positions

/** Two players, shop phase, empty board, player 1 to act. */
function shopScene(shop: string[], coins: number, round = 1): GameState {
  const s = game({ players: 2 });
  s.phase = 'shop';
  s.shopActionsLeft = 1;
  s.pending = null;
  s.shop = shop;
  s.round = round;
  s.players[0]!.coins = coins;
  s.players[0]!.dice = d(6);
  s.players[1]!.dice = d(6);
  return s;
}

describe('class-aware placement', () => {
  it('a civic goes where traffic is and explains the traffic term', () => {
    const s = shopScene(['market'], 3);
    s.players[0]!.position = 0; // own token at the corner of side 0; opponent at slot 10
    const dec = botByName('greedy').decide(s, legalActions(s), new Rng(1));
    expect(dec.action.type).toBe('buyTile');
    expect(dec.candidates[0]!.why).toMatch(/^Market → slot \d+: civic \+3\.0, traffic \d\.\d\d \+\d\.\d, cost −0\.45$/);
    const t = trafficMaps(s);
    const slot = (dec.action as Extract<Action, { type: 'buyTile' }>).slot;
    const traffic = (x: number) => t.ownPass[x]! + t.oppPass[x]!;
    for (let x = 1; x < 20; x++) if (x % 10 !== 0) expect(traffic(slot)).toBeGreaterThanOrEqual(traffic(x) - 1e-9);
  });

  it('a toll goes to the leader\'s landing spots, a private to the owner\'s own path, a public where the owner lands first', () => {
    const t = (id: string, bot: string, setup?: (s: GameState) => void) => {
      const s = shopScene([id], 6);
      setup?.(s);
      const dec = botByName(bot).decide(s, legalActions(s), new Rng(1));
      return { dec, s, tr: trafficMaps(s), slot: (dec.action as Extract<Action, { type: 'buyTile' }>).slot };
    };
    const toll = t('tollbooth', 'landlord');
    expect(toll.dec.action.type).toBe('buyTile');
    const score = (tr: ReturnType<typeof trafficMaps>, x: number) => tr.oppLand[x]! + 3 * tr.leaderLand[x]! - (Math.floor(x / 10) === 0 ? 0.25 : 0);
    for (let x = 1; x < 20; x++) if (x % 10 !== 0) expect(score(toll.tr, toll.slot)).toBeGreaterThanOrEqual(score(toll.tr, x) - 1e-9);
    expect(toll.dec.candidates[0]!.why).toMatch(/toll \+2\.0, class bonus \+0\.5, opponents land \d\.\d\d, leader lands \d\.\d\d \+\d\.\d/);

    const priv = t('mine', 'greedy');
    for (let x = 1; x < 20; x++) if (x % 10 !== 0) {
      const v = (y: number) => 2 * priv.tr.ownPass[y]! + (Math.floor(y / 10) === 0 ? 0.5 : 0);
      expect(v(priv.slot)).toBeGreaterThanOrEqual(v(x) - 1e-9);
    }
    expect(priv.dec.candidates[0]!.why).toMatch(/private \+3\.0, own path \d\.\d\d \+\d\.\d, own side \+0\.5, cost −0\.60/);

    const pub = t('well', 'greedy');
    for (let x = 1; x < 20; x++) if (x % 10 !== 0) {
      const v = (y: number) => pub.tr.ownLand[y]! - 0.5 * pub.tr.oppLand[y]!;
      expect(v(pub.slot)).toBeGreaterThanOrEqual(v(x) - 1e-9);
    }
    expect(pub.dec.candidates[0]!.why).toMatch(/public \+3\.0, you land \d\.\d\d, others \d\.\d\d \+\d\.\d/);
  });

  it('a buyout is priced by the displaced tile and checked against the VP lead', () => {
    // every buildable slot holds Player 2's Shrine, so each Bridge placement is a buyout
    const s = shopScene(['bridge'], 6);
    for (let x = 1; x < 20; x++) if (x % 10 !== 0) put(s, x, 'shrine', 1);
    s.players[1]!.vp = 4;
    s.players[0]!.vp = 1;
    const dec = botByName('landlord').decide(s, legalActions(s), new Rng(1));
    expect(dec.action.type).toBe('buyTile');
    const why = dec.candidates[0]!.why;
    expect(why).toMatch(/^Bridge → slot \d+ \(over Player 2's Shrine\): toll \+2\.0, class bonus \+0\.5, opponents land/);
    expect(why).toContain('buyout −0.3'); // Shrine costs 3 × landlord's 0.1
    expect(why).toContain('leads you by 3 VP +1.5'); // 3 VP lead × landlord's 0.5
    // a default profile pays more for the same buyout and checks the lead less
    s.shop = ['well'];
    const greedy = botByName('greedy').decide(s, legalActions(s), new Rng(1));
    expect(greedy.candidates[0]!.why).toContain('buyout −0.9');
    expect(greedy.candidates[0]!.why).toContain('leads you by 3 VP +0.3');
  });

  it('over its own tile it pays the replace penalty instead', () => {
    const s = shopScene(['market'], 3);
    for (let x = 1; x < 20; x++) if (x % 10 !== 0) put(s, x, 'mine', 0);
    const dec = botByName('greedy').decide(s, legalActions(s), new Rng(1));
    expect(dec.candidates[0]!.why).toMatch(/\(replacing Mine\).*replace −1\.60$/);
  });

  it('random placement (the control) keeps the buyout cost but scores no traffic', () => {
    const s = shopScene(['market'], 3);
    const dec = botByName('greedy-random').decide(s, legalActions(s), new Rng(1));
    expect(dec.candidates[0]!.why).toMatch(/^Market → slot \d+: civic \+3\.0, cost −0\.45$/);
  });

  it('a profile bot lists at most 3 slots for one tile', () => {
    const s = shopScene(['market', 'shrine'], 6);
    const dec = botByName('scorer').decide(s, legalActions(s), new Rng(1));
    const slotsPerTile = new Map<string, number>();
    for (const c of dec.candidates) if (c.action.type === 'buyTile') slotsPerTile.set(`${c.action.shopIndex}`, (slotsPerTile.get(`${c.action.shopIndex}`) ?? 0) + 1);
    expect(Math.max(...slotsPerTile.values())).toBeLessThanOrEqual(3);
    expect(dec.note).toMatch(/each tile keeps its best 3 slots \(\d+ slot options not offered\)/);
    // the pick is the best slot of the best tile: no pruned slot beats it
    const t = trafficMaps(s);
    const pick = dec.action as Extract<Action, { type: 'buyTile' }>;
    expect(t.oppPass[pick.slot]! + t.ownPass[pick.slot]!).toBeGreaterThan(0);
  });
});

describe('landmarks and the two shared archetypes', () => {
  it('buyLandmark reads: landmark weight, what it pays, own path, cost', () => {
    const s = shopScene([], 12, 3);
    const dec = botByName('greedy').decide(s, legalActions(s), new Rng(1));
    const lm = dec.candidates.find((c) => c.action.type === 'buyLandmark');
    expect(lm).toBeDefined();
    expect(lm!.why).toMatch(/^[A-Za-z ]+ landmark → slot \d+: landmark \+1\.5, pays when you pass \+\d\.\d, own path \d\.\d\d \+\d\.\d, cost −\d\.\d\d$/);
    // greedy has no better use for 12 coins, but passing scores 0 and a landmark scores above it
    expect(dec.action.type).toBe('buyLandmark');
  });

  it('the landmark weight and the landmark itself rank the menu: Cathedral beats the dearer-but-empty ones', () => {
    const s = shopScene([], 14, 3);
    const dec = botByName('greedy').decide(s, legalActions(s), new Rng(1));
    expect(dec.action).toMatchObject({ type: 'buyLandmark', landmarkId: 'cathedral' });
  });

  it('builder saves: it passes rather than spend below the cheapest landmark, and buys the landmark once it can', () => {
    const poor = shopScene(['market', 'shrine'], 8, 6);
    expect(botByName('builder').choose(poor, legalActions(poor), new Rng(1))).toEqual({ type: 'pass' });
    const dec = botByName('builder').decide(poor, legalActions(poor), new Rng(1));
    expect(dec.note).toContain('saving for a landmark (10 coins)');
    expect(dec.candidates.some((c) => c.why.includes('saving for a landmark'))).toBe(true);
    const rich = shopScene(['market', 'shrine'], 10, 6);
    expect(botByName('builder').choose(rich, legalActions(rich), new Rng(1)).type).toBe('buyLandmark');
    // before round 5 it builds civics instead
    const early = shopScene(['market', 'shrine'], 8, 2);
    expect(botByName('builder').choose(early, legalActions(early), new Rng(1)).type).toBe('buyTile');
  });

  it('builder keeps a larger mod reserve once it owns a landmark', () => {
    const base = (landmarks: string[]) => {
      const s = shopScene([], 12, 3);
      s.players[0]!.landmarks = landmarks;
      return botByName('builder').decide(s, legalActions(s), new Rng(1));
    };
    expect(base([]).note).toContain('skipped to keep a 6-coin reserve');
    expect(base(['cathedral']).note).toContain('skipped to keep a 14-coin reserve');
  });

  it('landlord takes tolls first and values VP more after round 6; turtle never buys a toll; aggressor does', () => {
    const early = shopScene(['tollbooth', 'shrine'], 6, 1);
    expect(botByName('landlord').decide(early, legalActions(early), new Rng(1)).candidates[0]!.why).toMatch(/^Tollbooth/);
    const shrine = (round: number) => {
      const s = shopScene(['shrine'], 6, round);
      return botByName('landlord').decide(s, legalActions(s), new Rng(1)).candidates[0]!.score;
    };
    expect(shrine(8)).toBeGreaterThan(shrine(1) + 1); // VP weight 1.5 -> 3 after round 6
    const only = shopScene(['tollbooth'], 6, 1);
    expect(botByName('turtle').choose(only, legalActions(only), new Rng(1))).toEqual({ type: 'pass' });
    expect(botByName('aggressor').choose(only, legalActions(only), new Rng(1)).type).toBe('buyTile');
    // the toll's score is much higher for the landlord than for a bot that tags tolls as attacks to avoid
    const score = (bot: string) => botByName(bot).decide(early, legalActions(early), new Rng(1)).candidates.find((c) => c.why.startsWith('Tollbooth'))!.score;
    expect(score('landlord')).toBeGreaterThan(score('greedy') + 4);
  });

  it('landlord builds over the leader readily: the lead check outweighs the buyout price', () => {
    const s = shopScene(['market'], 3, 1);
    for (let x = 1; x < 20; x++) if (x % 10 !== 0) put(s, x, 'shrine', 1);
    s.players[1]!.vp = 6;
    const score = (bot: string) => botByName(bot).decide(s, legalActions(s), new Rng(1)).candidates[0]!;
    expect(score('landlord').why).toContain('leads you by 6 VP +3.0');
    expect(score('landlord').score).toBeGreaterThan(score('scorer').score);
  });
});

describe('Lookahead in shared mode', () => {
  it('searches at most one slot per tile, 2 buyouts, 2 landmarks, plus mods, sells and pass', () => {
    // a mid-game position with buyouts, landmarks and sells available
    const s = shopScene(['market', 'shrine', 'tollbooth'], 30, 8);
    for (let x = 11; x < 20; x++) put(s, x, x % 2 ? 'shrine' : 'well', 1);
    put(s, 3, 'market', 0);
    put(s, 4, 'mine', 0);
    const legal = legalActions(s);
    expect(legal.length).toBeGreaterThan(80);
    const dec = botByName('lookahead').decide(s, legal, new Rng(1));
    expect(dec.note).toMatch(/pruned to the best slot per tile \(\d+ of \d+ evaluated\)/);
    const evaluated = Number(/\((\d+) of/.exec(dec.note!)![1]);
    const sells = legal.filter((a) => a.type === 'sellTile').length;
    const mods = legal.filter((a) => a.type === 'buyMod').length;
    expect(evaluated).toBeLessThanOrEqual(3 + 2 + 2 + sells + mods + 1);
    expect(evaluated).toBeGreaterThanOrEqual(3 + 1);
  });
});

// ---------------------------------------------------------------------------
// The placement test from the brief

describe('traffic placement', () => {
  it('greedy with traffic placement beats greedy with random placement over 300 shared games', () => {
    const r = placementValue({ games: 300 }, 'shared');
    expect(r.withPlacement).toBeGreaterThan(r.withoutPlacement);
  }, 120_000);
});
