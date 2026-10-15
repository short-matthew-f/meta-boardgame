// Pure game engine: createGame / legalActions / step.
// `step` never mutates its input; it clones, mutates the clone, and returns
// the clone with the events it caused. All randomness goes through
// state.rngState so (seed, actions[]) replays exactly.

import type {
  Action, EndMode, GameConfig, GameState, PendingChoice, PlayerState, QueuedTrigger, RollContext, StepResult, TileId,
} from './types.ts';
import { rngInt, rngShuffle, seedToState } from './rng.ts';
import { activeTile, effectiveDice, hasTag, tileDef } from './board.ts';
import { type Ctx, enqueueForwardMove } from './effects.ts';
import { resolveTileTrigger, runAttack } from './attack.ts';
import { buyExpansion, buyMod, buyTile, sellTile } from './loopsShop.ts';
import { awardTileEndVp, checkEndTrigger, rankPlayers, standings } from './endgame.ts';
import {
  awardPassiveEndVp, sharedBuyActions, sharedBuyLandmark, sharedBuyTile, sharedForwardMove, sharedSellActions,
  sharedSellTile,
} from './shared.ts';
import { makeSharedSlots } from './sharedBoard.ts';

export { evalAmount, getFlag } from './effects.ts';
export { needsTarget } from './attack.ts';
export { rankPlayers, standings } from './endgame.ts';

// ---------------------------------------------------------------------------
// Config

export const BASE_CONFIG: Omit<GameConfig, 'tileSet' | 'modSet'> = {
  players: 4,
  boardSize: 8,
  boardMode: 'loops',
  sideLength: 10,
  catchUpCoins: 0,
  tollOnPass: 0,
  buyoutPremium: 0,
  replacementTax: 0,
  replacementTaxEscalates: false,
  cornerIncome: 2,
  startDice: [{ sides: 6 }],
  buyoutRefund: 0.5,
  protectOwnSide: false,
  landmarkSet: [],
  startCoins: 5,
  lapIncome: 3,
  shopSize: 6,
  shopActions: 1,
  shopCycle: 1,
  endMode: 'turnCap',
  endValue: 15,
  maxRounds: 50,
  maxTriggerChain: 12,
  sellRefund: 0.5,
  fireOnPass: false,
  landBonus: 1,
  tileEndVp: 0,
};

/** The experimental `vpPool` end mode, typed as EndMode (see SimEndMode in types.ts). */
export const VP_POOL_MODE = 'vpPool' as EndMode;
/** The sim-only `landmarkRace` end mode (shared board): endValue is the landmarks a player must own. */
export const LANDMARK_RACE_MODE = 'landmarkRace' as EndMode;

export function makeConfig(overrides: Partial<GameConfig> = {}): GameConfig {
  return resolvePerimeter({ ...BASE_CONFIG, tileSet: [], modSet: [], ...overrides });
}

/**
 * Shared mode with `perimeter` set: `sideLength = perimeter / players`. Returns the config unchanged when
 * there is nothing to resolve or it does not divide (createGame throws in that case).
 */
export function resolvePerimeter(config: GameConfig): GameConfig {
  const per = config.perimeter;
  if (per == null || config.boardMode !== 'shared') return config;
  const side = per / config.players;
  if (!Number.isInteger(side) || side === config.sideLength) return config;
  return { ...config, sideLength: side };
}

/** Throws on option values the engine cannot play. */
function validateConfig(config: GameConfig): void {
  if (config.players < 2) throw new Error('need at least 2 players');
  const num = (name: string, v: number, min: number, max = Infinity) => {
    if (!Number.isFinite(v) || v < min || v > max) throw new Error(`${name} must be a number from ${min}${max < Infinity ? ` to ${max}` : ''}, got ${v}`);
  };
  num('catchUpCoins', config.catchUpCoins, 0);
  num('tollOnPass', config.tollOnPass, 0, 1);
  num('buyoutPremium', config.buyoutPremium, 0);
  num('replacementTax', config.replacementTax, 0);
  if (config.perimeter != null && config.boardMode === 'shared') {
    const side = config.perimeter / config.players;
    if (!Number.isInteger(side)) throw new Error(`perimeter ${config.perimeter} does not divide by ${config.players} players`);
  }
}

// ---------------------------------------------------------------------------
// Setup

function freshRollContext(): RollContext {
  return { queue: [], choice: null, rollAgain: false, lastTotal: 0, chain: 0 };
}

