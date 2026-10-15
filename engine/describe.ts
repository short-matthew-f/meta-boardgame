// Human-readable text for actions, events, tiles, mods and effects. Pure
// functions over engine types: no DOM, no I/O, so the sim CLI, the bot
// explanations and the web UI all say things the same way.
//
// Conventions: player numbers are 1-based in text (state indices are 0-based),
// slot numbers are the board index as the engine uses it (slot 0 is Start),
// negatives use U+2212 (−).
import type {
  Action, Amount, Cond, Effect, Event, GameConfig, GameState, LandmarkDef, ModDef, Passive, Resource, TileClass,
  TileDef, TileId, Trigger, Who,
} from './types.ts';
import { discountedCost, itemCost } from './sharedBoard.ts';

const MINUS = '−';

/** `+2`, `−3`, `0`. */
export function signed(n: number): string {
  if (n > 0) return `+${n}`;
  if (n < 0) return `${MINUS}${-n}`;
  return '0';
}

function titleCase(id: string): string {
  return id.split('-').map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w)).join(' ');
}

/** Display name of a tile id; falls back to a title-cased id for ids not in the set. */
export function tileName(config: Pick<GameConfig, 'tileSet'>, id: TileId): string {
  return config.tileSet.find((t) => t.id === id)?.name ?? titleCase(id);
}

/** Display name of a tile or (shared mode) landmark id; falls back to a title-cased id. */
export function itemName(config: Pick<GameConfig, 'tileSet'> & Partial<Pick<GameConfig, 'landmarkSet'>>, id: string): string {
  return config.tileSet.find((t) => t.id === id)?.name ?? config.landmarkSet?.find((l) => l.id === id)?.name ?? titleCase(id);
}

/** Display name of a mod id; falls back to a title-cased id. */
export function modName(config: Pick<GameConfig, 'modSet'>, id: string): string {
  return config.modSet.find((m) => m.id === id)?.name ?? titleCase(id);
}

const player = (i: number) => `Player ${i + 1}`;

// ---------------------------------------------------------------------------
// Actions

/** What an action does if the active player takes it now, e.g. `Buy Shrine (3c) → slot 3`. */
export function describeAction(state: GameState, action: Action): string {
  const cfg = state.config;
  switch (action.type) {
    case 'roll': return 'Roll';
    case 'reroll': return 'Reroll';
    case 'keepRoll': return 'Keep roll';
    case 'chooseTarget': return `Target ${player(action.player)}`;
    case 'buyTile': {
      const id = state.shop[action.shopIndex];
      const def = id != null ? cfg.tileSet.find((t) => t.id === id) : undefined;
      const name = id != null ? tileName(cfg, id) : 'tile';
      const price = def ? ` (${discountedCost(state, state.activePlayer, def.cost)}c)` : '';
      if (state.shared) return `Buy ${name}${price} → slot ${action.slot}${displacing(state, action.slot)}`;
      const old = state.players[state.activePlayer]?.board[action.slot];
      return `Buy ${name}${price} → slot ${action.slot}${old != null ? `, replacing ${tileName(cfg, old)}` : ''}`;
    }
    case 'buyLandmark': {
      const lm = cfg.landmarkSet.find((l) => l.id === action.landmarkId);
      return `Build ${itemName(cfg, action.landmarkId)} landmark${lm ? ` (${lm.cost}c)` : ''} → slot ${action.slot}${displacing(state, action.slot)}`;
    }
    case 'buyExpansion': {
      const id = state.shop[action.shopIndex];
      const def = id != null ? cfg.tileSet.find((t) => t.id === id) : undefined;
      const name = id != null ? tileName(cfg, id) : 'Expansion';
      return `Buy ${name}${def ? ` (${def.cost}c)` : ''} → after slot ${action.afterSlot}`;
    }
    case 'buyMod': {
      const def = cfg.modSet.find((m) => m.id === action.modId);
      return `Buy ${modName(cfg, action.modId)}${def ? ` (${def.cost}c)` : ''}`;
    }
    case 'sellTile': {
      const id = state.shared ? state.shared.slots[action.slot]?.tile : state.players[state.activePlayer]?.board[action.slot];
      if (id == null) return `Sell slot ${action.slot}`;
      const def = cfg.tileSet.find((t) => t.id === id);
      const refund = def ? Math.floor(def.cost * cfg.sellRefund) : 0;
      return `Sell ${tileName(cfg, id)} from slot ${action.slot} for ${refund}c`;
    }
    case 'pass': return 'Pass';
  }
}

/** Shared mode: what building on `slot` displaces (`, replacing X` for the player's own tile, `, buying out X from Player N`). */
function displacing(state: GameState, slot: number): string {
  const s = state.shared?.slots[slot];
  if (!s || s.tile == null) return '';
  const name = itemName(state.config, s.tile);
  if (s.owner === state.activePlayer) return `, replacing ${name}`;
  const refund = Math.floor(itemCost(state.config, s.tile) * state.config.buyoutRefund);
  return `, buying out ${name} from ${player(s.owner ?? 0)} (they get ${refund}c)`;
}

