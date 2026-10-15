import { makeProfileBot, type Profile } from './profile.ts';

const base = {
  switchRound: 999,
  modWeights: {} as Record<string, number>,
  modReserve: 6,
  targetPolicy: 'random' as const,
  placement: 'random' as const,
  placementWeight: 2,
  costWeight: 0.15,
  replaceWeight: 0.4,
  sellWeight: -5,
  passWeight: 0,
  rerollBelow: 3,
};

/** Income until round 8, then score. Targets the coin leader. Places where the token will land. */
export const greedyProfile: Profile = {
  ...base,
  name: 'greedy',
  early: { income: 3, combo: 1, score: 0.5, expansion: -2, attack: -2, defense: -2, mover: 1 },
  late: { score: 3, combo: 1.5, income: 0.5, expansion: -2, attack: -2, defense: -2, mover: 1 },
  switchRound: 8,
  modWeights: { 'second-die': 1 },
  targetPolicy: 'coinLeader',
  placement: 'likely',
};

/** Greedy with random placement: the control for the placement metric. */
export const greedyRandomProfile: Profile = { ...greedyProfile, name: 'greedy-random', placement: 'random' };

/** Cheapest VP per coin, always. Targets the VP leader. Maximises adjacent score tiles. */
export const scorerProfile: Profile = {
  ...base,
  name: 'scorer',
  early: { score: 3, combo: 1, income: 0.5, expansion: -2, attack: -2, defense: -2, mover: 1 },
  late: { score: 3, combo: 1, income: 0.5, expansion: -2, attack: -2, defense: -2, mover: 1 },
  vpPerCoin: true,
  targetPolicy: 'vpLeader',
  placement: 'adjacentScore',
};

/** Attack tiles first, then Fog and dice mods. Targets the VP leader. */
export const aggressorProfile: Profile = {
  ...base,
  name: 'aggressor',
  early: { attack: 3, income: 1, score: 1, combo: 0, expansion: -2, defense: -2, mover: 1 },
  late: { attack: 3, score: 1.5, income: 0.5, combo: 0, expansion: -2, defense: -2, mover: 1 },
  modWeights: { fog: 2, 'second-die': 1.5, 'heavy-die': 1.5, haste: 0.5 },
  targetPolicy: 'vpLeader',
  placement: 'likely',
};

/** Defense first, then income, never attacks. */
export const turtleProfile: Profile = {
  ...base,
  name: 'turtle',
  early: { defense: 3, income: 2, score: 1, combo: 0.5, expansion: -2, attack: -99, mover: 1 },
  late: { defense: 1, score: 2.5, income: 1, combo: 0.5, expansion: -2, attack: -99, mover: 1 },
  switchRound: 8,
  targetPolicy: 'random',
  placement: 'likely',
};

/** Expansion tiles early, then combo tiles clustered together. */
export const expanderProfile: Profile = {
  ...base,
  name: 'expander',
  early: { expansion: 3, combo: 2, income: 1.5, score: 0.5, attack: -2, defense: -2, mover: 1 },
  late: { combo: 3, score: 2, income: 1, expansion: 0, attack: -2, defense: -2, mover: 1 },
  switchRound: 6,
  targetPolicy: 'vpLeader',
  placement: 'clusterCombo',
};

export const greedyBot = makeProfileBot(greedyProfile);
export const greedyRandomBot = makeProfileBot(greedyRandomProfile);
export const scorerBot = makeProfileBot(scorerProfile);
export const aggressorBot = makeProfileBot(aggressorProfile);
export const turtleBot = makeProfileBot(turtleProfile);
export const expanderBot = makeProfileBot(expanderProfile);