export function createGame(input: GameConfig, seed: number): GameState {
  validateConfig(input);
  const config = resolvePerimeter(input);
  let rng = seedToState(seed);
  const bagIds: TileId[] = [];
  for (const t of config.tileSet) for (let i = 0; i < t.copies; i++) bagIds.push(t.id);
  let bag: TileId[];
  [rng, bag] = rngShuffle(rng, bagIds);
  const shop = bag.splice(0, config.shopSize);
  const shared = config.boardMode === 'shared';
  if (shared && config.sideLength < 2) throw new Error('sideLength must be at least 2');
  const players: PlayerState[] = [];
  for (let i = 0; i < config.players; i++) {
    players.push({
      id: i,
      board: shared ? [] : new Array<TileId | null>(config.boardSize).fill(null),
      position: shared ? i * config.sideLength : 0, // shared mode: each token starts on its own corner
      coins: config.startCoins + i * config.catchUpCoins,
      vp: 0,
      laps: 0,
      cornersPassed: 0,
      landmarks: [],
      replacements: 0,
      dice: config.startDice.map((d) => ({ ...d })),
      mods: [],
      flags: {},
    });
  }
  return {
    config,
    rngState: rng,
    round: 1,
    activePlayer: 0,
    phase: 'roll',
    shopActionsLeft: 0,
    players,
    ...(shared ? { shared: { slots: makeSharedSlots(config) } } : {}),
    shop,
    bag,
    discard: [],
    roundModifiers: [],
    pending: freshRollContext(),
    endTrigger: config.endMode === 'turnCap' ? { reason: 'turnCap', endsAfterRound: config.endValue } : null,
    winner: null,
  };
}

// ---------------------------------------------------------------------------
// Cloning

export function cloneState(s: GameState): GameState {
  return {
    ...s,
    players: s.players.map((p) => ({
      ...p,
      board: p.board.slice(),
      dice: p.dice.map((d) => ({ ...d })),
      mods: p.mods.slice(),
      landmarks: p.landmarks.slice(),
      flags: { ...p.flags },
    })),
    ...(s.shared ? { shared: { slots: s.shared.slots.map((x) => ({ ...x })) } } : {}),
    shop: s.shop.slice(),
    bag: s.bag.slice(),
    discard: s.discard.slice(),
    roundModifiers: s.roundModifiers.slice(),
    pending: s.pending ? { ...s.pending, queue: s.pending.queue.slice(), choice: s.pending.choice ? { ...s.pending.choice } : null } : null,
    endTrigger: s.endTrigger ? { ...s.endTrigger } : null,
  };
}

// ---------------------------------------------------------------------------
// Action identity

export function actionKey(a: Action): string {
  const keys = Object.keys(a).sort();
  return keys.map((k) => `${k}=${String((a as Record<string, unknown>)[k])}`).join('|');
}

export function sameAction(a: Action, b: Action): boolean {
  return actionKey(a) === actionKey(b);
}

// ---------------------------------------------------------------------------
// Legal actions

export function legalActions(state: GameState): Action[] {
  if (state.phase === 'ended') return [];
  const me = state.activePlayer;
  if (state.phase === 'roll') {
    const choice = state.pending?.choice ?? null;
    if (choice) {
      if (choice.kind === 'chooseTarget') {
        const out: Action[] = [];
        for (let q = 0; q < state.players.length; q++) if (q !== me) out.push({ type: 'chooseTarget', player: q });
        return out;
      }
      return [{ type: 'reroll' }, { type: 'keepRoll' }];
    }
    return [{ type: 'roll' }];
  }
  // shop
  const out: Action[] = [];
  const p = state.players[me]!;
  if (state.shopActionsLeft > 0) {
    const size = p.board.length;
    if (state.shared) out.push(...sharedBuyActions(state));
    else for (let i = 0; i < state.shop.length; i++) {
      const def = tileDef(state.config, state.shop[i]!);
      if (def.cost > p.coins) continue;
      if (hasTag(def, 'expansion')) {
        for (let s = 0; s < size; s++) out.push({ type: 'buyExpansion', shopIndex: i, afterSlot: s });
      } else {
        for (let s = 1; s < size; s++) out.push({ type: 'buyTile', shopIndex: i, slot: s });
      }
    }
    for (const m of state.config.modSet) {
      if (m.cost > p.coins) continue;
      if ((m.scope === 'persistent' || m.scope === 'consumable') && p.mods.includes(m.id)) continue;
      out.push({ type: 'buyMod', modId: m.id });
    }
    if (state.shared) out.push(...sharedSellActions(state));
    else for (let s = 1; s < size; s++) if (p.board[s] != null) out.push({ type: 'sellTile', slot: s });
  }
  out.push({ type: 'pass' });
  return out;
}

// ---------------------------------------------------------------------------
// Step

