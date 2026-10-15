// Types shared by the loop, presenter, human controller and renderers.
// Nothing here touches the DOM, so the loop and view-model stay testable in node.
import type { Action, DieSpec, Event, GameConfig, GameState, ModId, TileId } from '../engine/types.ts';
import type { Decision } from '../bots/types.ts';

export type Speed = 'slow' | 'normal' | 'fast' | 'instant';
export const SPEEDS: Speed[] = ['slow', 'normal', 'fast', 'instant'];

/** Who plays a seat. `bot` is kept while a human has the seat so "Hand back" knows who to return it to. */
export type Seat = { bot: string; human: boolean };

export type SetupChoice = {
  /** One entry per seat: a bot name or 'human'. */
  seats: string[];
  endMode: GameConfig['endMode'];
  endValue: number;
  seed: number;
  speed: Speed;
};

/** What the display shows for one player; advanced event by event, then reset from the true state. */
export type PlayerView = {
  position: number;
  coins: number;
  vp: number;
  laps: number;
  board: (TileId | null)[];
  dice: DieSpec[];
  mods: ModId[];
  /** Locked slots, from the state's round modifiers. */
  locks: number[];
};

export type View = {
  round: number;
  activePlayer: number;
  phase: GameState['phase'];
  players: PlayerView[];
  shop: TileId[];
};

/** Dice currently on show (the last roll), cleared when the turn passes. */
export type DiceShown = { player: number; values: number[]; sides: number[]; tumbling?: boolean };

/** What a human can click right now. Built by human.ts from the legal list only. */
export type Affordances = {
  prompt: string;
  /** Buttons in the prompt card, each carrying an action that is in the legal list. */
  buttons: { label: string; action: Action; kind: 'primary' | 'secondary' | 'danger' }[];
  cancel: boolean;
  /** Shop indices that can be bought, and the one selected. */
  shopClickable: number[];
  shopSelected: number | null;
  modClickable: ModId[];
  /** Slots of the active board that accept the selected tile. */
  slotTargets: { slot: number; replaces: boolean }[];
  /** `afterSlot` values that accept the selected expansion. */
  gapTargets: number[];
  /** Owned slots that can be sold (when nothing is selected) and the one selected for sale. */
  sellable: number[];
  sellSelected: number | null;
  /** Opponent boards that can be chosen as the target. */
  targets: number[];
};

export const NO_AFFORDANCES: Affordances = {
  prompt: '', buttons: [], cancel: false, shopClickable: [], shopSelected: null, modClickable: [],
  slotTargets: [], gapTargets: [], sellable: [], sellSelected: null, targets: [],
};

/** The presenter the loop talks to. A fake with instant resolves drives the loop in tests. */
export type Presenter = {
  /** The state a decision is about to be made on (full re-render from the true state). */
  turn(state: GameState): void;
  /** Show a bot's Decision, pause so it can be read, then highlight the pick. */
  thinking(decision: Decision, state: GameState): Promise<void>;
  /** Play the events of one step. `before` is what is on screen, `after` the truth to land on. */
  events(events: Event[], before: GameState, after: GameState, action: Action): Promise<void>;
};

/** Resolves with the human's chosen action, or null if the seat was handed back meanwhile. */
export type HumanController = {
  act(state: GameState, legal: Action[]): Promise<Action | null>;
  cancel(): void;
};
