// Shared-board placement: where a tile is worth building, by its class.
// Used by the profile bots (scoring and explanations) and by Lookahead (to
// prune slots). All inputs are one decision's TrafficMaps, so scoring several
// hundred (tile, slot) pairs costs a few array reads each.
//
//   civic     traffic: everyone's passes (and landings) over the slot
//   private   the owner's own passes; a bonus on the owner's own side
//   landmark  the owner's own passes
//   toll      opponents' landings, weighted toward the VP leader's; a small
//             penalty on the owner's own side (the owner rarely lands there)
//   public    the owner's landings minus half the opponents' landings
import type { GameState, TileClass, TileDef } from '../engine/types.ts';
import { sideOf } from '../engine/sharedBoard.ts';
import type { TrafficMaps } from '../engine/traffic.ts';

export type PlaceWeights = {
  /** Scales the traffic terms (the profile's `placementWeight`). */
  placementWeight: number;
  /** Extra weight on the VP leader's landing mass for tolls (1 = the leader counts double). */
  leaderWeight: number;
  /** Flat bonus for a private tile on its owner's own side. */
  ownSideBonus: number;
  /** Flat penalty for a toll on its owner's own side. */
  ownSidePenalty: number;
};

export const DEFAULT_PLACE_WEIGHTS: PlaceWeights = { placementWeight: 2, leaderWeight: 1, ownSideBonus: 0.5, ownSidePenalty: 0.5 };

export type SharedPlace = {
  cls: TileClass | 'landmark';
  /** The raw measure behind the term (civic: opponents' + own pass mass). */
  traffic: number;
  ownPass: number;
  ownLand: number;
  oppLand: number;
  leaderLand: number;
  /** The own-side bonus (+) or penalty (−), already in score units; 0 elsewhere. */
  side: number;
  /** Total placement score: weighted traffic terms plus `side`. */
  value: number;
};

/** Score `slot` for a tile of class `cls` (or a landmark) for the player the maps are relative to. */
export function sharedPlacement(tr: TrafficMaps, state: GameState, cls: TileClass | 'landmark', slot: number, w: PlaceWeights): SharedPlace {
  const ownPass = tr.ownPass[slot]!;
  const ownLand = tr.ownLand[slot]!;
  const oppPass = tr.oppPass[slot]!;
  const oppLand = tr.oppLand[slot]!;
  const leaderLand = tr.leaderLand[slot]!;
  const own = sideOf(state.config, slot) === tr.me;
  const out: SharedPlace = { cls, traffic: 0, ownPass, ownLand, oppLand, leaderLand, side: 0, value: 0 };
  switch (cls) {
    case 'civic':
      out.traffic = oppPass + ownPass;
      out.value = w.placementWeight * out.traffic;
      break;
    case 'private':
      out.traffic = ownPass;
      out.side = own ? w.ownSideBonus : 0;
      out.value = w.placementWeight * ownPass + out.side;
      break;
    case 'landmark':
      out.traffic = ownPass;
      out.value = w.placementWeight * ownPass;
      break;
    case 'toll':
      out.traffic = oppLand + w.leaderWeight * leaderLand;
      out.side = own ? -w.ownSidePenalty : 0;
      out.value = w.placementWeight * out.traffic + out.side;
      break;
    case 'public':
      out.traffic = ownLand - 0.5 * oppLand;
      out.value = w.placementWeight * out.traffic;
      break;
  }
  return out;
}

/** The class a shop tile places as; shared tiles always carry one. */
export function classOfTile(def: TileDef): TileClass {
  return def.class ?? 'civic';
}
