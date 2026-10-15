// Experimental rule variants (all off by default): fireOnPass, landBonus,
// tileEndVp, endMode vpPool, and the superlinear tile set.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BASE_CONFIG, VP_POOL_MODE, createGame, legalActions, makeConfig, rankPlayers, previewRoll, step } from '../engine/engine.ts';
import type { Action, Effect, Event, GameConfig, GameState, TileDef } from '../engine/types.ts';
import { STARTER_TILES, SUPERLINEAR_TILES } from '../tiles/index.ts';
import { validateTiles } from '../tiles/schema.ts';
import { botByName } from '../bots/index.ts';
import { batch } from '../sim/batch.ts';
import { playGame, replay } from '../sim/runner.ts';

function tile(id: string, onLand: Effect[], extra: Partial<TileDef> = {}): TileDef {
  return { id, name: id, cost: 1, copies: 1, tags: ['income'], onLand, ...extra };
}

/** 3 players with `dice` d1s (so a roll moves exactly `dice` slots), empty shop, no mods. */
function setup(tiles: TileDef[], place: (s: GameState) => void, cfg: Partial<GameConfig> = {}, dice = 3): GameState {
  const config = makeConfig({ players: 3, tileSet: tiles, modSet: [], boardSize: 8, ...cfg });
  const s = createGame(config, 1);
  s.shop = [];
  s.bag = [];
  s.players.forEach((p) => (p.dice = Array.from({ length: dice }, () => ({ sides: 1 }))));
  place(s);
  return s;
}

const fired = (events: Event[], tileId: string, trigger?: string) =>
  events.filter((e) => e.t === 'tileFired' && e.tile === tileId && (trigger == null || e.trigger === trigger)).length;

const coins = (n: number): Effect[] => [{ op: 'gain', res: 'coins', amount: n }];

describe('defaults', () => {
  it('leave every variant off', () => {
    expect(BASE_CONFIG.fireOnPass).toBe(false);
    expect(BASE_CONFIG.landBonus).toBe(1);
    expect(BASE_CONFIG.tileEndVp).toBe(0);
  });

  it('batch output is byte-identical to the snapshot taken before the variants existed', () => {
    const { elapsedMs: _ignored, ...report } = batch({ games: 50 });
    const snapshot = readFileSync(new URL('./fixtures/batch-default-50.json', import.meta.url), 'utf8');
    expect(JSON.stringify(report, null, 2)).toBe(snapshot.trimEnd());
  });
});

