// Loops-mode shop actions (buy, expand, sell) and the mod purchase both modes
// share. Shared-mode tile purchases are in shared.ts.
import type { Ctx } from './effects.ts';
import { changeResource, runEffects } from './effects.ts';
import { tileDef } from './board.ts';

function pay(ctx: Ctx, player: number, cost: number, source: string): void {
  if (cost !== 0) changeResource(ctx, player, 'coins', -cost, source);
}

export function buyTile(ctx: Ctx, shopIndex: number, slot: number): void {
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

export function buyExpansion(ctx: Ctx, shopIndex: number, afterSlot: number): void {
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

export function buyMod(ctx: Ctx, modId: string): void {
  const st = ctx.st;
  const me = st.activePlayer;
  const def = st.config.modSet.find((m) => m.id === modId)!;
  pay(ctx, me, def.cost, modId);
  ctx.events.push({ t: 'bought', player: me, item: modId, cost: def.cost });
  runEffects(ctx, def.effects, { self: me, target: null, slot: null, source: modId, coinLoss: new Map() });
  if (def.scope !== 'round') st.players[me]!.mods.push(modId);
}

export function sellTile(ctx: Ctx, slot: number): void {
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
