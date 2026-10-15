// Shared-board mode rules: every player's token moves on ONE loop, tiles are
// owned, and a tile's class decides whose token triggers it and who benefits.
// engine.ts dispatches here when `state.shared` exists; the loops engine is
// untouched. Geometry and counts are in sharedBoard.ts, the effect
// interpreter in effects.ts (the two import each other; only functions).
//
// Trigger rules, for the token of M passing or landing on a slot with a tile
// of class C owned by O:
//   civic     pass and land, beneficiary O
//   private   only if M === O, pass and land (landing runs the list landBonus times)
//   toll      only if M !== O and only on landing: O is paid by M (config.tollOnPass > 0: a plain coin toll also
//             charges a fraction when M passes it)
//   public    only on landing: the visitor M benefits (the list runs twice if M === O)
//   landmark  like private, landing once; passives are read by the engine
// Tiles tagged `mover` never fire on a pass and run once on landing.
import type { Action, Effect, Event, GameState, LandmarkDef, TileDef, Trigger } from './types.ts';
import { rngInt } from './rng.ts';
import { tileDef } from './board.ts';
import {
  type Ctx, type EffectCtx, changeResource, consumeFlag, evalAmount, getFlag, newEc, runEffects,
} from './effects.ts';
import {
  buyoutPremium, discountedCost, replacementTax, hasPassive, isCorner, itemCost, landmarkDef, nextCorner, ownedSharedCount, sharedSize,
  sharedTileDef, sideOf,
} from './sharedBoard.ts';

// ---------------------------------------------------------------------------
// Movement

function relocate(ctx: Ctx, player: number, to: number): void {
  const p = ctx.st.players[player]!;
  const from = p.position;
  p.position = to;
  ctx.events.push({ t: 'moved', player, from, to, passedStart: false });
}

/** Teleport: 'start' is the player's own corner, 'nextCorner' the next corner clockwise. No corner income; the arrival slot does not fire. */
export function sharedTeleport(ctx: Ctx, player: number, to: 'start' | 'random' | 'nextCorner'): void {
  const st = ctx.st;
  const c = st.config;
  if (to === 'start') relocate(ctx, player, player * c.sideLength);
  else if (to === 'nextCorner') relocate(ctx, player, nextCorner(c, st.players[player]!.position));
  else {
    let i: number;
    [st.rngState, i] = rngInt(st.rngState, sharedSize(c));
    relocate(ctx, player, i);
  }
}

/** The effect-driven `move`: the active player's forward moves trigger what they pass; anything else just relocates. */
export function sharedMoveToken(ctx: Ctx, player: number, by: number): void {
  const st = ctx.st;
  const size = sharedSize(st.config);
  const p = st.players[player]!;
  if (player === st.activePlayer && by > 0 && st.pending) {
    st.pending.chain += 1;
    if (st.pending.chain <= st.config.maxTriggerChain) {
      sharedForwardMove(ctx, player, by);
      return;
    }
    relocate(ctx, player, (p.position + by) % size);
    return;
  }
  relocate(ctx, player, (((p.position + by) % size) + size) % size);
}

/**
 * Move a token forward `by` slots. Slots are resolved in path order: corners
 * pay income inline, tiles passed fire as passes, then the landing slot fires.
 */
export function sharedForwardMove(ctx: Ctx, player: number, by: number): void {
  const st = ctx.st;
  const c = st.config;
  const p = st.players[player]!;
  const size = sharedSize(c);
  const from = p.position;
  const to = (from + by) % size;
  const own = player * c.sideLength;
  let passedOwn = false;
  for (let i = 1; i <= by; i++) if ((from + i) % size === own) { passedOwn = true; break; }
  p.position = to;
  ctx.events.push({ t: 'moved', player, from, to, passedStart: passedOwn });
  for (let i = 1; i <= by; i++) {
    const slot = (from + i) % size;
    if (isCorner(c, slot)) cornerReached(ctx, player, slot);
    else fireSlot(ctx, player, slot, i < by ? 'onPass' : 'onLand');
  }
}

