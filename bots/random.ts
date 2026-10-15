import type { Bot } from './types.ts';

/** Baseline: uniform over legal actions. Anything that loses to it is a rules bug. */
export const randomBot: Bot = {
  name: 'random',
  choose(_state, legal, rng) {
    return rng.pick(legal);
  },
};
