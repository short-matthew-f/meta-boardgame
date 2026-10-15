import type { Bot } from './types.ts';
import { randomBot } from './random.ts';
import { aggressorBot, expanderBot, greedyBot, greedyRandomBot, scorerBot, turtleBot } from './archetypes.ts';
import { lookaheadBot } from './lookahead.ts';

export const BOTS: Record<string, Bot> = Object.fromEntries(
  [randomBot, greedyBot, greedyRandomBot, scorerBot, aggressorBot, turtleBot, expanderBot, lookaheadBot].map((b) => [b.name, b]),
);

export function botByName(name: string): Bot {
  const b = BOTS[name];
  if (!b) throw new Error(`unknown bot "${name}"; known: ${Object.keys(BOTS).join(', ')}`);
  return b;
}

export type { Bot };