function cornerReached(ctx: Ctx, player: number, slot: number): void {
  const st = ctx.st;
  const p = st.players[player]!;
  const own = slot / st.config.sideLength === player;
  const income = own ? st.config.cornerIncome * 2 : st.config.cornerIncome;
  p.cornersPassed += 1;
  ctx.events.push({ t: 'corner', player, own, income });
  if (income !== 0) changeResource(ctx, player, 'coins', income, 'corner');
  if (own) {
    p.laps += 1;
    ctx.events.push({ t: 'lap', player, laps: p.laps, income: 0 });
  }
}

// ---------------------------------------------------------------------------
// Firing

function fireEc(owner: number, mover: number, self: number, target: number | null, slot: number, source: string): EffectCtx {
  return { ...newEc(self, target, slot, source), owner, mover };
}

function fireSlot(ctx: Ctx, mover: number, slot: number, trigger: Trigger): void {
  const st = ctx.st;
  const cfg = st.config;
  const s = st.shared!.slots[slot]!;
  if (s.tile == null || s.owner == null) return;
  const owner = s.owner;
  const lm = landmarkDef(cfg, s.tile);
  if (lm) {
    fireLandmark(ctx, mover, owner, slot, trigger, lm);
    return;
  }
  const def = sharedTileDef(cfg, s.tile);
  if (!def?.class || !def.effects) return;
  const mover_ = def.tags.includes('mover');
  const landing = trigger === 'onLand';
  switch (def.class) {
    case 'civic':
      runList(ctx, def, owner, mover, slot, trigger, owner, 1);
      break;
    case 'private': {
      if (mover !== owner || (mover_ && !landing)) return;
      runList(ctx, def, owner, mover, slot, trigger, owner, landing && !mover_ ? Math.max(1, Math.floor(cfg.landBonus)) : 1);
      break;
    }
    case 'toll':
      if (mover === owner) break;
      if (landing) fireToll(ctx, def, mover, owner, slot);
      else if (cfg.tollOnPass > 0 && isPlainCoinToll(def)) firePassToll(ctx, def, mover, owner, slot);
      break;
    case 'public':
      if (landing) runList(ctx, def, owner, mover, slot, trigger, mover, mover === owner && !mover_ ? 2 : 1);
      break;
  }
}

/** Run a tile's list `times` times with `self` as beneficiary, one tileFired each. */
function runList(ctx: Ctx, def: TileDef, owner: number, mover: number, slot: number, trigger: Trigger, self: number, times: number): void {
  for (let k = 0; k < times; k++) {
    ctx.events.push({ t: 'tileFired', player: mover, tile: def.id, trigger, owner, slot });
    runEffects(ctx, def.effects!, fireEc(owner, mover, self, null, slot, def.id));
    if (def.class === 'civic') {
      // civicBonus landmarks (Mint): the owner gains the bonus on every civic fire
      for (const id of ctx.st.players[owner]!.landmarks) {
        const n = landmarkDef(ctx.st.config, id)?.passive?.civicBonus ?? 0;
        if (n > 0) changeResource(ctx, owner, 'coins', n, id);
      }
    }
  }
}

/** The visitor pays the owner. Skipped (amount 0) by a tollFree landmark or by a tollFree flag, which is consumed. */
function fireToll(ctx: Ctx, def: TileDef, payer: number, owner: number, slot: number): void {
  const st = ctx.st;
  const toll: Extract<Event, { t: 'toll' }> = { t: 'toll', payer, owner, tile: def.id, amount: 0 };
  if (hasPassive(st, payer, 'tollFree')) {
    ctx.events.push(toll);
    return;
  }
  if (getFlag(st, payer, 'tollFree') > 0) {
    consumeFlag(st, payer, 'tollFree');
    ctx.events.push(toll);
    return;
  }
  ctx.events.push({ t: 'tileFired', player: payer, tile: def.id, trigger: 'onLand', owner, slot });
  ctx.events.push(toll);
  const ec = fireEc(owner, payer, owner, payer, slot, def.id);
  ec.paid = { coins: 0, vp: 0 };
  runEffects(ctx, def.effects!, ec);
  toll.amount = ec.paid.coins;
  if (ec.paid.vp > 0) toll.vp = ec.paid.vp;
}

