// Hand-rolled validator for tile and mod JSON. No dependencies; errors are
// collected as strings so a test can print every problem at once.
import { TAGS, type Amount, type Cond, type Effect, type ModDef, type Tag, type TileDef } from '../engine/types.ts';

const WHO = ['self', 'target', 'others', 'all'];
const RES = ['coins', 'vp'];

function isInt(x: unknown): x is number {
  return typeof x === 'number' && Number.isInteger(x);
}

function checkAmount(a: unknown, path: string, errs: string[]): void {
  if (typeof a === 'number') return;
  if (typeof a !== 'object' || a === null) return void errs.push(`${path}: amount must be a number or object`);
  const o = a as Record<string, unknown>;
  if (typeof o.per !== 'number') errs.push(`${path}.per: must be a number`);
  if ('adjacentWithTag' in o || 'ownedWithTag' in o) {
    const tag = (o.adjacentWithTag ?? o.ownedWithTag) as Tag;
    if (!TAGS.includes(tag)) errs.push(`${path}: unknown tag ${String(tag)}`);
  } else if (!('laps' in o)) {
    errs.push(`${path}: amount object needs adjacentWithTag, ownedWithTag or laps`);
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
    case 'gain': res(); checkAmount(o.amount, `${path}.amount`, errs); break;
    case 'lose': res(); who(); checkAmount(o.amount, `${path}.amount`, errs); break;
    case 'steal': res(); checkAmount(o.amount, `${path}.amount`, errs); break;
    case 'move': who(); checkAmount(o.by, `${path}.by`, errs); break;
    case 'teleport': who(); if (o.to !== 'start' && o.to !== 'random') errs.push(`${path}.to: start or random`); break;
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

export type { Amount, Cond, Effect, ModDef, TileDef };
