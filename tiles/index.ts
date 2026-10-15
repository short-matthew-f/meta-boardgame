import starter from './starter.json' with { type: 'json' };
import superlinear from './starter-superlinear.json' with { type: 'json' };
import mods from './mods.json' with { type: 'json' };
import shared from './shared.json' with { type: 'json' };
import landmarks from './landmarks.json' with { type: 'json' };
import type { GameConfig, LandmarkDef, ModDef, TileDef } from '../engine/types.ts';
import { makeConfig } from '../engine/engine.ts';
import { validateLandmarks, validateMods, validateTiles } from './schema.ts';

export const STARTER_TILES = starter as TileDef[];
/** Experiment set: Cathedral 10c gives 5 VP (was 3), Mine 5c gives 4 coins (was 3); everything else as STARTER_TILES. */
export const SUPERLINEAR_TILES = superlinear as TileDef[];
export const STARTER_MODS = mods as ModDef[];
/** Shared-board mode: 32 class tiles (civic, private, toll, public), see design/shared-board-tiles.md. */
export const SHARED_TILES = shared as TileDef[];
/** Shared-board mode: the landmark menu (not in the bag). */
export const LANDMARKS = landmarks as LandmarkDef[];

{
  const errs = [
    ...validateTiles(STARTER_TILES), ...validateTiles(SUPERLINEAR_TILES), ...validateMods(STARTER_MODS),
    ...validateTiles(SHARED_TILES), ...validateLandmarks(LANDMARKS, SHARED_TILES.map((t) => t.id)),
  ];
  if (errs.length) throw new Error(`invalid tile data:\n${errs.join('\n')}`);
}

/** The default v0 config: starter tiles, starter mods, spec numbers. */
export function defaultConfig(overrides: Partial<GameConfig> = {}): GameConfig {
  return makeConfig({ tileSet: STARTER_TILES, modSet: STARTER_MODS, ...overrides });
}

/** Shared-board config: one 10-slot side per player, shared tiles and landmarks, landing counts twice for privates (landBonus 2). */
export function defaultSharedConfig(overrides: Partial<GameConfig> = {}): GameConfig {
  return makeConfig({
    boardMode: 'shared', sideLength: 10, landBonus: 2,
    tileSet: SHARED_TILES, landmarkSet: LANDMARKS, modSet: STARTER_MODS,
    ...overrides,
  });
}
