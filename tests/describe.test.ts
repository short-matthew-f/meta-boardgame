import { describe, expect, it } from 'vitest';
import { describeAction, describeEffects, describeEvent, describeMod, describeTile } from '../engine/describe.ts';
import { createGame } from '../engine/engine.ts';
import type { Effect, Event, GameState } from '../engine/types.ts';
import { defaultConfig, STARTER_MODS, STARTER_TILES } from '../tiles/index.ts';

const BAD = /undefined|\[object|NaN|null/;

function shopState(): GameState {
  const s = createGame(defaultConfig({ players: 3 }), 1);
  s.phase = 'shop';
  s.shop = ['shrine', 'expansion', 'expansion-plus', 'market'];
  s.players[0]!.board[2] = 'market';
  return s;
}

describe('describeAction', () => {
  const s = shopState();
  it('roll-phase prompts', () => {
    expect(describeAction(s, { type: 'roll' })).toBe('Roll');
    expect(describeAction(s, { type: 'reroll' })).toBe('Reroll');
    expect(describeAction(s, { type: 'keepRoll' })).toBe('Keep roll');
    expect(describeAction(s, { type: 'chooseTarget', player: 1 })).toBe('Target Player 2');
  });
  it('buying a tile, with and without a replacement', () => {
    expect(describeAction(s, { type: 'buyTile', shopIndex: 0, slot: 3 })).toBe('Buy Shrine (3c) → slot 3');
    expect(describeAction(s, { type: 'buyTile', shopIndex: 0, slot: 2 })).toBe('Buy Shrine (3c) → slot 2, replacing Market');
  });
  it('expansions, mods, sales and pass', () => {
    expect(describeAction(s, { type: 'buyExpansion', shopIndex: 1, afterSlot: 2 })).toBe('Buy Expansion (4c) → after slot 2');
    expect(describeAction(s, { type: 'buyExpansion', shopIndex: 2, afterSlot: 0 })).toBe('Buy Expansion+ (7c) → after slot 0');
    expect(describeAction(s, { type: 'buyMod', modId: 'fog' })).toBe('Buy Fog (5c)');
    expect(describeAction(s, { type: 'sellTile', slot: 2 })).toBe('Sell Market from slot 2 for 1c');
    expect(describeAction(s, { type: 'pass' })).toBe('Pass');
  });
  it('describes the active player, not seat 0', () => {
    const t = shopState();
    t.activePlayer = 1;
    t.players[1]!.board[4] = 'monument';
    expect(describeAction(t, { type: 'buyTile', shopIndex: 0, slot: 4 })).toBe('Buy Shrine (3c) → slot 4, replacing Monument');
    expect(describeAction(t, { type: 'sellTile', slot: 4 })).toBe('Sell Monument from slot 4 for 3c');
  });
});

describe('describeEvent', () => {
  it('keeps the CLI output format', () => {
    const events: [Event, string][] = [
      [{ t: 'rolled', player: 0, dice: [3, 4], total: 7, round: 1 }, 'P1 rolls [3,4] = 7'],
      [{ t: 'moved', player: 1, from: 6, to: 1, passedStart: true }, '  P2 moves 6 -> 1 (passes Start)'],
      [{ t: 'resource', player: 2, res: 'vp', delta: -1, source: 'tax-collector' }, '    P3 -1 vp (tax-collector)'],
      [{ t: 'attacked', attacker: 0, target: 1, tile: 'bandit-camp', cancelled: true }, '  P1 attacks P2 with bandit-camp — cancelled by shield'],
      [{ t: 'bought', player: 0, item: 'shrine', cost: 3, slot: 4 }, '  P1 buys shrine for 3 at slot 4'],
      [{ t: 'bought', player: 0, item: 'fog', cost: 5 }, '  P1 buys fog for 5'],
      [{ t: 'roundEnded', round: 2, standings: [{ player: 0, vp: 3, coins: 4 }, { player: 1, vp: 1, coins: 0 }] }, '-- round 2: P1 3vp/4c  P2 1vp/0c'],
      [{ t: 'gameEnded', reason: 'turnCap', winner: 2, rounds: 15 }, '== game over (turnCap) after 15 rounds: P3 wins'],
    ];
    for (const [e, text] of events) expect(describeEvent(e)).toBe(text);
  });
});

describe('describeEffects', () => {
  const d = (...e: Effect[]) => describeEffects(e);
  it('resources', () => {
    expect(d({ op: 'gain', res: 'coins', amount: 2 })).toBe('gain 2 coins');
    expect(d({ op: 'gain', res: 'coins', amount: 1 })).toBe('gain 1 coin');
    expect(d({ op: 'gain', res: 'vp', amount: { adjacentWithTag: 'score', per: 1 } })).toBe('gain 1 VP per adjacent score tile');
    expect(d({ op: 'gain', res: 'coins', amount: { ownedWithTag: 'income', per: 1 } })).toBe('gain 1 coin per owned income tile');
    expect(d({ op: 'gain', res: 'vp', amount: { laps: true, per: 0.5 } })).toBe('gain 1 VP per 2 laps');
    expect(d({ op: 'steal', res: 'coins', amount: 2 })).toBe('steal 2 coins from target');
    expect(d({ op: 'steal', res: 'vp', amount: 1 })).toBe('steal 1 VP from target');
    expect(d({ op: 'lose', res: 'coins', amount: 2, who: 'target' })).toBe('target loses 2 coins');
    expect(d({ op: 'lose', res: 'vp', amount: 1, who: 'self' })).toBe('lose 1 VP');
  });
  it('movement', () => {
    expect(d({ op: 'move', by: -3, who: 'target' })).toBe('move target −3');
    expect(d({ op: 'move', by: 2, who: 'self' })).toBe('move self +2');
    expect(d({ op: 'teleport', to: 'start', who: 'self' })).toBe('teleport self to Start');
    expect(d({ op: 'teleport', to: 'random', who: 'others' })).toBe('teleport others to a random slot');
    expect(d({ op: 'rollAgain' })).toBe('roll again');
  });
  it('conditions', () => {
    expect(d({ op: 'if', cond: { adjacentWithTag: 'combo', min: 2 }, then: [{ op: 'gain', res: 'vp', amount: 3 }] })).toBe('if 2+ adjacent combo tiles: gain 3 VP');
    expect(d({ op: 'if', cond: { dieTotal: '>=', value: 8 }, then: [{ op: 'gain', res: 'coins', amount: 2 }], else: [{ op: 'gain', res: 'coins', amount: 1 }] }))
      .toBe('if roll total ≥ 8: gain 2 coins, otherwise gain 1 coin');
  });
  it('defence, locks and shields', () => {
    expect(d({ op: 'reflect', fraction: 0.5 })).toBe('reflect 50% of coin loss to attacker');
    expect(d({ op: 'lockTile', who: 'target', rounds: 2 })).toBe('lock a random target tile for 2 rounds');
    expect(d({ op: 'setFlag', flag: 'shielded', value: 1, who: 'self', rounds: 1 })).toBe('shield for 1 round');
    expect(d({ op: 'setFlag', flag: 'cursed', value: 2, who: 'target', rounds: 3 })).toBe('set cursed to 2 on target for 3 rounds');
  });
  it('dice', () => {
    expect(d({ op: 'addDie', sides: 4 })).toBe('add a d4');
    expect(d({ op: 'setDice', who: 'others', sides: 4, rounds: 1 })).toBe('others roll d4 for 1 round');
    expect(d({ op: 'setDice', who: 'self', sides: 8, rounds: 1 })).toBe('roll d8 for 1 round');
    expect(d({ op: 'replaceDie', from: 6, to: 8 })).toBe('replace d6 with d8');
  });
  it('joins several effects with "; " and handles an empty list', () => {
    expect(d({ op: 'gain', res: 'coins', amount: 1 }, { op: 'rollAgain' })).toBe('gain 1 coin; roll again');
    expect(describeEffects([])).toBe('no effect');
  });
  it('reads "target" as the attacker inside onTargeted', () => {
    expect(describeEffects([{ op: 'lose', res: 'coins', amount: 2, who: 'target' }], { trigger: 'onTargeted' })).toBe('attacker loses 2 coins');
  });
});

describe('describeTile', () => {
  const byId = (id: string) => STARTER_TILES.find((t) => t.id === id)!;
  it('formats cost, tags and trigger', () => {
    expect(describeTile(byId('shrine'))).toBe('Shrine (3c, score): on land, gain 1 VP');
    expect(describeTile(byId('tollbooth'))).toBe('Tollbooth (6c, income): on pass, gain 1 coin');
    expect(describeTile(byId('bank'))).toBe('Bank (7c, income): on lap, gain 1 coin per owned income tile');
    expect(describeTile(byId('bandit-camp'))).toBe('Bandit Camp (4c, attack): on land, steal 3 coins from target');
    expect(describeTile(byId('wall'))).toBe('Wall (4c, defense): when targeted, reflect 50% of coin loss to attacker');
    expect(describeTile(byId('moat'))).toBe('Moat (5c, defense): when targeted, attacker loses 2 coins');
    expect(describeTile(byId('watchtower'))).toBe('Watchtower (6c, defense): on lap, shield for 1 round');
    expect(describeTile(byId('guildhall'))).toBe('Guildhall (8c, combo): on land, if 2+ adjacent combo tiles: gain 3 VP');
  });
  it('describes expansions by the slot they add', () => {
    expect(describeTile(byId('expansion'))).toBe('Expansion (4c): adds an empty slot after a chosen slot');
    expect(describeTile(byId('expansion-plus'), STARTER_TILES)).toBe('Expansion+ (7c): adds a Market slot after a chosen slot');
    expect(describeTile(byId('expansion-plus'))).toBe('Expansion+ (7c): adds a Market slot after a chosen slot');
  });
  it('separates several triggers', () => {
    const both = { ...byId('shrine'), onLap: [{ op: 'gain', res: 'coins', amount: 1 }] } as typeof STARTER_TILES[number];
    expect(describeTile(both)).toBe('Shrine (3c, score): on land, gain 1 VP | on lap, gain 1 coin');
  });
  it('every starter tile has a clean, non-empty description', () => {
    expect(STARTER_TILES.length).toBe(23);
    for (const t of STARTER_TILES) {
      const text = describeTile(t, STARTER_TILES);
      expect(text.length).toBeGreaterThan(t.name.length + 6);
      expect(text).toContain(t.name);
      expect(text).toContain(`${t.cost}c`);
      expect(text).not.toMatch(BAD);
      expect(text).not.toContain('no effect');
    }
  });
});

describe('describeMod', () => {
  const byId = (id: string) => STARTER_MODS.find((m) => m.id === id)!;
  it('formats every starter mod', () => {
    expect(describeMod(byId('fog'))).toBe('Fog (5c, round): others roll d4 for 1 round');
    expect(describeMod(byId('haste'))).toBe('Haste (4c, round): roll d8 for 1 round');
    expect(describeMod(byId('second-die'))).toBe('Second die (8c, persistent): add a d4');
    expect(describeMod(byId('heavy-die'))).toBe('Heavy die (10c, persistent): replace d6 with d8');
    expect(describeMod(byId('reroll'))).toBe('Reroll token (3c, consumable): after rolling, spend it to reroll once');
    for (const m of STARTER_MODS) expect(describeMod(m)).not.toMatch(BAD);
  });
});
