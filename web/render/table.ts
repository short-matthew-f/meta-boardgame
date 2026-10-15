// The table: top bar, the boards (active one large, the rest small around
// it), shop, and the side panel. It renders a View plus the human's current
// affordances; it never decides anything.
import type { GameConfig } from '../../engine/types.ts';
import { h, s } from '../dom.ts';
import { SPEEDS } from '../types.ts';
import type { Affordances, Seat, Speed, View } from '../types.ts';
import { BoardView } from './board.ts';
import { clearDice } from './fx.ts';
import { PanelView } from './panel.ts';
import { ShopView } from './shop.ts';
import { NO_AFFORDANCES } from '../types.ts';

export const PLAYER_COLORS = ['#ff9f43', '#ff6fb5', '#b8e84a', '#e6efff'];

export type TableHandlers = {
  slot(player: number, slot: number): void;
  gap(player: number, afterSlot: number): void;
  board(player: number): void;
  seat(player: number): void;
  shopTile(index: number): void;
  mod(id: string): void;
  button(index: number): void;
  cancel(): void;
  speed(s: Speed): void;
  pause(): void;
  step(): void;
  newGame(): void;
};

export function seatLabel(seat: Seat): string {
  if (seat.human) return 'Human';
  return seat.bot.charAt(0).toUpperCase() + seat.bot.slice(1).replace(/-/g, ' ');
}

const END_TEXT: Record<GameConfig['endMode'], (v: number) => string> = {
  turnCap: (v) => `${v} rounds`,
  vpRace: (v) => `first to ${v} VP`,
  lapRace: (v) => `first to ${v} laps`,
};

export class TableView {
  readonly el: HTMLElement;
  readonly boards: BoardView[];
  readonly shop: ShopView;
  readonly panel: PanelView;
  readonly overlay: SVGSVGElement;
  aff: Affordances = NO_AFFORDANCES;
  /** Highlights a bot's pick while it is being announced. */
  preview: { slot: number | null; shop: number | null; mod: string | null } = { slot: null, shop: null, mod: null };
  slideMs = 0;

  private stage = h('div', { class: 'stage' });
  private others = h('div', { class: 'others' });
  private roundEl = h('span', { class: 'round' });
  private phaseEl = h('span', { class: 'phase' });
  private pauseBtn = h('button', { class: 'btn', type: 'button' }, 'Pause');
  private stepBtn = h('button', { class: 'btn', type: 'button', title: 'Play one more animation beat' }, 'Step');
  private speedBtns = new Map<Speed, HTMLButtonElement>();
  private lastActive = -1;
  private lastView: View | null = null;
  private lastSeats: Seat[] = [];

