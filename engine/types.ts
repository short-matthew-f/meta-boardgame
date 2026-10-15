// All engine types. The whole game is one plain JSON object (GameState);
// nothing here holds a function or a class instance so state can be cloned,
// serialised, and replayed from (seed, actions[]).

export type TileId = string;
export type ModId = string;

export type Tag = 'income' | 'score' | 'mover' | 'combo' | 'attack' | 'defense' | 'expansion';
export const TAGS: Tag[] = ['income', 'score', 'mover', 'combo', 'attack', 'defense', 'expansion'];

export type Resource = 'coins' | 'vp';
/** `owner` is the owner of the firing tile (shared board); in loops mode it is `self`. */
export type Who = 'self' | 'target' | 'others' | 'all' | 'owner';
export type Trigger = 'onLand' | 'onPass' | 'onLap' | 'onTargeted';

/** Shared-board tile class: whose token triggers a tile and who benefits. */
export type TileClass = 'civic' | 'private' | 'toll' | 'public';
export const TILE_CLASSES: TileClass[] = ['civic', 'private', 'toll', 'public'];

/** Every amount object may carry `max`, a cap on its value. */
export type Amount =
  | number
  | { adjacentWithTag: Tag; per: number; max?: number }
  | { ownedWithTag: Tag; per: number; max?: number }
  | { laps: true; per: number; max?: number }
  // shared board only
  | { adjacentWithClass: TileClass; per: number; max?: number }
  | { ownedWithClass: TileClass; per: number; max?: number }
  /** Tiles the moving player owns on the side the firing slot is on. */
  | { visitorOwnedOnSide: true; per: number; max?: number }
  /** floor(coins / n) × per, of the beneficiary (`self`, default) or the visitor (`target`). */
  | { coinsHeldDiv: number; per: number; of?: 'self' | 'target'; max?: number }
  | { cornersPassed: true; per: number; max?: number };

export type Cond =
  | { flag: string; op: '>' | '=='; value: number }
  | { adjacentWithTag: Tag; min: number }
  | { dieTotal: '>=' | '<='; value: number }
  // shared board only
  | { adjacentToCorner: true }
  /** The moving player is not the tile's owner. */
  | { visitor: true };

export type Effect =
  | { op: 'gain'; res: Resource; amount: Amount; who?: Who }
  | { op: 'lose'; res: Resource; amount: Amount; who: Who }
  | { op: 'steal'; res: Resource; amount: Amount }
  | { op: 'move'; by: Amount; who: Who }
  | { op: 'teleport'; to: 'start' | 'random' | 'nextCorner'; who: Who }
  /** `target` pays `self` min(amount, cap, what it has). If it cannot pay in full and `orElse` is given, `orElse` runs instead. */
  | { op: 'pay'; amount: Amount; res?: Resource; cap?: number; orElse?: Effect[] }
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
  /** Shared board: the class says who triggers the tile and who benefits. */
  class?: TileClass;
  /** Shared board: the class-driven effect list (loops tiles use the trigger lists). */
  effects?: Effect[];
  onLand?: Effect[];
  onPass?: Effect[];
  onTargeted?: Effect[];
  onLap?: Effect[];
  /** Expansion tiles only: the tile placed in the new slot, if any. */
  insertTile?: TileId;
};

export type LandmarkId = string;

/** Permanent effects of owning a landmark; the engine consults them. */
export type Passive = Partial<{
  /** Others cannot build over any of the owner's tiles. */
  noReplace: true;
  /** The owner gains this many coins each time one of their civic tiles fires. */
  civicBonus: number;
  /** The owner's dice all have this many sides. */
  dieSides: number;
  /** Shop tiles cost the owner this much less (min 0). */
  shopDiscount: number;
  /** At game end the owner gains floor(tilesOwned / n) VP. */
  endGameVpPerTiles: number;
  /** The owner gains this much VP when a visitor lands on the landmark. */
  visitorLandVp: number;
  /** Tolls cost the owner nothing. */
  tollFree: true;
}>;

