import type { Bot } from './types.ts';
import { buildDecision, shortLabel } from './explain.ts';

/** Baseline: uniform over legal actions. Anything that loses to it is a rules bug. */
export const randomBot: Bot = {
  name: 'random',
  choose(_state, legal, rng) {
    return rng.pick(legal);
  },
  decide(state, legal, rng) {
    const chosen = legal.indexOf(rng.pick(legal));
    const p = 1 / legal.length;
    const scores = legal.map(() => p);
    const why = (i: number) => `${shortLabel(state, legal[i]!)}: equal chance, 1 in ${legal.length}`;
    return buildDecision(legal, scores, chosen, why, `picked uniformly at random from ${legal.length} legal actions`, undefined, (i) => shortLabel(state, legal[i]!));
  },
};