  constructor(readonly config: GameConfig, readonly seed: number, private handlers: TableHandlers, speed: Speed) {
    this.boards = Array.from({ length: config.players }, (_, i) => new BoardView(i, {
      slot: (p, sl) => handlers.slot(p, sl), gap: (p, k) => handlers.gap(p, k),
      board: (p) => handlers.board(p), seat: (p) => handlers.seat(p),
    }));
    this.shop = new ShopView({ tile: (i) => handlers.shopTile(i), mod: (id) => handlers.mod(id) });
    this.panel = new PanelView({ button: (i) => handlers.button(i), cancel: () => handlers.cancel() });
    this.overlay = s('svg', { class: 'overlay' },
      s('defs', undefined, s('marker', { id: 'arrowhead', viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' }, s('path', { d: 'M0 0 L10 5 L0 10 z', fill: 'var(--tag-attack)' }))));

    const speedGroup = h('div', { class: 'seg', role: 'group', 'aria-label': 'Speed' });
    for (const sp of SPEEDS) {
      const b = h('button', { type: 'button', class: 'segbtn' }, sp[0]!.toUpperCase() + sp.slice(1));
      b.addEventListener('click', () => handlers.speed(sp));
      this.speedBtns.set(sp, b);
      speedGroup.append(b);
    }
    this.pauseBtn.addEventListener('click', () => handlers.pause());
    this.stepBtn.addEventListener('click', () => handlers.step());
    const seedEl = h('button', { class: 'seed', type: 'button', title: 'Seed (click to copy). Enter it on the setup screen to replay this game.' }, `seed ${seed}`);
    seedEl.addEventListener('click', () => { try { void navigator.clipboard?.writeText(String(seed)); } catch { /* ignore */ } });
    const newBtn = h('button', { class: 'btn ghost', type: 'button' }, 'New game');
    newBtn.addEventListener('click', () => handlers.newGame());

    const top = h('header', { class: 'topbar' },
      h('div', { class: 'title' }, h('strong', undefined, 'Board Game Builder'), this.roundEl, h('span', { class: 'endmode' }, END_TEXT[config.endMode](config.endValue)), seedEl, this.phaseEl),
      h('div', { class: 'controls' }, speedGroup, this.pauseBtn, this.stepBtn, newBtn));
    this.el = h('main', { class: `table p${config.players}`, style: `--others:${config.players - 1}` },
      top, this.others, h('div', { class: 'center' }, this.stage, this.shop.el), this.panel.el, this.overlay);
    this.setSpeed(speed);
    this.setPaused(false);
  }

  setSpeed(sp: Speed): void {
    for (const [k, b] of this.speedBtns) b.classList.toggle('on', k === sp);
  }

  setPaused(p: boolean): void {
    this.pauseBtn.textContent = p ? 'Play' : 'Pause';
    this.pauseBtn.classList.toggle('on', p);
    this.stepBtn.disabled = !p;
  }

  /** Full render from a view (the true post-step state, or an intermediate one mid-animation). */
  render(view: View, seats: Seat[]): void {
    this.lastView = view;
    this.lastSeats = seats;
    const active = view.activePlayer;
    const swapped = active !== this.lastActive;
    const aff = this.aff;
    this.boards.forEach((b, i) => {
      const seat = seats[i]!;
      const isActive = i === active;
      b.update({
        view: view.players[i]!,
        name: `Player ${i + 1}`,
        kind: seatLabel(seat),
        human: seat.human,
        active: isActive,
        large: isActive,
        config: this.config,
        color: PLAYER_COLORS[i]!,
        slotTargets: isActive ? aff.slotTargets : [],
        gapTargets: isActive ? aff.gapTargets : [],
        sellable: isActive ? aff.sellable : [],
        sellSelected: isActive ? aff.sellSelected : null,
        preview: isActive ? this.preview.slot : null,
        targetable: aff.targets.includes(i),
      });
    });
    if (swapped) {
      this.lastActive = active;
      const b = this.boards[active]!;
      this.stage.replaceChildren(b.el);
      this.others.replaceChildren(...this.boards.filter((_, i) => i !== active).map((x) => x.el));
      this.boards.forEach(clearDice);
      for (const x of this.boards) x.el.animate([{ transform: 'scale(.92)', opacity: 0.55 }, { transform: 'none', opacity: 1 }], { duration: this.slideMs > 0 ? 320 : 0, easing: 'ease-out' });
      // Layout changed size: slots keep their geometry but the token must re-sync.
      this.boards.forEach((x, i) => x.placeToken(view.players[i]!.position, 'jump'));
    }
    const me = view.players[active]!;
    this.shop.update({
      shop: view.shop, coins: me.coins, owned: me.mods, config: this.config, aff,
      preview: this.preview.shop, previewMod: this.preview.mod, slideMs: this.slideMs,
    });
    this.roundEl.textContent = `Round ${view.round}`;
    this.phaseEl.textContent = view.phase === 'ended' ? 'game over' : `Player ${active + 1}: ${view.phase === 'roll' ? 'roll' : 'shop'}`;
  }

  /** Re-render the last view after affordances or previews changed. */
  refresh(): void {
    if (this.lastView) this.render(this.lastView, this.lastSeats);
  }

  setAffordances(aff: Affordances): void {
    this.aff = aff;
    this.refresh();
  }
}
