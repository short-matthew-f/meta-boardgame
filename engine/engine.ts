// Pure game engine: createGame / legalActions / step.
// `step` never mutates its input; it clones, mutates the clone, and returns
// the clone with the events it caused. All randomness goes through
// state.rngState so (seed, actions[]) replays exactly.

import type {
  Action, Effect, EndMode, GameConfig, GameState, PendingChoice, PlayerState, QueuedTrigger, RollContext,
  SimEndMode, Standing, StepResult, TileId, Trigger,
} from './types.ts';
import { rngInt, rngShuffle, seedToState } from './rng.ts';
import { activeTile, effectiveDice, hasTag, isLocked, ownedCost, ownedCount, tileDef } from './board.ts';
import {
  type Ctx, type EffectCtx, changeResource, consumeFlag, enqueueForwardMove, getFlag, runEffects,
} from './effects.ts';
import {
  awardPassiveEndVp, mostLandmarks, sharedBuyActions, sharedBuyLandmark, sharedBuyTile, sharedForwardMove,
  sharedSellActions, sharedSellTile,
} from './shared.ts';
import { makeSharedSlots } from './sharedBoard.ts';

export { evalAmount, getFlag } from './effects.ts';

// ---------------------------------------------------------------------------
// Config

export const BASE_CONFIG: Omit<GameConfig, 'tileSet' | 'modSet'> = {
  players: 4,
  boardSize: 8,
  boardMode: 'loops',
  sideLength: 10,
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
  return { ...BASE_CONFIG, tileSet: [], modSet: [], ...overrides };
}

// ---------------------------------------------------------------------------
// Setup

function freshRollContext(): RollContext {
  return { queue: [], choice: null, rollAgain: false, lastTotal: 0, chain: 0 };
}

