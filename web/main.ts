// Entry point: setup screen <-> table screen.
import { showSetup } from './setup.ts';
import { startGame } from './game.ts';
import type { GameHandle } from './game.ts';
import type { SetupChoice } from './types.ts';

const host = document.getElementById('app')!;
let current: GameHandle | null = null;

function toSetup(): void {
  current?.stop();
  current = null;
  document.body.className = 'on-setup';
  showSetup(host, play);
}

function play(choice: SetupChoice): void {
  current?.stop();
  document.body.className = 'on-table';
  const g = startGame(choice, toSetup, (c) => play({ ...c }));
  current = g;
  host.replaceChildren(g.el);
}

toSetup();
