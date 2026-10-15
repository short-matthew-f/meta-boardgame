import type { Action, GameState } from '../engine/types.ts';
import type { Rng } from '../engine/rng.ts';

export type Bot = {
  name: string;
  choose(state: GameState, legal: Action[], rng: Rng): Action;
};