// ---------------------------------------------------------------------------
// Events (moved here from sim/cli.ts; output unchanged)

export function describeEvent(e: Event): string {
  switch (e.t) {
    case 'rolled': return `P${e.player + 1} rolls [${e.dice.join(',')}] = ${e.total}`;
    case 'moved': return `  P${e.player + 1} moves ${e.from} -> ${e.to}${e.passedStart ? ' (passes Start)' : ''}`;
    case 'lap': return `  P${e.player + 1} completes lap ${e.laps}${e.income !== 0 ? `, +${e.income} coins` : ''}`;
    case 'tileFired':
      return `  P${e.player + 1} ${e.tile} fires (${e.trigger})${e.owner != null ? `, P${e.owner + 1}'s at slot ${e.slot}` : ''}`;
    case 'toll': {
      const paid = [e.amount > 0 ? `${e.amount} coins` : '', e.vp ? `${e.vp} VP` : ''].filter(Boolean).join(' and ');
      return `  P${e.payer + 1} ${paid ? `pays P${e.owner + 1} ${paid}` : `pays P${e.owner + 1} nothing`} at ${e.tile}`;
    }
    case 'corner': return `  P${e.player + 1} reaches ${e.own ? 'their own' : 'another'} corner, +${e.income} coins`;
    case 'resource': return `    P${e.player + 1} ${e.delta >= 0 ? '+' : ''}${e.delta} ${e.res} (${e.source})`;
    case 'attacked': return `  P${e.attacker + 1} attacks P${e.target + 1} with ${e.tile}${e.cancelled ? ' — cancelled by shield' : ''}`;
    case 'bought': return `  P${e.player + 1} buys ${e.item} for ${e.cost}${e.slot != null ? ` at slot ${e.slot}` : ''}${e.displaced != null ? `, buying out P${e.displaced + 1}` : ''}`;
    case 'sold': return `  P${e.player + 1} sells ${e.tile} for ${e.refund}`;
    case 'expanded': return `  P${e.player + 1} board grows to ${e.size} slots (after ${e.afterSlot})`;
    case 'locked': return `  P${e.player + 1}'s ${e.tile} at slot ${e.slot} locked by P${e.by + 1}`;
    case 'shopRefilled': return `  shop: ${e.shop.join(', ')}`;
    case 'roundEnded': return `-- round ${e.round}: ${e.standings.map((s) => `P${s.player + 1} ${s.vp}vp/${s.coins}c`).join('  ')}`;
    case 'gameEnded': return `== game over (${e.reason}) after ${e.rounds} rounds: P${e.winner + 1} wins`;
  }
}

// ---------------------------------------------------------------------------
// Effects

export type DescribeEffectsOptions = {
  /**
   * In an `onTargeted` list the engine runs effects with the defender as
   * `self` and the attacker as `target`, so "target" reads as "attacker".
   */
  trigger?: Trigger;
  /**
   * Shared-board class: in a toll `self` is the owner and `target` the visitor;
   * in a public tile `self` is the visitor.
   */
  cls?: TileClass;
};

const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

function resText(res: Resource, n: number): string {
  return res === 'vp' ? `${n} VP` : `${n} ${plural(n, 'coin')}`;
}

/** An amount that may scale with the board. `label` formats a plain number (with its unit). */
function amountText(amount: Amount, label: (n: number) => string, opts: DescribeEffectsOptions = {}): string {
  if (typeof amount === 'number') return label(amount);
  const cap = amount.max != null ? `, max ${amount.max}` : '';
  return scaledAmount(amount, label, opts) + cap;
}

function scaledAmount(amount: Exclude<Amount, number>, label: (n: number) => string, opts: DescribeEffectsOptions): string {
  if ('adjacentWithTag' in amount) {
    return scaled(label, amount.per, `adjacent ${amount.adjacentWithTag} tile`, `adjacent ${amount.adjacentWithTag} tiles`);
  }
  if ('ownedWithTag' in amount) {
    return scaled(label, amount.per, `owned ${amount.ownedWithTag} tile`, `owned ${amount.ownedWithTag} tiles`);
  }
  if ('adjacentWithClass' in amount) {
    return scaled(label, amount.per, `adjacent ${amount.adjacentWithClass} tile`, `adjacent ${amount.adjacentWithClass} tiles`);
  }
  if ('ownedWithClass' in amount) {
    return scaled(label, amount.per, `owned ${amount.ownedWithClass} tile`, `owned ${amount.ownedWithClass} tiles`);
  }
  if ('visitorOwnedOnSide' in amount) {
    return scaled(label, amount.per, 'tile the mover owns on this side', 'tiles the mover owns on this side');
  }
  if ('coinsHeldDiv' in amount) {
    const whose = amount.of === 'target' ? (opts.cls === 'toll' ? 'the visitor' : 'the target') : 'you';
    return `${label(amount.per)} per ${amount.coinsHeldDiv} coins held by ${whose}`;
  }
  if ('cornersPassed' in amount) return scaled(label, amount.per, 'corner passed', 'corners passed');
  return scaled(label, amount.per, 'lap', 'laps');
}

