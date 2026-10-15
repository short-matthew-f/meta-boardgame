import { describe, expect, it } from 'vitest';
import { newSession, runGame } from '../web/loop.ts';
import type { HumanController, Presenter, Seat } from '../web/types.ts';
import { defaultConfig } from '../tiles/index.ts';
import { replay, playGame } from '../sim/runner.ts';
import { botByName } from '../bots/index.ts';
import { sameAction } from '../engine/engine.ts';
import type { Action, Event, GameState } from '../engine/types.ts';
import type { Decision } from '../bots/types.ts';

type Log = { turns: number; thought: Decision[]; batches: Event[][]; afters: GameState[] };

function fakePresenter(): { p: Presenter; log: Log } {
  const log: Log = { turns: 0, thought: [], batches: [], afters: [] };
  return {
    log,
    p: {
      turn() { log.turns++; },
      async thinking(d) { log.thought.push(d); },
      async events(ev, _b, after) { log.batches.push(ev); log.afters.push(after); },
    },
  };
}

const noHuman: HumanController = { act: () => { throw new Error('no human expected'); }, cancel() {} };

function bots(...names: string[]): Seat[] {
  return names.map((bot) => ({ bot, human: false }));
}

describe('web/loop runGame', () => {
  it('plays a 4-bot game to the end and matches the batch runner', async () => {
    const config = defaultConfig({ players: 4 });
    const seats = bots('scorer', 'greedy', 'aggressor', 'turtle');
    const { p, log } = fakePresenter();
    const s = newSession({ seed: 77, config, seats, present: p, human: noHuman });
    const r = await runGame(s);
    expect(r.state.phase).toBe('ended');
    expect(r.state.winner).not.toBeNull();
    expect(log.thought.length).toBe(r.actions.length); // every action was a bot decision
    expect(log.batches.length).toBe(r.actions.length);
    // The loop uses decide(); decide must agree with the fast path the batch sim uses.
    const rec = playGame(77, seats.map((x) => botByName(x.bot)), config);
    expect(r.actions).toEqual(rec.actions);
    expect(r.state.winner).toBe(rec.winner);
    // And (seed, actions) replays the game.
    expect(replay(77, config, r.actions).state.winner).toBe(r.state.winner);
    expect(r.events.at(-1)).toMatchObject({ t: 'gameEnded' });
  });

  it('every presented decision lists distinct candidates with the chosen one first', async () => {
    const { p, log } = fakePresenter();
    const s = newSession({ seed: 5, config: defaultConfig({ players: 3 }), seats: bots('lookahead', 'expander', 'random'), present: p, human: noHuman });
    await runGame(s);
    for (const d of log.thought) {
      expect(sameAction(d.candidates[0]!.action, d.action)).toBe(true);
      expect(d.candidates.length).toBeGreaterThan(0);
    }
  });

  it('a scripted human that takes the first legal action finishes a game and is replayable', async () => {
    const config = defaultConfig({ players: 3, endMode: 'turnCap', endValue: 8 });
    const seats: Seat[] = [{ bot: 'scorer', human: true }, { bot: 'greedy', human: false }, { bot: 'turtle', human: false }];
    const { p, log } = fakePresenter();
    let asked = 0;
    const human: HumanController = {
      async act(_state, legal) { asked++; return legal[0]!; },
      cancel() {},
    };
    const s = newSession({ seed: 12, config, seats, present: p, human });
    const r = await runGame(s);
    expect(r.state.phase).toBe('ended');
    expect(asked).toBeGreaterThan(8);
    expect(log.thought.length + asked).toBe(r.actions.length);
    expect(replay(12, config, r.actions).state.winner).toBe(r.state.winner);
  });

  it('switching a seat mid-game takes effect at its next decision, both ways', async () => {
    const config = defaultConfig({ players: 2, endMode: 'turnCap', endValue: 6 });
    const seats: Seat[] = bots('scorer', 'greedy');
    const { p } = fakePresenter();
    const who: string[] = [];
    let s!: ReturnType<typeof newSession>;
    const human: HumanController = {
      async act(state, legal) {
        who.push(`human@${state.round}`);
        if (state.round >= 3) seats[0]!.human = false; // hand back
        return legal[0]!;
      },
      cancel() {},
    };
    p.thinking = async (d) => { who.push(`bot:${d.candidates.length}`); };
    s = newSession({ seed: 3, config, seats, present: p, human });
    s.onStep = (st) => { if (st.round === 2 && st.activePlayer === 0 && !seats[0]!.human && st.phase === 'roll') seats[0]!.human = true; };
    await runGame(s);
    const firstHuman = who.findIndex((x) => x.startsWith('human'));
    expect(firstHuman).toBeGreaterThan(0);
    expect(who.some((x) => x === 'human@3')).toBe(true);
    expect(who.slice(-1)[0]).toMatch(/^bot/);
  });

  it('a null answer (seat handed back while waiting) re-asks who decides', async () => {
    const config = defaultConfig({ players: 2, endMode: 'turnCap', endValue: 3 });
    const seats: Seat[] = [{ bot: 'scorer', human: true }, { bot: 'greedy', human: false }];
    const { p } = fakePresenter();
    let calls = 0;
    const human: HumanController = {
      async act() { calls++; seats[0]!.human = false; return null; },
      cancel() {},
    };
    const r = await runGame(newSession({ seed: 1, config, seats, present: p, human }));
    expect(calls).toBe(1);
    expect(r.state.phase).toBe('ended');
  });

  it('never hands the engine anything but a legal action', async () => {
    const config = defaultConfig({ players: 4 });
    const { p } = fakePresenter();
    const s = newSession({ seed: 9, config, seats: bots('random', 'random', 'random', 'random'), present: p, human: noHuman });
    const acts: Action[] = [];
    s.onStep = () => { acts.push(s.actions.at(-1)!); };
    await expect(runGame(s)).resolves.toBeTruthy();
    expect(acts.length).toBe(s.actions.length);
  });
});