/** A toll that can fire on a pass: its whole list is coin `pay`s with no `orElse` (Tollbooth, Bridge, Guard Post, Moneylender). Ferry, Inn, Tithe and Bandit Camp are landing-only. */
export function isPlainCoinToll(def: TileDef): boolean {
  const fx = def.effects;
  return !!fx && fx.length > 0 && fx.every((e) => e.op === 'pay' && (e.res ?? 'coins') === 'coins' && !e.orElse);
}

/**
 * config.tollOnPass: a visitor who passes a plain coin toll without landing pays floor(tollOnPass × pay)
 * (at least 1 when the fraction and the pay are positive), the pay being the amount the landing would charge
 * after its cap. tollFree (Harbour Master, or the flag, which is consumed) skips it like a landing.
 */
function firePassToll(ctx: Ctx, def: TileDef, payer: number, owner: number, slot: number): void {
  const st = ctx.st;
  const toll: Extract<Event, { t: 'toll' }> = { t: 'toll', payer, owner, tile: def.id, amount: 0, onPass: true };
  if (hasPassive(st, payer, 'tollFree')) {
    ctx.events.push(toll);
    return;
  }
  if (getFlag(st, payer, 'tollFree') > 0) {
    consumeFlag(st, payer, 'tollFree');
    ctx.events.push(toll);
    return;
  }
  ctx.events.push({ t: 'tileFired', player: payer, tile: def.id, trigger: 'onPass', owner, slot });
  ctx.events.push(toll);
  const ec = fireEc(owner, payer, owner, payer, slot, def.id);
  ec.paid = { coins: 0, vp: 0 };
  const scaled: Effect[] = [];
  for (const e of def.effects!) {
    if (e.op !== 'pay') continue;
    let full = evalAmount(st, e.amount, ec);
    if (e.cap != null) full = Math.min(full, e.cap);
    const part = full > 0 ? Math.max(1, Math.floor(full * st.config.tollOnPass + 1e-9)) : 0;
    scaled.push({ op: 'pay', amount: part });
  }
  runEffects(ctx, scaled, ec);
  toll.amount = ec.paid.coins;
}

function fireLandmark(ctx: Ctx, mover: number, owner: number, slot: number, trigger: Trigger, lm: LandmarkDef): void {
  if (mover === owner) {
    ctx.events.push({ t: 'tileFired', player: mover, tile: lm.id, trigger, owner, slot });
    runEffects(ctx, lm.effects, fireEc(owner, mover, owner, null, slot, lm.id));
  } else if (trigger === 'onLand' && lm.passive?.visitorLandVp) {
    changeResource(ctx, owner, 'vp', lm.passive.visitorLandVp, lm.id);
  }
}

// ---------------------------------------------------------------------------
// Shop phase

/** May `me` build over the tile at `slot`? Own tiles yes; another's unless City Walls (noReplace) or protectOwnSide stop it. Landmarks never. */
function canBuildOver(st: GameState, me: number, slot: number): boolean {
  const s = st.shared!.slots[slot]!;
  if (s.tile == null) return true;
  if (landmarkDef(st.config, s.tile)) return false;
  if (s.owner === me) return true;
  if (s.owner == null) return true;
  if (hasPassive(st, s.owner, 'noReplace')) return false;
  if (st.config.protectOwnSide && sideOf(st.config, slot) === s.owner) return false;
  return true;
}

/** buyTile for every buildable non-corner slot, then buyLandmark on empty or own-tile slots. */
export function sharedBuyActions(state: GameState): Action[] {
  const me = state.activePlayer;
  const p = state.players[me]!;
  const slots = state.shared!.slots;
  const buildable: number[] = [];
  const landmarkable: number[] = [];
  for (let i = 0; i < slots.length; i++) {
    if (isCorner(state.config, i) || !canBuildOver(state, me, i)) continue;
    buildable.push(i);
    if (slots[i]!.tile == null || slots[i]!.owner === me) landmarkable.push(i);
  }
  const out: Action[] = [];
  for (let i = 0; i < state.shop.length; i++) {
    const price = discountedCost(state, me, tileDef(state.config, state.shop[i]!).cost);
    if (price > p.coins) continue;
    for (const slot of buildable) if (price + buyoutPremium(state, me, slot) + replacementTax(state, me, slot) <= p.coins) out.push({ type: 'buyTile', shopIndex: i, slot });
  }
  for (const lm of state.config.landmarkSet) {
    if (lm.cost > p.coins || p.landmarks.includes(lm.id)) continue;
    for (const slot of landmarkable) if (lm.cost + replacementTax(state, me, slot) <= p.coins) out.push({ type: 'buyLandmark', landmarkId: lm.id, slot });
  }
  return out;
}