export function step(state: GameState, action: Action): StepResult {
  const legal = legalActions(state);
  const key = actionKey(action);
  if (!legal.some((a) => actionKey(a) === key)) {
    throw new Error(`illegal action ${key} in phase ${state.phase} (round ${state.round}, player ${state.activePlayer})`);
  }
  const ctx: Ctx = { st: cloneState(state), events: [], forcedDice: null, allowReroll: true };
  applyAction(ctx, action);
  return { state: ctx.st, events: ctx.events };
}

function applyAction(ctx: Ctx, action: Action): void {
  const st = ctx.st;
  switch (action.type) {
    case 'roll':
      doRoll(ctx);
      return;
    case 'reroll': {
      const p = st.players[st.activePlayer]!;
      const idx = p.mods.findIndex((id) => st.config.modSet.find((m) => m.id === id)?.grants === 'reroll');
      if (idx >= 0) p.mods.splice(idx, 1);
      st.pending!.choice = null;
      doRoll(ctx);
      return;
    }
    case 'keepRoll': {
      const choice = st.pending!.choice as Extract<PendingChoice, { kind: 'reroll' }>;
      st.pending!.choice = null;
      applyMove(ctx, choice.dice.reduce((a, b) => a + b, 0));
      return;
    }
    case 'chooseTarget': {
      const choice = st.pending!.choice as Extract<PendingChoice, { kind: 'chooseTarget' }>;
      st.pending!.choice = null;
      runAttack(ctx, choice.player, choice.slot, choice.tile, choice.trigger, action.player, choice.effectsOf);
      drainQueue(ctx);
      return;
    }
    case 'buyTile':
      if (st.shared) sharedBuyTile(ctx, action.shopIndex, action.slot);
      else buyTile(ctx, action.shopIndex, action.slot);
      afterShopAction(ctx);
      return;
    case 'buyLandmark':
      sharedBuyLandmark(ctx, action.landmarkId, action.slot);
      afterShopAction(ctx);
      return;
    case 'buyExpansion':
      buyExpansion(ctx, action.shopIndex, action.afterSlot);
      afterShopAction(ctx);
      return;
    case 'buyMod':
      buyMod(ctx, action.modId);
      afterShopAction(ctx);
      return;
    case 'sellTile':
      if (st.shared) sharedSellTile(ctx, action.slot);
      else sellTile(ctx, action.slot);
      afterShopAction(ctx);
      return;
    case 'pass':
      endTurn(ctx);
      return;
  }
}

// ---------------------------------------------------------------------------
// Roll phase

function doRoll(ctx: Ctx): void {
  const st = ctx.st;
  const me = st.activePlayer;
  const dice = effectiveDice(st, me);
  let values: number[];
  if (ctx.forcedDice) {
    values = ctx.forcedDice;
    ctx.forcedDice = null;
  } else {
    values = [];
    for (const d of dice) {
      let v: number;
      [st.rngState, v] = rngInt(st.rngState, d.sides);
      values.push(v + 1);
    }
  }
  const total = values.reduce((a, b) => a + b, 0);
  ctx.events.push({ t: 'rolled', player: me, dice: values, total, round: st.round });
  st.pending!.lastTotal = total;
  const p = st.players[me]!;
  const hasReroll = ctx.allowReroll && p.mods.some((id) => st.config.modSet.find((m) => m.id === id)?.grants === 'reroll');
  if (hasReroll) {
    st.pending!.choice = { kind: 'reroll', player: me, dice: values };
    return;
  }
  applyMove(ctx, total);
}

/** Move the active player's token forward, queue everything it triggers, then resolve. */
function applyMove(ctx: Ctx, by: number): void {
  if (ctx.st.shared) {
    sharedForwardMove(ctx, ctx.st.activePlayer, by);
    finishRoll(ctx);
    return;
  }
  enqueueForwardMove(ctx, ctx.st.activePlayer, by);
  drainQueue(ctx);
}

function drainQueue(ctx: Ctx): void {
  const st = ctx.st;
  const ctxPending = st.pending!;
  while (ctxPending.queue.length > 0 && !ctxPending.choice) {
    const item = ctxPending.queue.shift()!;
    if (item.kind === 'lapIncome') {
      const p = st.players[item.player]!;
      p.laps += 1;
      p.coins += st.config.lapIncome;
      ctx.events.push({ t: 'lap', player: item.player, laps: p.laps, income: st.config.lapIncome });
      if (st.config.lapIncome !== 0) ctx.events.push({ t: 'resource', player: item.player, res: 'coins', delta: st.config.lapIncome, source: 'lap' });
      continue;
    }
    if (item.kind === 'land') {
      if (item.slot === 0) continue;
      const def = activeTile(st, item.player, item.slot);
      if (!def || !def.onLand) continue;
      const fire: Extract<QueuedTrigger, { kind: 'tile' }> = { kind: 'tile', player: item.player, slot: item.slot, tile: def.id, trigger: 'onLand' };
      // Extra runs go to the front of the queue so they resolve right after the first (and after its target prompt, if any).
      const extra = hasTag(def, 'mover') ? 0 : Math.max(0, Math.floor(st.config.landBonus) - 1);
      for (let k = 0; k < extra; k++) ctxPending.queue.unshift({ ...fire });
      resolveTileTrigger(ctx, fire);
      continue;
    }
    resolveTileTrigger(ctx, item);
  }
  if (ctxPending.choice) return;
  finishRoll(ctx);
}

