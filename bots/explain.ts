// Shared plumbing for bot explanations: tie-breaking that `choose` and
// `decide` both use (so they cannot drift), candidate ordering, and the
// short labels and number formats used in `why` lines.
import type { Action, GameState } from '../engine/types.ts';
import { modName, tileName } from '../engine/describe.ts';
import type { Candidate, Decision } from './types.ts';

export const MAX_CANDIDATES = 6;

/**
 * Index of the highest value; values within 1e-9 are ties and the Rng picks
 * among them (consuming one draw only when there is a real tie).
 */
export function pickBest(values: readonly number[], rng: { pick<U>(a: readonly U[]): U }): number {
  let best: number[] = [];
  let bestV = -Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    if (v > bestV + 1e-9) { bestV = v; best = [i]; }
    else if (Math.abs(v - bestV) <= 1e-9) best.push(i);
  }
  if (best.length === 0) return 0;
  return best.length === 1 ? best[0]! : rng.pick(best);
}

/**
 * Chosen option first, the rest by score descending (ties keep input order),
 * capped at MAX_CANDIDATES. Options whose score is not finite are dropped
 * unless they are the chosen one, so a Decision always serialises cleanly.
 * `why` runs only for the options that are kept.
 *
 * With `group`, the cap prefers one option per group (best first): six slots
 * for the same tile are one question, so the other tiles get shown too, and
 * remaining places fill by score. Either way the list stays sorted by score.
 */
export function buildDecision(
  actions: readonly Action[],
  scores: readonly number[],
  chosen: number,
  why: (index: number) => string,
  note?: string,
  group?: (index: number) => string,
): Decision {
  // Options that tied the chosen one (within pickBest's 1e-9) are reported at its exact
  // score, so float noise never lists a tied option above the chosen action.
  const top = scores[chosen]!;
  const shown = scores.map((v) => (v > top && v - top <= 1e-9 ? top : v));
  const byScore = (a: number, b: number) => (shown[a] === shown[b] ? a - b : shown[b]! > shown[a]! ? 1 : -1);
  const rest: number[] = [];
  for (let i = 0; i < actions.length; i++) if (i !== chosen && Number.isFinite(shown[i]!)) rest.push(i);
  rest.sort(byScore);
  let picked = rest.slice(0, MAX_CANDIDATES - 1);
  if (group && rest.length > picked.length) {
    const seen = new Set([group(chosen)]);
    const firsts: number[] = [];
    const repeats: number[] = [];
    for (const i of rest) {
      const k = group(i);
      if (seen.has(k)) repeats.push(i);
      else { seen.add(k); firsts.push(i); }
    }
    picked = [...firsts, ...repeats].slice(0, MAX_CANDIDATES - 1).sort(byScore);
  }
  const candidates: Candidate[] = [chosen, ...picked].map((i) => ({ action: actions[i]!, score: shown[i]!, why: why(i) }));
  const d: Decision = { action: actions[chosen]!, candidates };
  if (note) d.note = note;
  return d;
}

/** Short action label for `why` lines: `Shrine → slot 3`, `Sell Market from slot 2`, `Player 2`. */
export function shortLabel(state: GameState, a: Action): string {
  const cfg = state.config;
  switch (a.type) {
    case 'roll': return 'Roll';
    case 'reroll': return 'Reroll';
    case 'keepRoll': return 'Keep roll';
    case 'chooseTarget': return `Player ${a.player + 1}`;
    case 'buyTile': return `${tileName(cfg, state.shop[a.shopIndex]!)} → slot ${a.slot}`;
    case 'buyExpansion': return `${tileName(cfg, state.shop[a.shopIndex]!)} → after slot ${a.afterSlot}`;
    case 'buyMod': return modName(cfg, a.modId);
    case 'sellTile': {
      const id = state.players[state.activePlayer]!.board[a.slot];
      return `Sell ${id != null ? tileName(cfg, id) : 'tile'} from slot ${a.slot}`;
    }
    case 'pass': return 'Pass';
  }
}

const MINUS = '−';

/** `+3.0`, `−0.45`: explicit sign, fixed decimals. */
export function sgn(n: number, digits = 1): string {
  const s = Math.abs(n).toFixed(digits);
  return n < 0 && Number(s) !== 0 ? `${MINUS}${s}` : `+${s}`;
}

/** Plain number, no sign, trailing zeros trimmed at 2 decimals: `5`, `1.5`. */
export function num(n: number): string {
  return String(Math.round(n * 100) / 100).replace('-', MINUS);
}

/** Minus-sign number without forced plus: `−5`, `2.0`. */
export function fixed(n: number, digits = 1): string {
  return n < 0 ? `${MINUS}${Math.abs(n).toFixed(digits)}` : n.toFixed(digits);
}

/** Single legal action: no weighing happened. */
export function onlyOption(state: GameState, a: Action): Decision {
  return { action: a, candidates: [{ action: a, score: 0, why: `${shortLabel(state, a)}: only legal action` }] };
}
