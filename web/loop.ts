// The async game loop. It owns no DOM: it asks a seat for an action (a bot's
// `decide`, or the human controller), shows the thinking, applies `step`, and
// hands the events to the presenter. Everything else is injected, so tests
// drive it with a fake presenter and a scripted "human".
import type { Action, Event, GameConfig, GameState } from '../engine/types.ts';
import { createGame, legalActions, step } from '../engine/engine.ts';
import { Rng } from '../engine/rng.ts';
import { botByName } from '../bots/index.ts';
import { BOT_RNG_OFFSET } from '../sim/runner.ts';
import type { HumanController, Presenter, Seat } from './types.ts';

export type Session = {
  seed: number;
  config: GameConfig;
  /** Mutable: flipping `human` changes who decides from that seat's next decision. */
  seats: Seat[];
  present: Presenter;
  human: HumanController;
  botRng: Rng;
  state: GameState;
  /** Every action taken so far, humans included: (seed, actions) replays the game. */
  actions: Action[];
  events: Event[];
  /** Called after each step, with the state the game is now in. */
  onStep?: (state: GameState) => void;
};

export function newSession(opts: {
  seed: number; config: GameConfig; seats: Seat[]; present: Presenter; human: HumanController;
}): Session {
  if (opts.seats.length !== opts.config.players) throw new Error(`${opts.seats.length} seats for ${opts.config.players} players`);
  const state = createGame(opts.config, opts.seed);
  return {
    ...opts,
    botRng: new Rng(opts.seed + BOT_RNG_OFFSET),
    state,
    actions: [],
    events: [{ t: 'shopRefilled', shop: state.shop.slice() }],
  };
}

export type GameResult = { state: GameState; actions: Action[]; events: Event[] };

export async function runGame(session: Session, maxSteps = 100_000): Promise<GameResult> {
  let steps = 0;
  while (session.state.phase !== 'ended') {
    if (++steps > maxSteps) throw new Error(`game ${session.seed} exceeded ${maxSteps} steps`);
    const state = session.state;
    const legal = legalActions(state);
    const seat = session.seats[state.activePlayer]!;
    session.present.turn(state);

    let action: Action;
    if (seat.human) {
      const chosen = await session.human.act(state, legal);
      // null: the seat was handed back while waiting. Re-evaluate who decides.
      if (chosen === null) continue;
      action = chosen;
    } else {
      const decision = botByName(seat.bot).decide(state, legal, session.botRng);
      await session.present.thinking(decision, state);
      action = decision.action;
    }

    const { state: next, events } = step(state, action);
    session.actions.push(action);
    session.events.push(...events);
    await session.present.events(events, state, next, action);
    session.state = next;
    session.onStep?.(next);
  }
  session.present.turn(session.state);
  return { state: session.state, actions: session.actions, events: session.events };
}
