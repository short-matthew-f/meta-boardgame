// All engine types. The whole game is one plain JSON object (GameState);
// nothing here holds a function or a class instance so state can be cloned,
// serialised, and replayed from (seed, actions[]).

export type TileId = string;
export type ModId = string;

export type Tag = 'income' | 'score' | 'mover' | 'combo' | 'attack' | 'defense' | 'expansion';
export const TAGS: Tag[] = ['income', 'score', 'mover', 'combo', 'attack', 'defense', 'expansion'];

export type Resource = 'coins' | 'vp';
export type Who = 'self' | 'target' | 'others' | 'all';
export type Trigger = 'onLand' | 'onPass' | 'onLap' | 'onTargeted';

export type Amount =
  | number
  | { adjacentWithTag: Tag; per: number }
  | { ownedWithTag: Tag; per: number }
  | { laps: true; per: number };

export type Cond =
  | { flag: string; op: '>' | '=='; value: number }
  | { adjacentWithTag: Tag; min: number }
  | { dieTotal: '>=' | '<='; value: number };

export type Effect =
  | { op: 'gain'; res: Resource; amount: Amount }
  | { op: 'lose'; res: Resource; amount: Amount; who: Who }
  | { op: 'steal'; res: Resource; amount: Amount }
  | { op: 'move'; by: Amount; who: Who }
  | { op: 'teleport'; to: 'start' | 'random'; who: Who }
  | { op: 'rollAgain' }
  | { op: 'setFlag'; flag: string; value: number; who: Who; rounds?: number }
  | { op: 'lockTile'; who: Who; rounds: number }
  | { op: 'reflect'; fraction: number }
  | { op: 'if'; cond: Cond; then: Effect[]; else?: Effect[] }
  // die-mod primitives
  | { op: 'addDie'; sides: number }
  | { op: 'setDice'; who: Who; sides: number; rounds: number }
  | { op: 'replaceDie'; from: number; to: number };

export type EffectOp = Effect['op'];

export type TileDef = {
  id: TileId;
  name: string;
  cost: number;
  copies: number;
  tags: Tag[];
  onLand?: Effect[];
  onPass?: Effect[];
  onTargeted?: Effect[];
  onLap?: Effect[];
  /** Expansion tiles only: the tile placed in the new slot, if any. */
  insertTile?: TileId;
};

export type ModScope = 'consumable' | 'persistent' | 'round';

export type ModDef = {
  id: ModId;
  name: string;
  cost: number;
  scope: ModScope;
  effects: Effect[];
  /** Consumables with a special engine hook. */
  grants?: 'reroll';
};

export type DieSpec = { sides: number };

/** End modes the browser UI offers. */
export type EndMode = 'turnCap' | 'vpRace' | 'lapRace';
/**
 * Every end mode the engine implements. `vpPool` is experimental and typed
 * apart from `EndMode` because web/ switches exhaustively over `EndMode`; set
 * it with `VP_POOL_MODE` (engine.ts) or a cast.
 */
export type SimEndMode = EndMode | 'vpPool';

export type GameConfig = {
  players: number;
  boardSize: number;
  startCoins: number;
  lapIncome: number;
  shopSize: number;
  shopActions: number;
  /** Oldest unbought shop tiles discarded at the end of each round (0 = never). */
  shopCycle: number;
  endMode: EndMode;
  /** vpPool: total VP across all players that ends the game (at the end of that round). */
  endValue: number;
  /** Hard stop so a game that never trips its end condition still terminates. */
  maxRounds: number;
  /** Cap on chained self-moves / roll-agains within one turn. */
  maxTriggerChain: number;
  sellRefund: number; // fraction of cost refunded on sale
  /** Experimental, off by default: a tile's onLand effects also fire when the owner's token passes over it (not movers, not tiles with their own onPass). */
  fireOnPass: boolean;
  /** Times the landed tile's onLand list runs on landing (1 = today). Movers always run once. */
  landBonus: number;
  /** Experimental, off by default: at game end each player gains floor(sum of owned tile costs × tileEndVp) VP. */
  tileEndVp: number;
  tileSet: TileDef[];
  modSet: ModDef[];
};

