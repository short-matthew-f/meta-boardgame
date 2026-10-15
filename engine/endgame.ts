// End of game: when the end trigger trips, who is ahead, and the VP awarded
// once at game end (tileEndVp, shared-mode passives).
import type { GameState, SimEndMode, Standing } from './types.ts';
import { ownedCost, ownedCount } from './board.ts';
import { type Ctx, changeResource } from './effects.ts';
import { mostLandmarks } from './shared.ts';

export function checkEndTrigger(st: GameState): void {
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
export function awardTileEndVp(ctx: Ctx): void {
  const st = ctx.st;
  if (!(st.config.tileEndVp > 0)) return;
  for (const p of st.players) {
    const cost = ownedCost(st, p.id);
    // epsilon guards floor() against float error such as 0.34 × 100 = 34.00000000000001
    const vp = Math.floor(cost * st.config.tileEndVp + 1e-9);
    if (vp > 0) changeResource(ctx, p.id, 'vp', vp, 'endgame');
  }
}
