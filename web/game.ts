// Wires one game together: engine session, clock, presenter, human controller
// and the table. `startGame` returns a handle that can stop it.
import { defaultConfig } from '../tiles/index.ts';
import { runGame, newSession } from './loop.ts';
import { HumanPlayer } from './human.ts';
import { DomPresenter } from './presenter.ts';
import { AbortedError, Clock } from './timing.ts';
import { TableView } from './render/table.ts';
import { gameOverBanner } from './gameover.ts';
import { toView } from './viewmodel.ts';
import { NO_AFFORDANCES } from './types.ts';
import type { Affordances, Seat, SetupChoice } from './types.ts';
import { store } from './dom.ts';

export type GameHandle = { el: HTMLElement; stop(): void };

export function startGame(setup: SetupChoice, onNew: () => void, onRematch: (c: SetupChoice) => void): GameHandle {
  const config = defaultConfig({ players: setup.seats.length, endMode: setup.endMode, endValue: setup.endValue });
  // A human-started seat keeps a bot to hand back to.
  const seats: Seat[] = setup.seats.map((s) => (s === 'human' ? { bot: 'lookahead', human: true } : { bot: s, human: false }));
  const clock = new Clock();
  clock.speed = setup.speed;
  const human = new HumanPlayer();
  let aff: Affordances = NO_AFFORDANCES;

  const table: TableView = new TableView(config, setup.seed, {
    slot: (p, slot) => { if (p === session.state.activePlayer) human.clickSlot(slot); },
    gap: (p, k) => { if (p === session.state.activePlayer) human.clickGap(k); },
    board: (p) => human.clickBoard(p),
    seat: (p) => {
      const seat = seats[p]!;
      seat.human = !seat.human;
      // Handing back while that seat is being asked: the bot decides right now.
      if (!seat.human && p === session.state.activePlayer) human.cancel();
      table.refresh();
    },
    shopTile: (i) => human.clickShop(i),
    mod: (id) => human.clickMod(id),
    button: (i) => { const b = aff.buttons[i]; if (b) human.clickButton(b.action); },
    cancel: () => human.clickCancel(),
    speed: (sp) => { clock.setSpeed(sp); table.setSpeed(sp); store.set('metaBoardgame.speed', sp); },
    pause: () => { clock.setPaused(!clock.isPaused); table.setPaused(clock.isPaused); },
    step: () => clock.step(),
    newGame: () => { stop(); onNew(); },
  }, setup.speed);

  const presenter = new DomPresenter(table, clock, seats);
  const session = newSession({ seed: setup.seed, config, seats, present: presenter, human });

  human.onChange = (a) => {
    aff = a;
    table.setAffordances(a);
    const who = `Player ${session.state.activePlayer + 1}`;
    if (a.prompt) table.panel.showHuman(who, a);
    else if (seats[session.state.activePlayer]?.human) table.panel.renderIdle('Resolving your move…');
  };

  let stopped = false;
  function stop(): void {
    stopped = true;
    clock.abort();
    human.cancel();
  }

  void runGame(session).then(
    () => {
      if (stopped) return;
      table.render(toView(session.state), seats);
      table.setAffordances(NO_AFFORDANCES);
      table.panel.renderIdle('Game over.');
      table.el.append(gameOverBanner(session.state, seats, setup.seed, session.events, onNew, () => onRematch(setup)));
    },
    (err: unknown) => {
      if (err instanceof AbortedError || stopped) return;
      console.error(err);
      table.panel.renderIdle(`Error: ${err instanceof Error ? err.message : String(err)}`);
    },
  );

  return { el: table.el, stop };
}
