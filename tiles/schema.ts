// Hand-rolled validator for tile and mod JSON. No dependencies; errors are
// collected as strings so a test can print every problem at once.
import { TAGS, TILE_CLASSES, type Amount, type Cond, type Effect, type LandmarkDef, type ModDef, type Tag, type TileClass, type TileDef } from '../engine/types.ts';

const WHO = ['self', 'target', 'others', 'all', 'owner'];
const AMOUNT_KINDS = ['adjacentWithTag', 'ownedWithTag', 'laps', 'adjacentWithClass', 'ownedWithClass', 'visitorOwnedOnSide', 'coinsHeldDiv', 'cornersPassed'];
const PASSIVE_KEYS = ['noReplace', 'civicBonus', 'dieSides', 'shopDiscount', 'endGameVpPerTiles', 'visitorLandVp', 'tollFree'];
const RES = ['coins', 'vp'];

function isInt(x: unknown): x is number {
  return typeof x === 'number' && Number.isInteger(x);
}

function checkAmount(a: unknown, path: string, errs: string[]): void {
  if (typeof a === 'number') return;
  if (typeof a !== 'object' || a === null) return void errs.push(`${path}: amount must be a number or object`);
  const o = a as Record<string, unknown>;
  if (typeof o.per !== 'number') errs.push(`${path}.per: must be a number`);
  if (o.max != null && typeof o.max !== 'number') errs.push(`${path}.max: must be a number`);
  const kinds = AMOUNT_KINDS.filter((k) => k in o);
  if (kinds.length !== 1) return void errs.push(`${path}: amount object needs exactly one of ${AMOUNT_KINDS.join(', ')}`);
  if ('adjacentWithTag' in o || 'ownedWithTag' in o) {
    const tag = (o.adjacentWithTag ?? o.ownedWithTag) as Tag;
    if (!TAGS.includes(tag)) errs.push(`${path}: unknown tag ${String(tag)}`);
  } else if ('adjacentWithClass' in o || 'ownedWithClass' in o) {
    const cls = (o.adjacentWithClass ?? o.ownedWithClass) as TileClass;
    if (!TILE_CLASSES.includes(cls)) errs.push(`${path}: unknown class ${String(cls)}`);
  } else if ('coinsHeldDiv' in o) {
    if (typeof o.coinsHeldDiv !== 'number' || o.coinsHeldDiv <= 0) errs.push(`${path}.coinsHeldDiv: positive number`);
    if (o.of != null && o.of !== 'self' && o.of !== 'target') errs.push(`${path}.of: self or target`);
  } else if (('visitorOwnedOnSide' in o && o.visitorOwnedOnSide !== true) || ('cornersPassed' in o && o.cornersPassed !== true) || ('laps' in o && o.laps !== true)) {
    errs.push(`${path}: flag amount kinds must be true`);
  }
}

function checkCond(c: unknown, path: string, errs: string[]): void {
  if (typeof c !== 'object' || c === null) return void errs.push(`${path}: cond must be an object`);
  const o = c as Record<string, unknown>;
  if ('flag' in o) {
    if (typeof o.flag !== 'string') errs.push(`${path}.flag: string`);
    if (o.op !== '>' && o.op !== '==') errs.push(`${path}.op: > or ==`);
    if (typeof o.value !== 'number') errs.push(`${path}.value: number`);
  } else if ('adjacentWithTag' in o) {
    if (!TAGS.includes(o.adjacentWithTag as Tag)) errs.push(`${path}.adjacentWithTag: unknown tag`);
    if (!isInt(o.min)) errs.push(`${path}.min: integer`);
  } else if ('dieTotal' in o) {
    if (o.dieTotal !== '>=' && o.dieTotal !== '<=') errs.push(`${path}.dieTotal: >= or <=`);
    if (typeof o.value !== 'number') errs.push(`${path}.value: number`);
  } else if ('adjacentToCorner' in o) {
    if (o.adjacentToCorner !== true) errs.push(`${path}.adjacentToCorner: must be true`);
  } else if ('visitor' in o) {
    if (o.visitor !== true) errs.push(`${path}.visitor: must be true`);
  } else errs.push(`${path}: unknown cond`);
}

export function checkEffects(list: unknown, path: string, errs: string[]): void {
  if (!Array.isArray(list)) return void errs.push(`${path}: must be an array`);
  list.forEach((e, i) => checkEffect(e, `${path}[${i}]`, errs));
}

