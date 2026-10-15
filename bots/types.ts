import type { Action, GameState } from '../engine/types.ts';
import type { Rng } from '../engine/rng.ts';

/** One option a bot weighed. `score` is comparable within a decision, not across bots. */
export type Candidate = { action: Action; score: number; why: string };

/**
 * A choice plus its explanation. `candidates` is sorted by score descending,
 * holds at most 6 entries, and starts with the chosen action. `note` is
 * strategy context for the whole decision, not one option.
 */
export type Decision = { action: Action; candidates: Candidate[]; note?: string };

export type Bot = {
  name: string;
  /** Fast path used by the batch sim. */
  choose(state: GameState, legal: Action[], rng: Rng): Action;
  /** Same action as `choose` for the same state, legal list and Rng state, plus the explanation. */
  decide(state: GameState, legal: Action[], rng: Rng): Decision;
};
