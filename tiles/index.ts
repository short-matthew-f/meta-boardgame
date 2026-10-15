import starter from './starter.json' with { type: 'json' };
import superlinear from './starter-superlinear.json' with { type: 'json' };
import mods from './mods.json' with { type: 'json' };
import type { GameConfig, ModDef, TileDef } from '../engine/types.ts';
import { makeConfig } from '../engine/engine.ts';
import { validateMods, validateTiles } from './schema.ts';

export const STARTER_TILES = starter as TileDef[];
/** Experiment set: Cathedral 10c gives 5 VP (was 3), Mine 5c gives 4 coins (was 3); everything else as STARTER_TILES. */
export const SUPERLINEAR_TILES = superlinear as TileDef[];
export const STARTER_MODS = mods as ModDef[];

{
  const errs = [...validateTiles(STARTER_TILES), ...validateTiles(SUPERLINEAR_TILES), ...validateMods(STARTER_MODS)];
  if (errs.length) throw new Error(`invalid tile data:\n${errs.join('\n')}`);
}

/** The default v0 config: starter tiles, starter mods, spec numbers. */
export function defaultConfig(overrides: Partial<GameConfig> = {}): GameConfig {
  return makeConfig({ tileSet: STARTER_TILES, modSet: STARTER_MODS, ...overrides });
}