/** Sell any of my own tiles (never landmarks). */
export function sharedSellActions(state: GameState): Action[] {
  const me = state.activePlayer;
  const out: Action[] = [];
  state.shared!.slots.forEach((s, i) => {
    if (s.owner === me && s.tile != null && !landmarkDef(state.config, s.tile)) out.push({ type: 'sellTile', slot: i });
  });
  return out;
}

export function sharedBuyTile(ctx: Ctx, shopIndex: number, slot: number): void {
  const st = ctx.st;
  const me = st.activePlayer;
  const id = st.shop[shopIndex]!;
  const tax = replacementTax(st, me, slot);
  const cost = discountedCost(st, me, tileDef(st.config, id).cost) + buyoutPremium(st, me, slot) + tax;
  if (tax > 0) st.players[me]!.replacements += 1;
  if (cost !== 0) changeResource(ctx, me, 'coins', -cost, id);
  st.shop.splice(shopIndex, 1);
  const s = st.shared!.slots[slot]!;
  let displaced: number | undefined;
  if (s.tile != null) {
    st.discard.push(s.tile);
    if (s.owner != null && s.owner !== me) {
      displaced = s.owner;
      const refund = Math.floor(itemCost(st.config, s.tile) * st.config.buyoutRefund);
      if (refund > 0) changeResource(ctx, displaced, 'coins', refund, 'buyout');
    }
  }
  s.tile = id;
  s.owner = me;
  ctx.events.push({ t: 'bought', player: me, item: id, cost, slot, ...(displaced != null ? { displaced } : {}), ...(tax > 0 ? { tax } : {}) });
}

export function sharedBuyLandmark(ctx: Ctx, landmarkId: string, slot: number): void {
  const st = ctx.st;
  const me = st.activePlayer;
  const lm = landmarkDef(st.config, landmarkId)!;
  const tax = replacementTax(st, me, slot);
  const cost = lm.cost + tax;
  if (tax > 0) st.players[me]!.replacements += 1;
  if (cost !== 0) changeResource(ctx, me, 'coins', -cost, lm.id);
  const s = st.shared!.slots[slot]!;
  if (s.tile != null) st.discard.push(s.tile);
  s.tile = lm.id;
  s.owner = me;
  st.players[me]!.landmarks.push(lm.id);
  ctx.events.push({ t: 'bought', player: me, item: lm.id, cost, slot, ...(tax > 0 ? { tax } : {}) });
}

export function sharedSellTile(ctx: Ctx, slot: number): void {
  const st = ctx.st;
  const me = st.activePlayer;
  const s = st.shared!.slots[slot]!;
  const id = s.tile!;
  const refund = Math.floor(tileDef(st.config, id).cost * st.config.sellRefund);
  s.tile = null;
  s.owner = null;
  st.discard.push(id);
  ctx.events.push({ t: 'sold', player: me, tile: id, refund });
  if (refund > 0) changeResource(ctx, me, 'coins', refund, 'sale');
}

// ---------------------------------------------------------------------------
// End of game

/** Highest landmark count of any player (the landmarkRace measure). */
export function mostLandmarks(st: GameState): number {
  return st.players.reduce((n, p) => Math.max(n, p.landmarks.length), 0);
}

/** `endGameVpPerTiles` passives: floor(tilesOwned / n) VP, once, at game end (same hook as tileEndVp). */
export function awardPassiveEndVp(ctx: Ctx): void {
  const st = ctx.st;
  for (const p of st.players) {
    const n = ownedSharedCount(st, p.id);
    for (const id of p.landmarks) {
      const per = landmarkDef(st.config, id)?.passive?.endGameVpPerTiles;
      if (!per) continue;
      const vp = Math.floor(n / per);
      if (vp > 0) changeResource(ctx, p.id, 'vp', vp, 'endgame');
    }
  }
}