/** `1 VP per adjacent score tile`; fractions that divide evenly read as `1 VP per 2 laps`. */
function scaled(label: (n: number) => string, per: number, one: string, many: string): string {
  const inv = per > 0 && per < 1 ? 1 / per : 0;
  if (inv > 1 && Number.isInteger(inv)) return `${label(1)} per ${inv} ${many}`;
  return `${label(per)} per ${one}`;
}

function whoText(who: Who, opts: DescribeEffectsOptions): string {
  switch (who) {
    case 'self': return opts.cls === 'public' ? 'visitor' : opts.cls === 'toll' ? 'owner' : 'self';
    case 'target': return opts.cls === 'toll' ? 'visitor' : opts.trigger === 'onTargeted' ? 'attacker' : 'target';
    case 'others': return 'others';
    case 'all': return 'everyone';
    case 'owner': return 'owner';
  }
}

function condText(c: Cond): string {
  if ('flag' in c) return `${c.flag} ${c.op === '>' ? '>' : '='} ${c.value}`;
  if ('adjacentWithTag' in c) return `${c.min}+ adjacent ${c.adjacentWithTag} tiles`;
  if ('adjacentToCorner' in c) return 'next to a corner';
  if ('visitor' in c) return 'the moving token is a visitor';
  return `roll total ${c.dieTotal === '>=' ? '≥' : '≤'} ${c.value}`;
}

const rounds = (n: number) => `${n} ${plural(n, 'round')}`;

function oneEffect(e: Effect, opts: DescribeEffectsOptions): string {
  switch (e.op) {
    case 'gain': {
      const amt = amountText(e.amount, (n) => resText(e.res, n), opts);
      if (!e.who || e.who === 'self') return `gain ${amt}`;
      const plural = e.who === 'others' || e.who === 'all';
      return `${whoText(e.who, opts)} ${plural ? 'gain' : 'gains'} ${amt}`;
    }
    case 'pay': {
      const res = e.res ?? 'coins';
      const cap = e.cap != null ? ` (at most ${resText(res, e.cap)})` : '';
      const els = e.orElse && e.orElse.length > 0 ? `; if they cannot, ${e.orElse.map((x) => oneEffect(x, opts)).join(', ')} instead` : '';
      return `${whoText('target', opts)} pays ${whoText('self', opts)} ${amountText(e.amount, (n) => resText(res, n), opts)}${cap}${els}`;
    }
    case 'lose': {
      const amt = amountText(e.amount, (n) => resText(e.res, n));
      switch (e.who) {
        case 'self': return `lose ${amt}`;
        case 'others': return `others lose ${amt}`;
        default: return `${whoText(e.who, opts)} loses ${amt}`;
      }
    }
    case 'steal':
      return `steal ${amountText(e.amount, (n) => resText(e.res, n))} from ${whoText('target', opts)}`;
    case 'move': {
      const by = typeof e.by === 'number' ? signed(e.by) : `by ${amountText(e.by, (n) => String(n))}`;
      return `move ${whoText(e.who, opts)} ${by}`;
    }
    case 'teleport':
      return `teleport ${whoText(e.who, opts)} to ${e.to === 'start' ? 'Start' : e.to === 'nextCorner' ? 'the next corner' : 'a random slot'}`;
    case 'rollAgain':
      return 'roll again';
    case 'setFlag': {
      const dur = e.rounds != null ? ` for ${rounds(e.rounds)}` : '';
      if (e.flag === 'shielded' && e.value > 0) {
        const who = e.who === 'self' ? '' : ` ${whoText(e.who, opts)}`;
        return `shield${who}${e.rounds != null ? dur : ' until used'}`;
      }
      return `set ${e.flag} to ${e.value} on ${whoText(e.who, opts)}${dur}`;
    }
    case 'lockTile': {
      const dur = ` for ${rounds(e.rounds)}`;
      if (e.who === 'self') return `lock a random own tile${dur}`;
      if (e.who === 'target') return `lock a random ${whoText('target', opts)} tile${dur}`;
      return `lock a random tile of each ${e.who === 'all' ? 'player' : 'other player'}${dur}`;
    }
    case 'reflect':
      return `reflect ${Math.round(e.fraction * 100)}% of coin loss to attacker`;
    case 'if': {
      const then = e.then.map((x) => oneEffect(x, opts)).join(', ');
      const els = e.else && e.else.length > 0 ? `, otherwise ${e.else.map((x) => oneEffect(x, opts)).join(', ')}` : '';
      return `if ${condText(e.cond)}: ${then}${els}`;
    }
    case 'addDie':
      return `add a d${e.sides}`;
    case 'setDice': {
      const dur = ` for ${rounds(e.rounds)}`;
      if (e.who === 'self') return `roll d${e.sides}${dur}`;
      const subject = whoText(e.who, opts);
      return `${subject} ${e.who === 'others' ? 'roll' : 'rolls'} d${e.sides}${dur}`;
    }
    case 'replaceDie':
      return `replace d${e.from} with d${e.to}`;
  }
}