/** A point in turn order: the turn of `player` in `round`. */
export type TurnRef = { round: number; player: number };

export type Modifier =
  | { kind: 'flag'; player: number; flag: string; value: number; until: TurnRef }
  | { kind: 'dice'; player: number; sides: number; until: TurnRef }
  | { kind: 'lock'; player: number; slot: number; until: TurnRef };

export type PlayerState = {
  id: number;
  board: (TileId | null)[]; // loop; index 0 is Start and never holds a tile
  position: number;
  coins: number;
  vp: number;
  laps: number;
  dice: DieSpec[];
  mods: ModId[];
  flags: Record<string, number>;
};

/** A tile trigger waiting to be resolved during the roll phase. */
export type QueuedTrigger =
  | { kind: 'tile'; player: number; slot: number; tile: TileId; trigger: Trigger; effectsOf?: Trigger }
  | { kind: 'land'; player: number; slot: number }
  | { kind: 'lapIncome'; player: number };

export type PendingChoice =
  | { kind: 'chooseTarget'; player: number; slot: number; tile: TileId; trigger: Trigger; effectsOf?: Trigger }
  | { kind: 'reroll'; player: number; dice: number[] };

export type RollContext = {
  queue: QueuedTrigger[];
  choice: PendingChoice | null;
  rollAgain: boolean;
  lastTotal: number;
  chain: number;
};

export type Phase = 'roll' | 'shop' | 'ended';

export type GameState = {
  config: GameConfig;
  rngState: number;
  round: number;
  activePlayer: number;
  phase: Phase;
  shopActionsLeft: number;
  players: PlayerState[];
  shop: TileId[];
  bag: TileId[];
  discard: TileId[];
  roundModifiers: Modifier[];
  pending: RollContext | null;
  endTrigger: { reason: string; endsAfterRound: number } | null;
  winner: number | null;
};

export type Action =
  | { type: 'roll' }
  | { type: 'reroll' }
  | { type: 'keepRoll' }
  | { type: 'chooseTarget'; player: number }
  | { type: 'buyTile'; shopIndex: number; slot: number }
  | { type: 'buyExpansion'; shopIndex: number; afterSlot: number }
  | { type: 'buyMod'; modId: ModId }
  | { type: 'sellTile'; slot: number }
  | { type: 'pass' };

export type Standing = { player: number; vp: number; coins: number };

export type Event =
  | { t: 'rolled'; player: number; dice: number[]; total: number; round: number }
  | { t: 'moved'; player: number; from: number; to: number; passedStart: boolean }
  | { t: 'lap'; player: number; laps: number; income: number }
  | { t: 'tileFired'; player: number; tile: TileId; trigger: Trigger }
  | { t: 'resource'; player: number; res: Resource; delta: number; source: TileId | ModId | 'lap' | 'sale' | 'endgame' }
  | { t: 'attacked'; attacker: number; target: number; tile: TileId; cancelled: boolean }
  | { t: 'bought'; player: number; item: TileId | ModId; cost: number; slot?: number }
  | { t: 'sold'; player: number; tile: TileId; refund: number }
  | { t: 'expanded'; player: number; afterSlot: number; size: number }
  | { t: 'locked'; player: number; slot: number; tile: TileId; by: number }
  | { t: 'shopRefilled'; shop: TileId[] }
  | { t: 'roundEnded'; round: number; standings: Standing[] }
  | { t: 'gameEnded'; reason: string; winner: number; rounds: number };

export type StepResult = { state: GameState; events: Event[] };

export type GameRecord = {
  seed: number;
  config: GameConfig;
  bots: string[];
  actions: Action[];
  events: Event[];
  winner: number;
  rounds: number;
};
