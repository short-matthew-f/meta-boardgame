// Human-readable text for actions, events, tiles, mods and effects. Pure
// functions over engine types: no DOM, no I/O, so the sim CLI, the bot
// explanations and the web UI all say things the same way.
//
// Conventions: player numbers are 1-based in text (state indices are 0-based),
// slot numbers are the board index as the engine uses it (slot 0 is Start),
// negatives use U+2212 (−).
import type {
  Action, Amount, Cond, Effect, Event, GameConfig, GameState, ModDef, Resource, TileDef, TileId, Trigger, Who,
} from './types.ts';

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
      const price = def ? ` (${def.cost}c)` : '';
      const old = state.players[state.activePlayer]?.board[action.slot];
      return `Buy ${name}${price} → slot ${action.slot}${old != null ? `, replacing ${tileName(cfg, old)}` : ''}`;
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
      const id = state.players[state.activePlayer]?.board[action.slot];
      if (id == null) return `Sell slot ${action.slot}`;
      const def = cfg.tileSet.find((t) => t.id === id);
      const refund = def ? Math.floor(def.cost * cfg.sellRefund) : 0;
      return `Sell ${tileName(cfg, id)} from slot ${action.slot} for ${refund}c`;
    }
    case 'pass': return 'Pass';
  }
}

// ---------------------------------------------------------------------------
// Events (moved here from sim/cli.ts; output unchanged)

export function describeEvent(e: Event): string {
  switch (e.t) {
    case 'rolled': return `P${e.player + 1} rolls [${e.dice.join(',')}] = ${e.total}`;
    case 'moved': return `  P${e.player + 1} moves ${e.from} -> ${e.to}${e.passedStart ? ' (passes Start)' : ''}`;
    case 'lap': return `  P${e.player + 1} completes lap ${e.laps}, +${e.income} coins`;
    case 'tileFired': return `  P${e.player + 1} ${e.tile} fires (${e.trigger})`;
    case 'resource': return `    P${e.player + 1} ${e.delta >= 0 ? '+' : ''}${e.delta} ${e.res} (${e.source})`;
    case 'attacked': return `  P${e.attacker + 1} attacks P${e.target + 1} with ${e.tile}${e.cancelled ? ' — cancelled by shield' : ''}`;
    case 'bought': return `  P${e.player + 1} buys ${e.item} for ${e.cost}${e.slot != null ? ` at slot ${e.slot}` : ''}`;
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
};

const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

function resText(res: Resource, n: number): string {
  return res === 'vp' ? `${n} VP` : `${n} ${plural(n, 'coin')}`;
}

/** An amount that may scale with the board. `label` formats a plain number (with its unit). */
function amountText(amount: Amount, label: (n: number) => string): string {
  if (typeof amount === 'number') return label(amount);
  if ('adjacentWithTag' in amount) {
    return scaled(label, amount.per, `adjacent ${amount.adjacentWithTag} tile`, `adjacent ${amount.adjacentWithTag} tiles`);
  }
  if ('ownedWithTag' in amount) {
    return scaled(label, amount.per, `owned ${amount.ownedWithTag} tile`, `owned ${amount.ownedWithTag} tiles`);
  }
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
    case 'self': return 'self';
    case 'target': return opts.trigger === 'onTargeted' ? 'attacker' : 'target';
    case 'others': return 'others';
    case 'all': return 'everyone';
  }
}

function condText(c: Cond): string {
  if ('flag' in c) return `${c.flag} ${c.op === '>' ? '>' : '='} ${c.value}`;
  if ('adjacentWithTag' in c) return `${c.min}+ adjacent ${c.adjacentWithTag} tiles`;
  return `roll total ${c.dieTotal === '>=' ? '≥' : '≤'} ${c.value}`;
}

const rounds = (n: number) => `${n} ${plural(n, 'round')}`;

function oneEffect(e: Effect, opts: DescribeEffectsOptions): string {
  switch (e.op) {
    case 'gain':
      return `gain ${amountText(e.amount, (n) => resText(e.res, n))}`;
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
      return `teleport ${whoText(e.who, opts)} to ${e.to === 'start' ? 'Start' : 'a random slot'}`;
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

/**
 * `Shrine (3c, score): on land, gain 1 VP`. Expansion tiles describe the slot
 * they add. Pass `tiles` (usually `config.tileSet`) to name an `insertTile`;
 * without it the id is title-cased.
 */
export function describeTile(def: TileDef, tiles?: readonly TileDef[]): string {
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
