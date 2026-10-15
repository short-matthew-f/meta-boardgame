import type { Action, Event, GameConfig, GameRecord, GameState } from '../engine/types.ts';
import { createGame, legalActions, step } from '../engine/engine.ts';
import { Rng } from '../engine/rng.ts';
import type { Bot } from '../bots/types.ts';

export const BOT_RNG_OFFSET = 0x5eed;

/** Run one game to completion. Bots are indexed by seat. */
export function playGame(seed: number, bots: Bot[], config: GameConfig, maxSteps = 100_000): GameRecord {
  if (bots.length !== config.players) throw new Error(`lineup has ${bots.length} bots but config.players is ${config.players}`);
  let state = createGame(config, seed);
  const botRng = new Rng(seed + BOT_RNG_OFFSET);
  const actions: Action[] = [];
  const events: Event[] = [{ t: 'shopRefilled', shop: state.shop.slice() }];
  let steps = 0;
  while (state.phase !== 'ended') {
    if (++steps > maxSteps) throw new Error(`game ${seed} exceeded ${maxSteps} steps`);
    const legal = legalActions(state);
    const action = bots[state.activePlayer]!.choose(state, legal, botRng);
    const r = step(state, action);
    actions.push(action);
    events.push(...r.events);
    state = r.state;
  }
  return { seed, config, bots: bots.map((b) => b.name), actions, events, winner: state.winner!, rounds: state.round };
}

/** Re-run a recorded action list. Returns the events it produces and the final state. */
export function replay(seed: number, config: GameConfig, actions: Action[]): { events: Event[]; state: GameState } {
  let state = createGame(config, seed);
  const events: Event[] = [{ t: 'shopRefilled', shop: state.shop.slice() }];
  for (const a of actions) {
    const r = step(state, a);
    events.push(...r.events);
    state = r.state;
  }
  return { events, state };
}