export function createGame(config: GameConfig, seed: number): GameState {
  if (config.players < 2) throw new Error('need at least 2 players');
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
      position: 0,
      coins: config.startCoins,
      vp: 0,
      laps: 0,
      cornersPassed: 0,
      landmarks: [],
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

function resolveTileTrigger(ctx: Ctx, item: Extract<QueuedTrigger, { kind: 'tile' }>): void {
  const st = ctx.st;
  if (isLocked(st, item.player, item.slot)) return;
  const def = tileDef(st.config, item.tile);
  const effects = def[item.effectsOf ?? item.trigger];
  if (!effects) return;
  if (needsTarget(effects)) {
    st.pending!.choice = { kind: 'chooseTarget', player: item.player, slot: item.slot, tile: item.tile, trigger: item.trigger, ...(item.effectsOf ? { effectsOf: item.effectsOf } : {}) };
    return;
  }
  ctx.events.push({ t: 'tileFired', player: item.player, tile: item.tile, trigger: item.trigger });
  runEffects(ctx, effects, { self: item.player, target: null, slot: item.slot, source: item.tile, coinLoss: new Map() });
}

export function needsTarget(effects: Effect[]): boolean {
  for (const e of effects) {
    if ('who' in e && e.who === 'target') return true;
    if (e.op === 'steal') return true;
    if (e.op === 'if' && (needsTarget(e.then) || (e.else ? needsTarget(e.else) : false))) return true;
  }
  return false;
}

function runAttack(ctx: Ctx, attacker: number, slot: number, tile: TileId, trigger: Trigger, target: number, effectsOf?: Trigger): void {
  const st = ctx.st;
  const def = tileDef(st.config, tile);
  const effects = def[effectsOf ?? trigger] ?? [];
  // Shield: cancels the whole attack and is consumed.
  if (getFlag(st, target, 'shielded') > 0) {
    consumeFlag(st, target, 'shielded');
    ctx.events.push({ t: 'attacked', attacker, target, tile, cancelled: true });
    return;
  }
  ctx.events.push({ t: 'attacked', attacker, target, tile, cancelled: false });
  ctx.events.push({ t: 'tileFired', player: attacker, tile, trigger });
  // Defender's onTargeted tiles. `reflect` runs first; the rest after the attack.
  const tp = st.players[target]!;
  const defenses: { slot: number; tile: TileId; effects: Effect[] }[] = [];
  for (let s = 1; s < tp.board.length; s++) {
    const d = activeTile(st, target, s);
    if (d?.onTargeted) defenses.push({ slot: s, tile: d.id, effects: d.onTargeted });
  }
  let reflect = 0;
  for (const d of defenses) for (const e of d.effects) if (e.op === 'reflect') reflect += e.fraction;
  reflect = Math.min(1, reflect);

  const ec: EffectCtx = { self: attacker, target, slot, source: tile, coinLoss: new Map() };
  runEffects(ctx, effects, ec);

  const lost = ec.coinLoss.get(target) ?? 0;
  if (reflect > 0 && lost > 0) {
    const back = Math.floor(lost * reflect);
    const reflector = defenses.find((d) => d.effects.some((e) => e.op === 'reflect'))!;
    if (back > 0) {
      ctx.events.push({ t: 'tileFired', player: target, tile: reflector.tile, trigger: 'onTargeted' });
      changeResource(ctx, attacker, 'coins', -back, reflector.tile);
    }
  }
  for (const d of defenses) {
    const rest = d.effects.filter((e) => e.op !== 'reflect');
    if (rest.length === 0) continue;
    ctx.events.push({ t: 'tileFired', player: target, tile: d.tile, trigger: 'onTargeted' });
    runEffects(ctx, rest, { self: target, target: attacker, slot: d.slot, source: d.tile, coinLoss: new Map() });
  }
}

// ---------------------------------------------------------------------------
// Shop phase

function pay(ctx: Ctx, player: number, cost: number, source: string): void {
  if (cost !== 0) changeResource(ctx, player, 'coins', -cost, source);
}

function buyTile(ctx: Ctx, shopIndex: number, slot: number): void {
  const st = ctx.st;
  const me = st.activePlayer;
  const p = st.players[me]!;
  const id = st.shop[shopIndex]!;
  const def = tileDef(st.config, id);
  pay(ctx, me, def.cost, id);
  st.shop.splice(shopIndex, 1);
  const old = p.board[slot];
  if (old != null) {
    st.discard.push(old);
    st.roundModifiers = st.roundModifiers.filter((m) => !(m.kind === 'lock' && m.player === me && m.slot === slot));
  }
  p.board[slot] = id;
  ctx.events.push({ t: 'bought', player: me, item: id, cost: def.cost, slot });
}

function buyExpansion(ctx: Ctx, shopIndex: number, afterSlot: number): void {
  const st = ctx.st;
  const me = st.activePlayer;
  const p = st.players[me]!;
  const id = st.shop[shopIndex]!;
  const def = tileDef(st.config, id);
  pay(ctx, me, def.cost, id);
  st.shop.splice(shopIndex, 1);
  st.discard.push(id);
  p.board.splice(afterSlot + 1, 0, def.insertTile ?? null);
  if (p.position > afterSlot) p.position += 1;
  st.roundModifiers = st.roundModifiers.map((m) =>
    m.kind === 'lock' && m.player === me && m.slot > afterSlot ? { ...m, slot: m.slot + 1 } : m,
  );
  ctx.events.push({ t: 'bought', player: me, item: id, cost: def.cost, slot: afterSlot + 1 });
  ctx.events.push({ t: 'expanded', player: me, afterSlot, size: p.board.length });
}

function buyMod(ctx: Ctx, modId: string): void {
  const st = ctx.st;
  const me = st.activePlayer;
  const def = st.config.modSet.find((m) => m.id === modId)!;
  pay(ctx, me, def.cost, modId);
  ctx.events.push({ t: 'bought', player: me, item: modId, cost: def.cost });
  runEffects(ctx, def.effects, { self: me, target: null, slot: null, source: modId, coinLoss: new Map() });
  if (def.scope !== 'round') st.players[me]!.mods.push(modId);
}

function sellTile(ctx: Ctx, slot: number): void {
  const st = ctx.st;
  const me = st.activePlayer;
  const p = st.players[me]!;
  const id = p.board[slot]!;
  const def = tileDef(st.config, id);
  const refund = Math.floor(def.cost * st.config.sellRefund);
  p.board[slot] = null;
  st.discard.push(id);
  st.roundModifiers = st.roundModifiers.filter((m) => !(m.kind === 'lock' && m.player === me && m.slot === slot));
  ctx.events.push({ t: 'sold', player: me, tile: id, refund });
  if (refund > 0) changeResource(ctx, me, 'coins', refund, 'sale');
}

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

function checkEndTrigger(st: GameState): void {
  if (st.endTrigger) return;
  const c = st.config;
  const mode = c.endMode as SimEndMode;
  if (mode === 'vpPool') {
    let total = 0;
    for (const p of st.players) total += p.vp;
    if (total >= c.endValue) st.endTrigger = { reason: 'vpPool', endsAfterRound: st.round };
  } else if (mode === 'landmarkRace') {
    if (mostLandmarks(st) >= c.endValue) st.endTrigger = { reason: 'landmarkRace', endsAfterRound: st.round };
  } else if (c.endMode === 'vpRace' && st.players.some((p) => p.vp >= c.endValue)) {
    st.endTrigger = { reason: 'vpRace', endsAfterRound: st.round };
  } else if (c.endMode === 'lapRace' && st.players.some((p) => p.laps >= c.endValue)) {
    st.endTrigger = { reason: 'lapRace', endsAfterRound: st.round };
  }
}

export function standings(st: GameState): Standing[] {
  return st.players.map((p) => ({ player: p.id, vp: p.vp, coins: p.coins }));
}

/** Highest VP wins; ties break on coins, then on fewer tiles, then lower seat. */
export function rankPlayers(st: GameState): number[] {
  return st.players
    .map((p) => p.id)
    .sort((a, b) => {
      const pa = st.players[a]!, pb = st.players[b]!;
      if (pb.vp !== pa.vp) return pb.vp - pa.vp;
      if (pb.coins !== pa.coins) return pb.coins - pa.coins;
      const ta = ownedCount(st, a), tb = ownedCount(st, b);
      if (ta !== tb) return ta - tb;
      return a - b;
    });
}

/** config.tileEndVp: floor(sum of owned tile costs × tileEndVp) VP per player, once, at game end. */
function awardTileEndVp(ctx: Ctx): void {
  const st = ctx.st;
  if (!(st.config.tileEndVp > 0)) return;
  for (const p of st.players) {
    const cost = ownedCost(st, p.id);
    // epsilon guards floor() against float error such as 0.34 × 100 = 34.00000000000001
    const vp = Math.floor(cost * st.config.tileEndVp + 1e-9);
    if (vp > 0) changeResource(ctx, p.id, 'vp', vp, 'endgame');
  }
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