/** After a roll's moves and triggers: roll again if a tile said so, else open the shop. */
function finishRoll(ctx: Ctx): void {
  const st = ctx.st;
  const ctxPending = st.pending!;
  if (ctxPending.rollAgain) {
    ctxPending.rollAgain = false;
    ctxPending.chain += 1;
    if (ctxPending.chain <= st.config.maxTriggerChain) {
      doRoll(ctx);
      return;
    }
  }
  // enter shop phase
  st.phase = 'shop';
  st.shopActionsLeft = st.config.shopActions;
}


// ---------------------------------------------------------------------------
// Shop phase


function afterShopAction(ctx: Ctx): void {
  ctx.st.shopActionsLeft -= 1;
  if (ctx.st.shopActionsLeft <= 0) endTurn(ctx);
}

// ---------------------------------------------------------------------------
// Turn / round end

function refillShop(ctx: Ctx): void {
  const st = ctx.st;
  const before = st.shop.join(',');
  while (st.shop.length < st.config.shopSize) {
    if (st.bag.length === 0) {
      if (st.discard.length === 0) break;
      [st.rngState, st.bag] = rngShuffle(st.rngState, st.discard);
      st.discard = [];
    }
    st.shop.push(st.bag.shift()!);
  }
  if (st.shop.join(',') !== before) ctx.events.push({ t: 'shopRefilled', shop: st.shop.slice() });
}

function expireModifiers(st: GameState): void {
  const r = st.round;
  const p = st.activePlayer;
  st.roundModifiers = st.roundModifiers.filter((m) => !(m.until.round < r || (m.until.round === r && m.until.player <= p)));
}


function endTurn(ctx: Ctx): void {
  const st = ctx.st;
  refillShop(ctx);
  expireModifiers(st);
  checkEndTrigger(st);
  st.shopActionsLeft = 0;
  if (st.activePlayer + 1 < st.players.length) {
    st.activePlayer += 1;
    st.phase = 'roll';
    st.pending = freshRollContext();
    return;
  }
  // round end: cycle the oldest unbought shop tiles so a stale shop cannot lock the game
  if (st.config.shopCycle > 0 && st.shop.length > 0) {
    const stale = st.shop.splice(0, Math.min(st.config.shopCycle, st.shop.length));
    st.discard.push(...stale);
    refillShop(ctx);
  }
  let reason: string | null = null;
  if (st.endTrigger && st.round >= st.endTrigger.endsAfterRound) reason = st.endTrigger.reason;
  else if (st.round >= st.config.maxRounds) reason = 'maxRounds';
  // End-of-game VP lands before the final roundEnded, so standings, ranking and metrics all see it.
  if (reason) {
    awardTileEndVp(ctx);
    if (st.shared) awardPassiveEndVp(ctx);
  }
  ctx.events.push({ t: 'roundEnded', round: st.round, standings: standings(st) });
  if (reason) {
    st.phase = 'ended';
    st.pending = null;
    st.winner = rankPlayers(st)[0]!;
    ctx.events.push({ t: 'gameEnded', reason, winner: st.winner, rounds: st.round });
    return;
  }
  st.round += 1;
  st.activePlayer = 0;
  st.phase = 'roll';
  st.pending = freshRollContext();
}

// ---------------------------------------------------------------------------
// Hypothetical roll (for lookahead bots). Not part of the replayable action
// stream: it builds a what-if state in which `player` rolls `dice` right now.

export function previewRoll(
  state: GameState,
  player: number,
  dice: number[],
  pickTarget: (s: GameState, legal: Action[]) => Action,
): GameState {
  const st = cloneState(state);
  st.activePlayer = player;
  st.phase = 'roll';
  st.pending = freshRollContext();
  const ctx: Ctx = { st, events: [], forcedDice: dice, allowReroll: false };
  doRoll(ctx);
  let guard = 0;
  while (st.phase === 'roll' && st.pending?.choice && guard++ < 50) {
    const legal = legalActions(st);
    const a = pickTarget(st, legal);
    applyAction(ctx, a);
  }
  return st;
}