describe('fireOnPass and landBonus', () => {
  const tiles = [tile('a', coins(1)), tile('b', [{ op: 'gain', res: 'vp', amount: 1 }]), tile('c', coins(10))];
  const place = (s: GameState) => {
    s.players[0]!.board[1] = 'a';
    s.players[0]!.board[2] = 'b';
    s.players[0]!.board[3] = 'c';
  };

  it('does nothing extra when off', () => {
    const r = step(setup(tiles, place), { type: 'roll' });
    expect(fired(r.events, 'a')).toBe(0);
    expect(fired(r.events, 'b')).toBe(0);
    expect(fired(r.events, 'c', 'onLand')).toBe(1);
    expect(r.state.players[0]!.coins).toBe(5 + 10);
  });

  it('fires each passed onLand tile once as onPass and the landed one landBonus times', () => {
    const r = step(setup(tiles, place, { fireOnPass: true, landBonus: 2 }), { type: 'roll' });
    expect(fired(r.events, 'a', 'onPass')).toBe(1);
    expect(fired(r.events, 'b', 'onPass')).toBe(1);
    expect(fired(r.events, 'a', 'onLand') + fired(r.events, 'b', 'onLand')).toBe(0);
    expect(fired(r.events, 'c', 'onLand')).toBe(2);
    expect(fired(r.events, 'c', 'onPass')).toBe(0);
    const p = r.state.players[0]!;
    expect(p.coins).toBe(5 + 1 + 20);
    expect(p.vp).toBe(1);
    expect(r.state.phase).toBe('shop');
  });

  it('fireOnPass alone keeps landing at one firing', () => {
    const r = step(setup(tiles, place, { fireOnPass: true }), { type: 'roll' });
    expect(fired(r.events, 'c', 'onLand')).toBe(1);
    expect(r.state.players[0]!.coins).toBe(5 + 1 + 10);
  });

  it('landBonus works without fireOnPass', () => {
    const r = step(setup(tiles, place, { landBonus: 3 }), { type: 'roll' });
    expect(fired(r.events, 'a')).toBe(0);
    expect(fired(r.events, 'c', 'onLand')).toBe(3);
    expect(r.state.players[0]!.coins).toBe(5 + 30);
  });

  it('fires in path order, passed tiles before the landing', () => {
    const r = step(setup(tiles, place, { fireOnPass: true }), { type: 'roll' });
    const order = r.events.filter((e) => e.t === 'tileFired').map((e) => (e.t === 'tileFired' ? e.tile : ''));
    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('a tile passed twice in one long move fires twice', () => {
    // 6 slots on a 4-slot loop visits 1, 2, 3, 0, 1, 2: slot 1 is passed twice, slot 2 passed once then landed on
    const s = setup(tiles, place, { fireOnPass: true, boardSize: 4 }, 6);
    const r = step(s, { type: 'roll' });
    expect(fired(r.events, 'a', 'onPass')).toBe(2);
    expect(fired(r.events, 'b', 'onPass')).toBe(1);
    expect(fired(r.events, 'b', 'onLand')).toBe(1);
    expect(fired(r.events, 'c', 'onPass')).toBe(1);
    expect(r.state.players[0]!.position).toBe(2);
  });

  it('mover tiles never fire on pass, and fire once on landing whatever landBonus is', () => {
    const spring = tile('spring', [{ op: 'move', by: 1, who: 'self' }], { tags: ['mover'] });
    const mk = (dice: number) =>
      setup([spring, ...tiles], (s) => { s.players[0]!.board[1] = 'spring'; s.players[0]!.board[2] = 'a'; }, { fireOnPass: true, landBonus: 2 }, dice);
    const passed = step(mk(2), { type: 'roll' }); // passes slot 1, lands on slot 2
    expect(fired(passed.events, 'spring')).toBe(0);
    expect(passed.state.players[0]!.position).toBe(2);
    expect(fired(passed.events, 'a', 'onLand')).toBe(2);
    const landed = step(mk(1), { type: 'roll' }); // lands on the Springboard: one move of 1, not two
    expect(fired(landed.events, 'spring', 'onLand')).toBe(1);
    expect(landed.state.players[0]!.position).toBe(2);
  });

  it('a tile with its own onPass keeps it and does not double up', () => {
    const toll = tile('toll', coins(10), { onPass: coins(1) });
    const s = setup([toll, ...tiles], (s) => { s.players[0]!.board[1] = 'toll'; s.players[0]!.board[2] = 'a'; }, { fireOnPass: true }, 2);
    const r = step(s, { type: 'roll' });
    expect(fired(r.events, 'toll', 'onPass')).toBe(1);
    expect(r.state.players[0]!.coins).toBe(5 + 1 + 1); // toll onPass +1, a onLand +1
  });

  it('a locked tile does not fire on pass', () => {
    const s = setup(tiles, place, { fireOnPass: true });
    s.roundModifiers.push({ kind: 'lock', player: 0, slot: 1, until: { round: 5, player: 0 } });
    const r = step(s, { type: 'roll' });
    expect(fired(r.events, 'a')).toBe(0);
    expect(fired(r.events, 'b', 'onPass')).toBe(1);
  });

  it('a passed attack tile asks for a target and runs its onLand effects', () => {
    const bandit = tile('bandit', [{ op: 'steal', res: 'coins', amount: 3 }], { tags: ['attack'] });
    const s = setup([bandit, ...tiles], (s) => { s.players[0]!.board[1] = 'bandit'; s.players[0]!.board[2] = 'a'; }, { fireOnPass: true }, 2);
    const r1 = step(s, { type: 'roll' });
    expect(r1.state.pending?.choice).toMatchObject({ kind: 'chooseTarget', tile: 'bandit', trigger: 'onPass' });
    expect(legalActions(r1.state).map((a) => a.type)).toEqual(['chooseTarget', 'chooseTarget']);
    const r2 = step(r1.state, { type: 'chooseTarget', player: 1 });
    expect(fired(r2.events, 'bandit', 'onPass')).toBe(1);
    expect(r2.state.players[1]!.coins).toBe(2);
    expect(r2.state.players[0]!.coins).toBe(5 + 3 + 1); // stolen 3, then the landing on a
    expect(r2.state.phase).toBe('shop');
  });

  it('a landed attack tile with landBonus 2 prompts twice', () => {
    const bandit = tile('bandit', [{ op: 'steal', res: 'coins', amount: 1 }], { tags: ['attack'] });
    const s = setup([bandit], (s) => { s.players[0]!.board[1] = 'bandit'; }, { landBonus: 2 }, 1);
    const r1 = step(s, { type: 'roll' });
    expect(r1.state.pending?.choice).not.toBeNull();
    const r2 = step(r1.state, { type: 'chooseTarget', player: 1 });
    expect(r2.state.pending?.choice).not.toBeNull();
    const r3 = step(r2.state, { type: 'chooseTarget', player: 2 });
    expect(r3.state.pending?.choice).toBeNull();
    expect(r3.state.players[0]!.coins).toBe(7);
  });

  it("previewRoll (Lookahead's what-if) picks fireOnPass up", () => {
    const s = setup(tiles, place, { fireOnPass: true });
    const after = previewRoll(s, 0, [1, 1, 1], (_st, legal) => legal[0]!);
    expect(after.players[0]!.coins).toBe(5 + 1 + 10);
  });
});

describe('tileEndVp', () => {
  const inert = tile('inert', [], { cost: 10 });
  const small = tile('small', [], { cost: 3 });

  /** Play roll/pass until the game ends, passing in the shop. */
  function finish(s: GameState): { state: GameState; events: Event[] } {
    const events: Event[] = [];
    let state = s;
    while (state.phase !== 'ended') {
      const legal = legalActions(state);
      const a: Action = legal.find((x) => x.type === 'roll') ?? legal.find((x) => x.type === 'pass')!;
      const r = step(state, a);
      events.push(...r.events);
      state = r.state;
    }
    return { state, events };
  }

  it('is applied once per player at game end, before the final roundEnded, and decides the ranking', () => {
    const mk = (tileEndVp: number) => setup([inert, small], (s) => {
      s.players[0]!.vp = 3;
      s.players[1]!.board[5] = 'inert';
      s.players[1]!.board[6] = 'small';
      s.players[2]!.board[2] = 'small';
    }, { endMode: 'turnCap', endValue: 2, tileEndVp }, 1);
    const off = finish(mk(0));
    expect(off.state.winner).toBe(0);
    expect(off.events.some((e) => e.t === 'resource' && e.source === 'endgame')).toBe(false);

    const on = finish(mk(0.5));
    const endgame = on.events.filter((e) => e.t === 'resource' && e.source === 'endgame');
    expect(endgame).toEqual([
      { t: 'resource', player: 1, res: 'vp', delta: 6, source: 'endgame' }, // floor(13 × 0.5)
      { t: 'resource', player: 2, res: 'vp', delta: 1, source: 'endgame' }, // floor(3 × 0.5)
    ]);
    expect(on.state.players.map((p) => p.vp)).toEqual([3, 6, 1]);
    expect(on.state.winner).toBe(1);
    expect(rankPlayers(on.state)).toEqual([1, 0, 2]);

    const rounds = on.events.filter((e) => e.t === 'roundEnded');
    expect(rounds).toHaveLength(2);
    const last = rounds[1]!;
    expect(last.t === 'roundEnded' && last.standings.map((x) => x.vp)).toEqual([3, 6, 1]);
    expect(rounds[0]!.t === 'roundEnded' && rounds[0]!.standings.map((x) => x.vp)).toEqual([3, 0, 0]); // not applied in round 1
    // ordering: endgame resources, then roundEnded, then gameEnded
    const idx = (f: (e: Event) => boolean) => on.events.findIndex(f);
    expect(idx((e) => e.t === 'resource' && e.source === 'endgame')).toBeLessThan(idx((e) => e.t === 'roundEnded' && e.round === 2));
    expect(idx((e) => e.t === 'roundEnded' && e.round === 2)).toBeLessThan(idx((e) => e.t === 'gameEnded'));
  });

  it('on real games only changes final VP, by exactly floor(owned cost × X) per player', () => {
    const base = makeConfig({ players: 4, tileSet: STARTER_TILES, modSet: [], endMode: 'turnCap', endValue: 8 });
    const rec = playGame(7, ['greedy', 'scorer', 'aggressor', 'turtle'].map(botByName), base);
    const x = { ...base, tileEndVp: 0.34 };
    const a = replay(7, base, rec.actions).state;
    const b = replay(7, x, rec.actions).state;
    let any = false;
    for (let i = 0; i < 4; i++) {
      const cost = b.players[i]!.board.reduce((n, id) => n + (id ? STARTER_TILES.find((t) => t.id === id)!.cost : 0), 0);
      expect(b.players[i]!.vp - a.players[i]!.vp).toBe(Math.floor(cost * 0.34 + 1e-9));
      if (cost > 0) any = true;
    }
    expect(any).toBe(true);
    const events = replay(7, x, rec.actions).events;
    const finalRound = [...events].reverse().find((e) => e.t === 'roundEnded');
    expect(finalRound?.t === 'roundEnded' && finalRound.standings.map((s) => s.vp)).toEqual(b.players.map((p) => p.vp));
    expect(events.filter((e) => e.t === 'resource' && e.source === 'endgame').length).toBeLessThanOrEqual(4);
  });
});

describe('endMode vpPool', () => {
  const shrine = tile('shrine', [{ op: 'gain', res: 'vp', amount: 1 }], { tags: ['score'] });
  const place = (s: GameState) => { for (const p of s.players) { p.board[1] = 'shrine'; p.board[2] = 'shrine'; p.board[3] = 'shrine'; } };
  const run = (cfg: Partial<GameConfig>) => {
    let state = setup([shrine], place, { endMode: VP_POOL_MODE, ...cfg }, 1);
    const totals: number[] = []; // total VP at the end of each round
    const phases: string[] = [];
    while (state.phase !== 'ended') {
      const legal = legalActions(state);
      const a: Action = legal.find((x) => x.type === 'roll') ?? legal.find((x) => x.type === 'pass')!;
      const r = step(state, a);
      state = r.state;
      if (r.events.some((e) => e.t === 'roundEnded')) totals.push(state.players.reduce((n, p) => n + p.vp, 0));
      phases.push(state.phase);
    }
    return { state, totals };
  };

  it('ends at the end of the round in which the pool is reached, and not before', () => {
    // 3 players, each lands on a shrine every turn for rounds 1-3: pool total 3, 6, 9. Pool of 8 is hit by the second player of round 3.
    const { state, totals } = run({ endValue: 8 });
    expect(state.round).toBe(3);
    expect(totals).toEqual([3, 6, 9]); // the third player still played round 3
    expect(state.winner).not.toBeNull();
  });

  it('a pool reached exactly on the last turn of a round ends that round', () => {
    const { state, totals } = run({ endValue: 6 });
    expect(state.round).toBe(2);
    expect(totals).toEqual([3, 6]);
  });

  it('records vpPool as the end reason', () => {
    let state = setup([shrine], place, { endMode: VP_POOL_MODE, endValue: 3 }, 1);
    let last: Event[] = [];
    while (state.phase !== 'ended') {
      const legal = legalActions(state);
      const r = step(state, legal.find((x) => x.type === 'roll') ?? legal.find((x) => x.type === 'pass')!);
      state = r.state;
      last = r.events;
    }
    expect(last.find((e) => e.t === 'gameEnded')).toMatchObject({ reason: 'vpPool', rounds: 1 });
  });

  it('does not count tileEndVp toward the pool', () => {
    const { state, totals } = run({ endValue: 8, tileEndVp: 10 });
    expect(state.round).toBe(3);
    expect(totals[0]).toBe(3);
    expect(totals[1]).toBe(6);
    expect(totals[2]).toBe(9 + 3 * 30); // 3 shrines × cost 1 × 10 = 30 per player, only at the end
  });

  it('falls back to maxRounds when the pool is unreachable', () => {
    const { state } = run({ endValue: 10_000, maxRounds: 4 });
    expect(state.round).toBe(4);
  });
});

describe('superlinear tile set', () => {
  it('passes the schema', () => {
    expect(validateTiles(SUPERLINEAR_TILES)).toEqual([]);
  });

  it('differs from the starter set only in Cathedral (5 VP) and Mine (4 coins)', () => {
    expect(SUPERLINEAR_TILES.map((t) => t.id)).toEqual(STARTER_TILES.map((t) => t.id));
    const changed = SUPERLINEAR_TILES.filter((t, i) => JSON.stringify(t) !== JSON.stringify(STARTER_TILES[i]));
    expect(changed.map((t) => t.id).sort()).toEqual(['cathedral', 'mine']);
    const get = (id: string) => SUPERLINEAR_TILES.find((t) => t.id === id)!;
    expect(get('cathedral').cost).toBe(10);
    expect(get('cathedral').onLand).toEqual([{ op: 'gain', res: 'vp', amount: 5 }]);
    expect(get('mine').cost).toBe(5);
    expect(get('mine').onLand).toEqual([{ op: 'gain', res: 'coins', amount: 4 }]);
    expect(get('monument').onLand).toEqual([{ op: 'gain', res: 'vp', amount: 2 }]);
    expect(get('shrine').onLand).toEqual([{ op: 'gain', res: 'vp', amount: 1 }]);
  });
});

