// The game-over banner: winner, final standings, seed, and what to do next.
import { rankPlayers } from '../engine/engine.ts';
import { ownedTileCount } from '../engine/board.ts';
import type { Event, GameState } from '../engine/types.ts';
import { h } from './dom.ts';
import type { Seat } from './types.ts';
import { PLAYER_COLORS, seatLabel } from './render/table.ts';

const REASON: Record<string, (rounds: number) => string> = {
  turnCap: (r) => `Turn cap reached after ${r} rounds`,
  vpRace: (r) => `VP target reached, game ended after round ${r}`,
  lapRace: (r) => `Lap target reached, game ended after round ${r}`,
  maxRounds: (r) => `Stopped at the ${r}-round limit`,
};

export function gameOverBanner(state: GameState, seats: Seat[], seed: number, events: Event[], onNew: () => void, onRematch: () => void): HTMLElement {
  const end = [...events].reverse().find((e) => e.t === 'gameEnded');
  const reason = end && end.t === 'gameEnded' ? (REASON[end.reason] ?? (() => end.reason))(end.rounds) : 'Game over';
  const order = rankPlayers(state);
  const winner = state.winner ?? order[0]!;
  const rows = order.map((p, rank) => {
    const pl = state.players[p]!;
    return h('tr', { class: p === winner ? 'win' : '' },
      h('td', undefined, String(rank + 1)),
      h('td', undefined, h('span', { class: 'swatch', style: `background:${PLAYER_COLORS[p]}` }), ` Player ${p + 1}`),
      h('td', undefined, seatLabel(seats[p]!)),
      h('td', { class: 'num' }, String(pl.vp)),
      h('td', { class: 'num' }, String(pl.coins)),
      h('td', { class: 'num' }, String(pl.laps)),
      h('td', { class: 'num' }, String(ownedTileCount(pl))));
  });
  const newBtn = h('button', { type: 'button', class: 'btn primary big', id: 'new-game' }, 'New game');
  newBtn.addEventListener('click', onNew);
  const again = h('button', { type: 'button', class: 'btn', id: 'rematch' }, 'Replay this seed');
  again.addEventListener('click', onRematch);
  return h('div', { class: 'gameover', id: 'gameover', role: 'dialog', 'aria-label': 'Game over' },
    h('div', { class: 'gameover-card' },
      h('p', { class: 'kicker' }, 'Game over'),
      h('h2', undefined, `Player ${winner + 1} wins`, h('span', { class: 'who' }, ` (${seatLabel(seats[winner]!)})`)),
      h('p', { class: 'reason' }, reason),
      h('table', { class: 'standings' },
        h('thead', undefined, h('tr', undefined, ...['#', 'Player', 'Seat', 'VP', 'Coins', 'Laps', 'Tiles'].map((t, i) => h('th', { class: i > 2 ? 'num' : '' }, t)))),
        h('tbody', undefined, ...rows)),
      h('p', { class: 'seedline' }, 'Seed ', h('b', undefined, String(seed)), ' (enter it on the setup screen to replay)'),
      h('div', { class: 'btns' }, newBtn, again)));
}