/** A landmark: a fixed menu item (not in the bag), one of each per player. */
export type LandmarkDef = {
  id: LandmarkId;
  name: string;
  cost: number;
  /** Fire when the owner's own token passes or lands. */
  effects: Effect[];
  passive?: Passive;
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
 * Every end mode the engine implements. `vpPool` and `landmarkRace` are
 * typed apart from `EndMode` because web/ switches exhaustively over
 * `EndMode`; set them with `VP_POOL_MODE` / `LANDMARK_RACE_MODE` (engine.ts)
 * or a cast. `landmarkRace`: endValue is the landmarks a player must own.
 */
export type SimEndMode = EndMode | 'vpPool' | 'landmarkRace';

export type BoardMode = 'loops' | 'shared';

export type GameConfig = {
  players: number;
  /** Loops mode: slots per player board. */
  boardSize: number;
  /** 'loops' (one loop per player, default) or 'shared' (one loop for everyone, tiles are owned). */
  boardMode: BoardMode;
  /** Shared mode: slots per side (one corner plus tile slots); the board has players × sideLength slots. */
  sideLength: number;
  /** Shared mode: coins for passing or landing on a corner; double on your own. */
  cornerIncome: number;
  /** The dice every player starts with. */
  startDice: DieSpec[];
  /** Shared mode: fraction of the displaced tile's cost refunded to its owner in a buyout. */
  buyoutRefund: number;
  /** Shared mode: tiles on a player's own side cannot be bought out. */
  protectOwnSide: boolean;
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
  /** Shared mode: the landmark menu (not in the bag). */
  landmarkSet: LandmarkDef[];
};

/** A point in turn order: the turn of `player` in `round`. */
export type TurnRef = { round: number; player: number };

export type Modifier =
  | { kind: 'flag'; player: number; flag: string; value: number; until: TurnRef }
  | { kind: 'dice'; player: number; sides: number; until: TurnRef }
  | { kind: 'lock'; player: number; slot: number; until: TurnRef };

export type PlayerState = {
  id: number;
  board: (TileId | null)[]; // loop; index 0 is Start and never holds a tile. [] in shared mode
  position: number;
  coins: number;
  vp: number;
  /** Own Start passed (shared mode: own corner passed). */
  laps: number;
  /** Shared mode: corners passed or landed on, any owner's. 0 in loops mode. */
  cornersPassed: number;
  /** Shared mode: landmarks bought. */
  landmarks: LandmarkId[];
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

/** One slot of the shared loop. `tile` holds a tile id or a landmark id. */
export type SharedSlot = { tile: TileId | LandmarkId | null; owner: number | null; corner: number | null };
export type SharedState = { slots: SharedSlot[] };

export type GameState = {
  config: GameConfig;
  rngState: number;
  round: number;
  activePlayer: number;
  phase: Phase;
  shopActionsLeft: number;
  players: PlayerState[];
  /** Present only in shared mode. */
  shared?: SharedState;
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
  | { type: 'buyLandmark'; landmarkId: LandmarkId; slot: number }
  | { type: 'pass' };

export type Standing = { player: number; vp: number; coins: number };

export type Event =
  | { t: 'rolled'; player: number; dice: number[]; total: number; round: number }
  | { t: 'moved'; player: number; from: number; to: number; passedStart: boolean }
  | { t: 'lap'; player: number; laps: number; income: number }
  /** Shared mode also sets `owner` (of the tile) and `slot`; `player` is the token that triggered it. */
  | { t: 'tileFired'; player: number; tile: TileId; trigger: Trigger; owner?: number; slot?: number }
  | { t: 'resource'; player: number; res: Resource; delta: number; source: TileId | ModId | 'lap' | 'sale' | 'endgame' | 'buyout' | 'corner' }
  | { t: 'attacked'; attacker: number; target: number; tile: TileId; cancelled: boolean }
  /** `displaced` (shared mode): the player whose tile was bought out. */
  | { t: 'bought'; player: number; item: TileId | ModId | LandmarkId; cost: number; slot?: number; displaced?: number }
  | { t: 'sold'; player: number; tile: TileId; refund: number }
  | { t: 'expanded'; player: number; afterSlot: number; size: number }
  /** Shared mode. `amount` is the coins actually paid (0 if skipped); `vp` is set when VP changed hands. */
  | { t: 'toll'; payer: number; owner: number; tile: TileId; amount: number; vp?: number }
  | { t: 'corner'; player: number; own: boolean; income: number }
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
