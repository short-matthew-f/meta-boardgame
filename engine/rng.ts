// Deterministic RNG. The engine keeps a 32-bit xorshift cursor inside
// GameState and advances it with pure functions; bots get a small mutable
// wrapper over the same generator seeded separately so their tie-breaks never
// touch the game's cursor.

export function seedToState(seed: number): number {
  // splitmix32-style scramble so small seeds do not produce correlated streams
  let x = (seed >>> 0) + 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x21f0aaad);
  x = Math.imul(x ^ (x >>> 15), 0x735a2d97);
  x = (x ^ (x >>> 15)) >>> 0;
  return x === 0 ? 0x1234567 : x;
}

/** Advance the cursor once. Returns the new cursor and a uint32. */
export function rngNext(state: number): [number, number] {
  let x = state >>> 0;
  x ^= x << 13;
  x >>>= 0;
  x ^= x >>> 17;
  x ^= x << 5;
  x >>>= 0;
  return [x, x];
}

/** Uniform integer in [0, n). */
export function rngInt(state: number, n: number): [number, number] {
  const [s, v] = rngNext(state);
  return [s, n <= 0 ? 0 : v % n];
}

/** Fisher-Yates shuffle, returns a new array. */
export function rngShuffle<T>(state: number, arr: readonly T[]): [number, T[]] {
  const out = arr.slice();
  let s = state;
  for (let i = out.length - 1; i > 0; i--) {
    let j: number;
    [s, j] = rngInt(s, i + 1);
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return [s, out];
}

/** Mutable RNG for bots and the runner. */
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seedToState(seed);
  }
  next(): number {
    const [s, v] = rngNext(this.s);
    this.s = s;
    return v;
  }
  /** float in [0,1) */
  float(): number {
    return this.next() / 4294967296;
  }
  int(n: number): number {
    const [s, v] = rngInt(this.s, n);
    this.s = s;
    return v;
  }
  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error('pick from empty array');
    return arr[this.int(arr.length)]!;
  }
  shuffle<T>(arr: readonly T[]): T[] {
    const [s, out] = rngShuffle(this.s, arr);
    this.s = s;
    return out;
  }
}
