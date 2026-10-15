import starter from './starter.json' with { type: 'json' };
import mods from './mods.json' with { type: 'json' };
import type { GameConfig, ModDef, TileDef } from '../engine/types.ts';
import { makeConfig } from '../engine/engine.ts';
import { validateMods, validateTiles } from './schema.ts';

export const STARTER_TILES = starter as TileDef[];
export const STARTER_MODS = mods as ModDef[];

{
  const errs = [...validateTiles(STARTER_TILES), ...validateMods(STARTER_MODS)];
  if (errs.length) throw new Error(`invalid tile data:\n${errs.join('\n')}`);
}

/** The default v0 config: starter tiles, starter mods, spec numbers. */
export function defaultConfig(overrides: Partial<GameConfig> = {}): GameConfig {
  return makeConfig({ tileSet: STARTER_TILES, modSet: STARTER_MODS, ...overrides });
}
