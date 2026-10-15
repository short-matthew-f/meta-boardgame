// Loops-mode tile triggers that can target another player: resolving a queued
// tile trigger, deciding whether it needs a target prompt, and running an
// attack (shield, defender tiles, reflect). Shared mode has no attack class.
import type { Effect, QueuedTrigger, TileId, Trigger } from './types.ts';
import { activeTile, isLocked, tileDef } from './board.ts';
import { type Ctx, type EffectCtx, changeResource, consumeFlag, getFlag, runEffects } from './effects.ts';

export function resolveTileTrigger(ctx: Ctx, item: Extract<QueuedTrigger, { kind: 'tile' }>): void {
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

export function runAttack(ctx: Ctx, attacker: number, slot: number, tile: TileId, trigger: Trigger, target: number, effectsOf?: Trigger): void {
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
