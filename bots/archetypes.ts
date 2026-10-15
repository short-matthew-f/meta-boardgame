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

/**
 * Shared board. Tolls (tagged attack) and civics first, then VP from round 6; tolls go on the
 * VP leader's landing spots, tiles are bought over the leader's ground readily, attacks hit the
 * VP leader. A tolls-first-and-last version (attack 3 all game, toll bonus 1.5) won 4% of
 * games against greedy, scorer and builder; tolls only fire on a landing and pay 1 to 3 coins.
 */
export const landlordProfile: Profile = {
  ...base,
  name: 'landlord',
  early: { attack: 2, income: 2.5, combo: 1, score: 1.5, mover: 0.5, defense: 0, expansion: -2 },
  late: { attack: 1.5, income: 1, score: 3, combo: 1, mover: 0.5, defense: 0, expansion: -2 },
  switchRound: 6,
  classWeights: { early: { toll: 0.5, civic: 1 }, late: { toll: 0, civic: 0.5 } },
  modWeights: { 'second-die': 0.5 },
  targetPolicy: 'vpLeader',
  placement: 'likely',
  leaderWeight: 3,
  buyoutWeight: 0.1,
  leaderCheckWeight: 0.5,
};

/**
 * Shared board. Civics early, then saves for landmarks (it passes on tiles and mods that
 * would leave it short of the cheapest one) and keeps a bigger mod reserve once it owns one.
 */
export const builderProfile: Profile = {
  ...base,
  name: 'builder',
  early: { income: 3, combo: 2, score: 0.5, mover: 0.5, attack: -2, defense: 0, expansion: -2 },
  late: { income: 1.5, combo: 1, score: 1.5, mover: 0.5, attack: -2, defense: 0, expansion: -2 },
  switchRound: 5,
  classWeights: { early: { civic: 2 }, late: { civic: 0.5 } },
  targetPolicy: 'vpLeader',
  placement: 'likely',
  landmarkWeight: 8,
  saveForLandmarks: { fromRound: 5, goal: 4 },
  modReserveAfterLandmark: 14,
  buyoutWeight: 0.5,
};

export const greedyBot = makeProfileBot(greedyProfile);
export const greedyRandomBot = makeProfileBot(greedyRandomProfile);
export const scorerBot = makeProfileBot(scorerProfile);
export const aggressorBot = makeProfileBot(aggressorProfile);
export const turtleBot = makeProfileBot(turtleProfile);
export const expanderBot = makeProfileBot(expanderProfile);
export const landlordBot = makeProfileBot(landlordProfile);
export const builderBot = makeProfileBot(builderProfile);
