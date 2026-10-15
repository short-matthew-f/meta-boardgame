// Scripted shared-board positions for the shared*.test.ts suites: forced
// one-sided dice (a roll of n d1s moves exactly n slots) and hand-placed tiles.
import { createGame, legalActions, step } from '../engine/engine.ts';
import type { Action, Event, GameConfig, GameState } from '../engine/types.ts';
import { defaultSharedConfig } from '../tiles/index.ts';

export type Opts = { players?: number; cfg?: Partial<GameConfig> };

/** Fresh shared game: empty shop and bag, every player on a single d1. Active player 0, everyone on their own corner. */
export function game(o: Opts = {}): GameState {
  const config = defaultSharedConfig({ players: o.players ?? 2, ...o.cfg });
  const s = createGame(config, 1);
  s.shop = [];
  s.bag = [];
  s.players.forEach((p, i) => { p.dice = [{ sides: 1 }]; p.position = i * config.sideLength; });
  return s;
}

/** Put a tile (or landmark, with `landmark`) on a slot for `owner`. */
export function put(s: GameState, slot: number, id: string, owner: number, landmark = false): void {
  const c = s.shared!.slots[slot]!;
  c.tile = id;
  c.owner = owner;
  if (landmark) s.players[owner]!.landmarks.push(id);
}

/** The active player rolls exactly `by` (that many d1s). */
export function roll(s: GameState, by: number) {
  const p = s.players[s.activePlayer]!;
  p.dice = Array.from({ length: by }, () => ({ sides: 1 }));
  return step(s, { type: 'roll' });
}

export const fired = (events: Event[], tile: string, trigger?: string) =>
  events.filter((e) => e.t === 'tileFired' && e.tile === tile && (trigger == null || e.trigger === trigger)).length;

export const tolls = (events: Event[]) => events.filter((e): e is Extract<Event, { t: 'toll' }> => e.t === 'toll');

/** Roll / pass until the game ends (a roll of the single d1 moves one slot). */
export function finish(s: GameState): { state: GameState; events: Event[] } {
  const events: Event[] = [];
  let state = s;
  while (state.phase !== 'ended') {
    const legal = legalActions(state);
    const a: Action = legal.find((x) => x.type === 'roll') ?? legal.find((x) => x.type === 'pass')!;
    const r = step(state, a);
    events.push(...r.events);
    state = r.state;
  }
  return { state, events };
}
