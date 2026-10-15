// Loop-board layout: slots on a circle, slot 0 (Start) at the top, clockwise.
// Pure maths, so it is shared by the SVG board and the tests.
export const VB = 600;
/** The visible part of the 600-unit square: the corners of the ring are empty, so crop them. */
export const VB_MIN = 18;
export const VB_SPAN = VB - 2 * VB_MIN;
const CX = VB / 2;
const CY = VB / 2;
const R = 212;
export const TOKEN_R = 15;
/** Tokens are drawn bigger on the small boards so they stay visible. */
export const SMALL_TOKEN_K = 1.9;

export type SlotGeom = {
  cx: number; cy: number;
  w: number; h: number;
  /** Outward unit vector from the board centre. */
  ux: number; uy: number;
};

export type Layout = {
  n: number;
  w: number;
  h: number;
  slots: SlotGeom[];
  /** Token centre for a slot (on the inner side of its card). */
  token(slot: number): { x: number; y: number };
  /** Centre of the gap after `slot` (between it and the next one). */
  gap(afterSlot: number): { x: number; y: number };
  nameFont: number;
};

const cache = new Map<string, Layout>();

export function layout(n: number, large: boolean): Layout {
  const key = `${n}:${large}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const chord = 2 * R * Math.sin(Math.PI / Math.max(n, 3));
  const w = Math.round(Math.max(large ? 84 : 72, Math.min(large ? 124 : 140, chord - 8)));
  const h = Math.round(Math.max(large ? 58 : 60, Math.min(large ? 86 : 100, w * 0.7)));
  const slots: SlotGeom[] = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    slots.push({ cx: CX + R * ux, cy: CY + R * uy, w, h, ux, uy });
  }
  const support = (g: SlotGeom) => Math.abs(g.ux) * (g.w / 2) + Math.abs(g.uy) * (g.h / 2);
  const out: Layout = {
    n, w, h, slots,
    nameFont: large ? (n <= 9 ? 17 : n <= 12 ? 16 : 15) : 0,
    token(slot) {
      const g = slots[((slot % n) + n) % n]!;
      const d = support(g) + (large ? TOKEN_R : TOKEN_R * SMALL_TOKEN_K) - 8;
      return { x: g.cx - g.ux * d, y: g.cy - g.uy * d };
    },
    gap(afterSlot) {
      const a = -Math.PI / 2 + (2 * Math.PI * (afterSlot + 0.5)) / n;
      return { x: CX + R * Math.cos(a), y: CY + R * Math.sin(a) };
    },
  };
  cache.set(key, out);
  return out;
}

/** Short on-card name: wraps long names onto two lines. */
export function nameLines(name: string, maxChars: number): string[] {
  if (name.length <= maxChars) return [name];
  const words = name.split(' ');
  if (words.length > 1) {
    const mid = Math.ceil(words.length / 2);
    return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
  }
  return [name];
}

/** Two- or three-letter code for the small boards. */
export function nameCode(name: string): string {
  const words = name.replace('+', '').split(' ');
  const code = words.length > 1 ? words.map((w) => w[0]).join('') : name.slice(0, 3);
  return code.toUpperCase() + (name.endsWith('+') ? '+' : '');
}