function checkEffect(e: unknown, path: string, errs: string[]): void {
  if (typeof e !== 'object' || e === null) return void errs.push(`${path}: effect must be an object`);
  const o = e as Record<string, unknown>;
  const who = () => { if (!WHO.includes(o.who as string)) errs.push(`${path}.who: one of ${WHO.join(',')}`); };
  const res = () => { if (!RES.includes(o.res as string)) errs.push(`${path}.res: coins or vp`); };
  switch (o.op as Effect['op']) {
    case 'gain': res(); checkAmount(o.amount, `${path}.amount`, errs); if (o.who != null) who(); break;
    case 'pay':
      if (o.res != null && !RES.includes(o.res as string)) errs.push(`${path}.res: coins or vp`);
      checkAmount(o.amount, `${path}.amount`, errs);
      if (o.cap != null && typeof o.cap !== 'number') errs.push(`${path}.cap: number`);
      if (o.orElse != null) checkEffects(o.orElse, `${path}.orElse`, errs);
      break;
    case 'lose': res(); who(); checkAmount(o.amount, `${path}.amount`, errs); break;
    case 'steal': res(); checkAmount(o.amount, `${path}.amount`, errs); break;
    case 'move': who(); checkAmount(o.by, `${path}.by`, errs); break;
    case 'teleport': who(); if (o.to !== 'start' && o.to !== 'random' && o.to !== 'nextCorner') errs.push(`${path}.to: start, random or nextCorner`); break;
    case 'rollAgain': break;
    case 'setFlag':
      who();
      if (typeof o.flag !== 'string') errs.push(`${path}.flag: string`);
      if (typeof o.value !== 'number') errs.push(`${path}.value: number`);
      if (o.rounds != null && !isInt(o.rounds)) errs.push(`${path}.rounds: integer`);
      break;
    case 'lockTile': who(); if (!isInt(o.rounds)) errs.push(`${path}.rounds: integer`); break;
    case 'reflect': if (typeof o.fraction !== 'number' || o.fraction < 0 || o.fraction > 1) errs.push(`${path}.fraction: 0..1`); break;
    case 'if':
      checkCond(o.cond, `${path}.cond`, errs);
      checkEffects(o.then, `${path}.then`, errs);
      if (o.else != null) checkEffects(o.else, `${path}.else`, errs);
      break;
    case 'addDie': if (!isInt(o.sides) || (o.sides as number) < 1) errs.push(`${path}.sides: positive integer`); break;
    case 'setDice': who(); if (!isInt(o.sides)) errs.push(`${path}.sides: integer`); if (!isInt(o.rounds)) errs.push(`${path}.rounds: integer`); break;
    case 'replaceDie': if (!isInt(o.from) || !isInt(o.to)) errs.push(`${path}.from/to: integers`); break;
    default: errs.push(`${path}.op: unknown op ${String(o.op)}`);
  }
}

function containsPay(list: unknown): boolean {
  if (!Array.isArray(list)) return false;
  return list.some((e) => {
    const o = e as Record<string, unknown>;
    return o.op === 'pay' || (o.op === 'if' && (containsPay(o.then) || containsPay(o.else)));
  });
}

export function validateTiles(tiles: unknown): string[] {
  const errs: string[] = [];
  if (!Array.isArray(tiles)) return ['tile set must be an array'];
  const ids = new Set<string>();
  tiles.forEach((t, i) => {
    const path = `tiles[${i}]`;
    if (typeof t !== 'object' || t === null) return void errs.push(`${path}: must be an object`);
    const o = t as Record<string, unknown>;
    if (typeof o.id !== 'string' || !o.id) errs.push(`${path}.id: non-empty string`);
    else if (ids.has(o.id)) errs.push(`${path}.id: duplicate ${o.id}`);
    else ids.add(o.id);
    if (typeof o.name !== 'string') errs.push(`${path}.name: string`);
    if (!isInt(o.cost) || (o.cost as number) < 0) errs.push(`${path}.cost: non-negative integer`);
    if (!isInt(o.copies) || (o.copies as number) < 1) errs.push(`${path}.copies: positive integer`);
    if (!Array.isArray(o.tags) || o.tags.length === 0) errs.push(`${path}.tags: non-empty array`);
    else for (const tag of o.tags) if (!TAGS.includes(tag)) errs.push(`${path}.tags: unknown tag ${String(tag)}`);
    const triggers = ['onLand', 'onPass', 'onTargeted', 'onLap'] as const;
    if (o.class != null) {
      // shared-board tile: class + effects, no loops triggers
      if (!TILE_CLASSES.includes(o.class as TileClass)) errs.push(`${path}.class: one of ${TILE_CLASSES.join(',')}`);
      if (!Array.isArray(o.effects) || o.effects.length === 0) errs.push(`${path}.effects: non-empty array`);
      else {
        checkEffects(o.effects, `${path}.effects`, errs);
        if (o.class === 'toll' && !containsPay(o.effects)) errs.push(`${path}.effects: a toll must contain a pay`);
      }
      for (const tr of triggers) if (o[tr] != null) errs.push(`${path}.${tr}: shared tiles use class and effects, not triggers`);
      if (o.insertTile != null) errs.push(`${path}.insertTile: shared tiles have no expansions`);
      return;
    }
    if (o.effects != null) errs.push(`${path}.effects: needs a class`);
    let any = false;
    for (const tr of triggers) if (o[tr] != null) { any = true; checkEffects(o[tr], `${path}.${tr}`, errs); }
    const isExp = Array.isArray(o.tags) && o.tags.includes('expansion');
    if (isExp && any) errs.push(`${path}: expansion tiles carry no triggers`);
    if (!isExp && !any) errs.push(`${path}: non-expansion tile needs at least one trigger`);
    if (o.insertTile != null && typeof o.insertTile !== 'string') errs.push(`${path}.insertTile: string`);
  });
  // insertTile references
  tiles.forEach((t, i) => {
    const o = t as Record<string, unknown>;
    if (typeof o.insertTile === 'string' && !ids.has(o.insertTile)) errs.push(`tiles[${i}].insertTile: unknown tile ${o.insertTile}`);
  });
  return errs;
}

