// Animation timing in one place. Durations are in ms at "normal" speed.
import type { Speed } from './types.ts';

export const DURATIONS = {
  diceTumble: 600,
  tokenHopPerSlot: 250,
  /** A long move is squeezed so it never takes longer than this in total. */
  tokenMoveMax: 3000,
  tokenSlide: 450, // backward pushes and teleports
  tileFired: 700,
  lapFlash: 500,
  attack: 700,
  bought: 500,
  modBought: 450,
  sold: 400,
  expanded: 450,
  locked: 500,
  shopRefill: 400,
  roundEnd: 250,
  thinkShow: 1500,
  thinkPick: 800,
  /** Settle time after a human or bot action before the next decision starts. */
  settle: 120,
} as const;

export const SPEED_SCALE: Record<Speed, number> = { slow: 2, normal: 1, fast: 0.35, instant: 0 };

/** Pause / step / speed. Every wait in the presenter goes through here. */
export class Clock {
  speed: Speed = 'normal';
  private paused = false;
  private stepBudget = 0;
  private aborted = false;
  private sleepers = new Set<() => void>();
  private waiters: (() => void)[] = [];
  onChange: () => void = () => {};

  get isPaused(): boolean { return this.paused; }
  get scale(): number { return SPEED_SCALE[this.speed]; }
  /** Duration scaled by the current speed. */
  ms(base: number): number { return base * this.scale; }

  setSpeed(s: Speed): void {
    this.speed = s;
    if (s === 'instant') this.wake();
    this.onChange();
  }
  setPaused(p: boolean): void {
    this.paused = p;
    this.stepBudget = 0;
    this.releaseWaiters();
    this.onChange();
  }
  /** While paused: let exactly one more beat through. */
  step(): void {
    if (!this.paused) return;
    this.stepBudget += 1;
    this.releaseWaiters();
  }
  abort(): void {
    this.aborted = true;
    this.wake();
    this.releaseWaiters();
  }

  private wake(): void {
    for (const w of [...this.sleepers]) w();
    this.sleepers.clear();
  }
  private releaseWaiters(): void {
    const w = this.waiters;
    this.waiters = [];
    for (const f of w) f();
  }

  /** Resolves when the loop may take its next beat; blocks while paused unless stepping. */
  private async gate(): Promise<void> {
    while (this.paused && this.stepBudget === 0 && !this.aborted) {
      await new Promise<void>((r) => this.waiters.push(r));
    }
    if (this.aborted) throw new AbortedError();
    if (this.paused && this.stepBudget > 0) this.stepBudget -= 1;
  }

  /** One beat: wait for the gate, then sleep `base` ms (scaled). Instant speed only yields. */
  async beat(base: number): Promise<void> {
    await this.gate();
    const ms = this.ms(base);
    if (ms <= 0) {
      await new Promise<void>((r) => setTimeout(r, 0));
    } else {
      await new Promise<void>((r) => {
        const done = () => { clearTimeout(t); this.sleepers.delete(done); r(); };
        const t = setTimeout(done, ms);
        this.sleepers.add(done);
      });
    }
    if (this.aborted) throw new AbortedError();
  }

}

export class AbortedError extends Error {
  constructor() { super('game aborted'); this.name = 'AbortedError'; }
}