/** A readable summary of an effect list, joined with `; `. Empty list gives `no effect`. */
export function describeEffects(effects: Effect[], opts: DescribeEffectsOptions = {}): string {
  if (effects.length === 0) return 'no effect';
  return effects.map((e) => oneEffect(e, opts)).join('; ');
}

// ---------------------------------------------------------------------------
// Tiles and mods

const TRIGGERS: [Trigger, string][] = [
  ['onLand', 'on land'],
  ['onPass', 'on pass'],
  ['onLap', 'on lap'],
  ['onTargeted', 'when targeted'],
];

/** Shared-board classes: when a tile fires, and the beneficiary the effect text is read as. */
const CLASS_RULE: Record<TileClass, [when: string, who: string]> = {
  civic: ['any token passes or lands', 'owner'],
  private: ["the owner's token passes or lands", 'owner'],
  toll: ["another player's token lands", ''],
  public: ['any token lands (twice on the owner\'s own tile)', 'visitor'],
};

const PASSIVE_TEXT: { [K in keyof Passive]-?: (v: NonNullable<Passive[K]>) => string } = {
  noReplace: () => 'others cannot build over your tiles',
  civicBonus: (n) => `your civic tiles pay ${signed(n)} ${plural(n, 'coin')}`,
  dieSides: (n) => `you roll d${n}`,
  shopDiscount: (n) => `shop tiles cost you ${n} less`,
  endGameVpPerTiles: (n) => `at game end, 1 VP per ${n} tiles you own`,
  visitorLandVp: (n) => `${n} VP to you whenever a visitor lands here`,
  tollFree: () => 'tolls cost you nothing',
};

/** `Cathedral (12c, landmark): on own pass or land, gain 3 VP | passive: ...`. */
export function describeLandmark(def: LandmarkDef): string {
  const passive = Object.entries(def.passive ?? {}).map(([k, v]) => (PASSIVE_TEXT as Record<string, (x: unknown) => string>)[k]!(v));
  return `${def.name} (${def.cost}c, landmark): the owner's token passes or lands → ${describeEffects(def.effects)}${passive.length > 0 ? ` | passive: ${passive.join('; ')}` : ''}`;
}

/**
 * `Shrine (3c, score): on land, gain 1 VP`. Expansion tiles describe the slot
 * they add. Pass `tiles` (usually `config.tileSet`) to name an `insertTile`;
 * without it the id is title-cased.
 */
export function describeTile(def: TileDef, tiles?: readonly TileDef[]): string {
  if (def.class && def.effects) {
    const [when, who] = CLASS_RULE[def.class];
    const head = `${def.name} (${[`${def.cost}c`, def.class, ...def.tags].join(', ')})`;
    return `${head}: ${when} → ${who ? `${who}: ` : ''}${describeEffects(def.effects, { cls: def.class })}`;
  }
  if (def.tags.includes('expansion') || def.insertTile != null) {
    const what = def.insertTile != null
      ? `a ${(tiles?.find((t) => t.id === def.insertTile)?.name) ?? titleCase(def.insertTile)} slot`
      : 'an empty slot';
    return `${def.name} (${def.cost}c): adds ${what} after a chosen slot`;
  }
  const parts: string[] = [];
  for (const [key, label] of TRIGGERS) {
    const effects = def[key];
    if (effects && effects.length > 0) parts.push(`${label}, ${describeEffects(effects, { trigger: key })}`);
  }
  const head = `${def.name} (${[`${def.cost}c`, ...def.tags].join(', ')})`;
  return `${head}: ${parts.length > 0 ? parts.join(' | ') : 'no effect'}`;
}

/** `Fog (5c, round): others roll d4 for 1 round`. */
export function describeMod(def: ModDef): string {
  const parts: string[] = [];
  if (def.grants === 'reroll') parts.push('after rolling, spend it to reroll once');
  if (def.effects.length > 0) parts.push(describeEffects(def.effects));
  return `${def.name} (${def.cost}c, ${def.scope}): ${parts.length > 0 ? parts.join('; ') : 'no effect'}`;
}