export function validateMods(mods: unknown): string[] {
  const errs: string[] = [];
  if (!Array.isArray(mods)) return ['mod set must be an array'];
  const ids = new Set<string>();
  mods.forEach((m, i) => {
    const path = `mods[${i}]`;
    if (typeof m !== 'object' || m === null) return void errs.push(`${path}: must be an object`);
    const o = m as Record<string, unknown>;
    if (typeof o.id !== 'string' || !o.id) errs.push(`${path}.id: non-empty string`);
    else if (ids.has(o.id)) errs.push(`${path}.id: duplicate`);
    else ids.add(o.id);
    if (typeof o.name !== 'string') errs.push(`${path}.name: string`);
    if (!isInt(o.cost) || (o.cost as number) < 0) errs.push(`${path}.cost: non-negative integer`);
    if (!['consumable', 'persistent', 'round'].includes(o.scope as string)) errs.push(`${path}.scope: consumable|persistent|round`);
    checkEffects(o.effects, `${path}.effects`, errs);
    if (o.grants != null && o.grants !== 'reroll') errs.push(`${path}.grants: only 'reroll' is known`);
  });
  return errs;
}

/** Landmarks: id, name, cost, effects and an optional passive. Pass the tile ids so a clash is reported. */
export function validateLandmarks(landmarks: unknown, tileIds: Iterable<string> = []): string[] {
  const errs: string[] = [];
  if (!Array.isArray(landmarks)) return ['landmark set must be an array'];
  const ids = new Set<string>();
  const tiles = new Set(tileIds);
  landmarks.forEach((m, i) => {
    const path = `landmarks[${i}]`;
    if (typeof m !== 'object' || m === null) return void errs.push(`${path}: must be an object`);
    const o = m as Record<string, unknown>;
    if (typeof o.id !== 'string' || !o.id) errs.push(`${path}.id: non-empty string`);
    else if (ids.has(o.id)) errs.push(`${path}.id: duplicate ${o.id}`);
    else if (tiles.has(o.id)) errs.push(`${path}.id: ${o.id} is also a tile id`);
    else ids.add(o.id);
    if (typeof o.name !== 'string') errs.push(`${path}.name: string`);
    if (!isInt(o.cost) || (o.cost as number) < 0) errs.push(`${path}.cost: non-negative integer`);
    if (!Array.isArray(o.effects)) errs.push(`${path}.effects: array`);
    else checkEffects(o.effects, `${path}.effects`, errs);
    if (o.passive != null) {
      if (typeof o.passive !== 'object') errs.push(`${path}.passive: object`);
      else {
        for (const [k, v] of Object.entries(o.passive as Record<string, unknown>)) {
          if (!PASSIVE_KEYS.includes(k)) errs.push(`${path}.passive.${k}: unknown passive`);
          else if (k === 'noReplace' || k === 'tollFree') { if (v !== true) errs.push(`${path}.passive.${k}: must be true`); }
          else if (!isInt(v) || (v as number) < 1) errs.push(`${path}.passive.${k}: positive integer`);
        }
      }
    }
  });
  return errs;
}

export type { LandmarkDef, Amount, Cond, Effect, ModDef, TileDef };
