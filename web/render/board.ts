// One loop board: an HTML header (who, coins, VP, laps, dice, mods, seat
// button) over an SVG ring of slots. The same component is the large board for
// the active player and a small one for everybody else; only `large` differs.
import type { GameConfig, TileDef } from '../../engine/types.ts';
import { describeTile } from '../../engine/describe.ts';
import { h, s, clear } from '../dom.ts';
import type { PlayerView } from '../types.ts';
import { layout, nameCode, nameLines, TOKEN_R, VB, VB_MIN, VB_SPAN } from './geometry.ts';
import type { Layout } from './geometry.ts';

export type BoardProps = {
  view: PlayerView;
  name: string;
  kind: string;
  human: boolean;
  active: boolean;
  large: boolean;
  config: GameConfig;
  color: string;
  /** Slots the selected shop tile can go to (active board only). */
  slotTargets: { slot: number; replaces: boolean }[];
  gapTargets: number[];
  sellable: number[];
  sellSelected: number | null;
  /** Slot a bot is about to use, shown during its pick. */
  preview: number | null;
  targetable: boolean;
};

export type BoardHandlers = {
  slot(player: number, slot: number): void;
  gap(player: number, afterSlot: number): void;
  board(player: number): void;
  seat(player: number): void;
};

const TAG_VAR = (t: string) => `var(--tag-${t})`;

export class BoardView {
  readonly el: HTMLElement;
  readonly fxG: SVGGElement;
  readonly fxHtml: HTMLElement;
  readonly diceEl: HTMLElement;
  private svg: SVGSVGElement;
  private slotsG: SVGGElement;
  private tokenG: SVGGElement;
  private whoEl = h('div', { class: 'who' });
  private ringBox!: HTMLElement;
  private nameEl = h('strong', { class: 'name' });
  private kindEl = h('span', { class: 'kind' });
  private seatBtn = h('button', { class: 'seat-btn', type: 'button' });
  private statEls: Record<'coins' | 'vp' | 'laps' | 'dice', HTMLElement>;
  private modsEl = h('div', { class: 'mods' });
  private prev = { coins: -1, vp: -1, laps: -1 };
  private sig = '';
  private n = 0;
  lay!: Layout;
  large = false;

  constructor(readonly player: number, private handlers: BoardHandlers) {
    const stat = (cls: string, label: string) => {
      const b = h('b');
      const wrap = h('span', { class: `st ${cls}`, title: label }, b, h('span', { class: 'lbl' }, ` ${label}`));
      return { wrap, b };
    };
    const coins = stat('coins', 'coins');
    const vp = stat('vp', 'VP');
    const laps = stat('laps', 'laps');
    const dice = h('span', { class: 'st dieset', title: 'dice' });
    this.statEls = { coins: coins.b, vp: vp.b, laps: laps.b, dice };

    this.slotsG = s('g', { class: 'slots' });
    this.fxG = s('g', { class: 'fx' });
    this.tokenG = s('g', { class: 'token' }, s('g', { class: 'token-in' },
      s('circle', { r: TOKEN_R, class: 'token-body' }),
      s('text', { class: 'token-num', 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 17 }, String(player + 1))));
    this.svg = s('svg', { viewBox: `${VB_MIN} ${VB_MIN} ${VB_SPAN} ${VB_SPAN}`, class: 'ring', role: 'img', 'aria-label': `Player ${player + 1}'s board` },
      s('circle', { class: 'track', cx: VB / 2, cy: VB / 2, r: 212 }), this.slotsG, this.fxG, this.tokenG);
    this.fxHtml = h('div', { class: 'fx-html' });
    this.diceEl = h('div', { class: 'dice' });

    this.ringBox = h('div', { class: 'ring-box' }, this.svg, this.diceEl, this.fxHtml);
    this.whoEl.append(h('span', { class: 'swatch' }), this.nameEl, this.kindEl, this.seatBtn);
    this.el = h('article', { class: 'board', 'data-player': player },
      h('header', { class: 'bh' },
        this.whoEl,
        h('div', { class: 'stats' }, coins.wrap, vp.wrap, laps.wrap, dice),
        this.modsEl),
      h('div', { class: 'ring-wrap' }, this.ringBox));

    this.seatBtn.addEventListener('click', (e) => { e.stopPropagation(); handlers.seat(player); });
    this.svg.addEventListener('click', (e) => {
      const t = e.target as Element;
      const gap = t.closest('[data-after]');
      if (gap) { handlers.gap(player, Number(gap.getAttribute('data-after'))); return; }
      const slot = t.closest('[data-slot]');
      if (slot) handlers.slot(player, Number(slot.getAttribute('data-slot')));
    });
    this.el.addEventListener('click', (e) => {
      if (this.el.classList.contains('targetable') && !(e.target as Element).closest('button')) handlers.board(player);
    });
  }

  update(p: BoardProps): void {
    const v = p.view;
    this.large = p.large;
    this.el.classList.toggle('large', p.large);
    this.el.classList.toggle('small', !p.large);
    this.el.classList.toggle('active', p.active);
    this.el.classList.toggle('targetable', p.targetable);
    this.el.classList.toggle('is-human', p.human);
    this.el.style.setProperty('--pc', p.color);

    this.nameEl.textContent = p.name;
    this.kindEl.textContent = p.kind;
    this.seatBtn.textContent = p.human ? 'Hand back to bot' : 'Take over';
    this.seatBtn.title = p.human ? 'A bot plays this seat from its next decision' : 'Play this seat yourself from its next decision';
    this.setStat('coins', v.coins);
    this.setStat('vp', v.vp);
    this.setStat('laps', v.laps);
    this.statEls.dice.textContent = v.dice.map((d) => `d${d.sides}`).join('+');
    this.renderMods(v, p.config);

    const sig = JSON.stringify([v.board, v.locks, p.large, p.slotTargets, p.gapTargets, p.sellable, p.sellSelected, p.preview]);
    const n = v.board.length;
    const resized = n !== this.n;
    if (sig !== this.sig || resized) {
      this.sig = sig;
      this.n = n;
      this.lay = layout(n, p.large);
      this.buildSlots(p);
    }
    this.placeToken(v.position, resized ? 'jump' : 'keep');
  }

  private setStat(k: 'coins' | 'vp' | 'laps', value: number): void {
    const el = this.statEls[k];
    el.textContent = String(value);
    if (this.prev[k] >= 0 && this.prev[k] !== value) {
      const cls = value > this.prev[k] ? 'up' : 'down';
      el.parentElement!.animate([{ transform: 'scale(1.35)', filter: 'brightness(1.8)' }, { transform: 'none', filter: 'none' }], { duration: 500, easing: 'ease-out' });
      el.parentElement!.dataset.change = cls;
    }
    this.prev[k] = value;
  }

  private renderMods(v: PlayerView, config: GameConfig): void {
    const key = v.mods.join(',');
    if (this.modsEl.dataset.key === key) return;
    this.modsEl.dataset.key = key;
    clear(this.modsEl);
    for (const id of v.mods) {
      const m = config.modSet.find((x) => x.id === id);
      this.modsEl.append(h('span', { class: 'chip', title: m ? m.name : id }, m?.name ?? id));
    }
  }

  private buildSlots(p: BoardProps): void {
    const { lay } = this;
    const v = p.view;
    clear(this.slotsG);
    const targets = new Map(p.slotTargets.map((t) => [t.slot, t.replaces]));
    const tiles = new Map<string, TileDef>(p.config.tileSet.map((t) => [t.id, t]));
    for (let i = 0; i < lay.n; i++) {
      const g = lay.slots[i]!;
      const id = v.board[i] ?? null;
      const def = id ? tiles.get(id) : undefined;
      const locked = v.locks.includes(i);
      const cls = ['slot'];
      if (i === 0) cls.push('start');
      else if (!id) cls.push('empty');
      if (locked) cls.push('locked');
      if (targets.has(i)) cls.push(targets.get(i) ? 'target-replace' : 'target-empty');
      if (p.sellable.includes(i)) cls.push('sellable');
      if (p.sellSelected === i) cls.push('sell-selected');
      if (p.preview === i) cls.push('preview');
      const node = s('g', { class: cls.join(' '), 'data-slot': i, transform: `translate(${g.cx.toFixed(1)} ${g.cy.toFixed(1)})` });
      const hw = g.w / 2;
      const hh = g.h / 2;
      node.append(s('title', undefined, i === 0 ? 'Start: collect lap income when you pass' : def ? describeTile(def, p.config.tileSet) + (locked ? ' (locked)' : '') : `Slot ${i}: empty`));
      node.append(s('rect', { class: 'card', x: -hw, y: -hh, width: g.w, height: g.h, rx: 9 }));
      if (i === 0) {
        node.append(s('text', { class: 'start-label', 'text-anchor': 'middle', y: 2, 'font-size': p.large ? 17 : 34 }, 'START'));
        if (p.large && g.w >= 116) node.append(s('text', { class: 'slot-no', 'text-anchor': 'middle', y: hh - 9, 'font-size': 14 }, 'lap income here'));
      } else if (def) {
        this.cardContent(node, def, i, g.w, g.h, p.large, lay.nameFont);
      } else {
        node.append(s('text', { class: 'slot-no', 'text-anchor': 'middle', y: 5, 'font-size': p.large ? 15 : 30 }, `${i}`));
        if (targets.has(i) && p.large) node.append(s('text', { class: 'hint', 'text-anchor': 'middle', y: hh - 9, 'font-size': 14 }, 'place here'));
      }
      if (targets.get(i)) {
        const pw = p.large ? 70 : 100;
        node.append(
          s('rect', { class: 'badge', x: -pw / 2, y: -hh - 11, width: pw, height: p.large ? 22 : 34, rx: 11 }),
          s('text', { class: 'badge-text', 'text-anchor': 'middle', y: -hh + (p.large ? 5 : 8), 'font-size': p.large ? 14 : 24 }, 'REPLACE'));
      }
      if (locked) node.append(this.padlock(hw - 12, -hh + (p.large ? 6 : 10), p.large ? 1.25 : 2.4));
      this.slotsG.append(node);
    }
    this.markHere();
    for (const k of p.gapTargets) {
      const { x, y } = lay.gap(k);
      this.slotsG.append(s('g', { class: 'gap', 'data-after': k, transform: `translate(${x.toFixed(1)} ${y.toFixed(1)})` },
        s('title', undefined, `Insert after slot ${k}`),
        s('circle', { r: 17 }),
        s('text', { 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 24 }, '+')));
    }
  }

  private cardContent(node: SVGGElement, def: TileDef, slot: number, w: number, hgt: number, large: boolean, font: number): void {
    const hw = w / 2;
    const hh = hgt / 2;
    const bandH = large ? 10 : 16;
    const tags = def.tags.length > 0 ? def.tags : ['expansion'];
    const bw = w / tags.length;
    tags.forEach((t, k) => {
      node.append(s('rect', { class: 'band', fill: TAG_VAR(t), x: -hw + 1 + k * bw, y: -hh + 1, width: bw - 2, height: bandH, rx: 4 }));
    });
    if (large) {
      const lines = nameLines(def.name, w >= 112 ? 11 : 10);
      const longest = Math.max(...lines.map((l) => l.length));
      const fs = Math.min(lines.length > 1 ? font - 1 : font, Math.floor((w - 8) / (longest * 0.6)));
      const baseY = (bandH - 12) / 2 + (lines.length > 1 ? -fs * 0.35 : fs * 0.05);
      lines.forEach((ln, k) => node.append(s('text', { class: 'tile-name', 'text-anchor': 'middle', 'font-size': fs, y: baseY + k * (fs + 1) }, ln)));
      node.append(
        s('text', { class: 'tile-cost', 'text-anchor': 'end', x: hw - 7, y: hh - 7, 'font-size': 15 }, `${def.cost}c`),
        s('text', { class: 'slot-no', 'text-anchor': 'start', x: -hw + 7, y: hh - 7, 'font-size': 15 }, `#${slot}`));
    } else {
      node.append(
        s('text', { class: 'tile-name', 'text-anchor': 'middle', 'font-size': 42, y: 14 }, nameCode(def.name)),
        s('text', { class: 'tile-cost', 'text-anchor': 'end', x: hw - 6, y: hh - 7, 'font-size': 30 }, `${def.cost}`));
    }
  }

  private padlock(x: number, y: number, k: number): SVGGElement {
    return s('g', { class: 'padlock', transform: `translate(${x} ${y}) scale(${k})` },
      s('path', { d: 'M-5 -3 V-6 a5 5 0 0 1 10 0 V-3', fill: 'none', 'stroke-width': 2.2 }),
      s('rect', { x: -7, y: -3, width: 14, height: 11, rx: 2 }));
  }

  /** Move the token. 'hop' animates over `ms`; 'jump' is instant; 'keep' leaves a running move alone. */
  placeToken(slot: number, mode: 'hop' | 'slide' | 'jump' | 'keep', ms = 0): void {
    if (!this.lay) return;
    const { x, y } = this.lay.token(slot);
    const t = this.tokenG.style;
    if (mode === 'keep') {
      if (this.tokenSlot === slot) return;
      t.transition = 'none';
    } else {
      t.transition = mode === 'jump' || ms <= 0 ? 'none' : `transform ${Math.round(ms)}ms ${mode === 'hop' ? 'cubic-bezier(.3,1.4,.5,1)' : 'ease-in-out'}`;
    }
    t.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    this.tokenSlot = slot;
    this.markHere();
  }
  tokenSlot = -1;

  /** Outline the slot the token is on, so a token beside a diagonal card is unambiguous. */
  private markHere(): void {
    this.slotsG.querySelector('.here')?.classList.remove('here');
    this.slotsG.querySelector(`[data-slot="${this.tokenSlot}"]`)?.classList.add('here');
  }

  /** Client rectangle of a slot card (for flying tiles and arrows). */
  slotRect(slot: number): DOMRect {
    const r = this.svg.getBoundingClientRect();
    const g = this.lay.slots[slot] ?? this.lay.slots[0]!;
    const k = r.width / VB;
    return new DOMRect(r.left + (g.cx - g.w / 2 - VB_MIN) * k, r.top + (g.cy - g.h / 2 - VB_MIN) * k, g.w * k, g.h * k);
  }

  /** Client rectangle around the gap after `afterSlot` (where an expansion lands). */
  gapRect(afterSlot: number): DOMRect {
    const r = this.svg.getBoundingClientRect();
    const k = r.width / VB_SPAN;
    const { x, y } = this.lay.gap(afterSlot);
    const w = this.lay.w * k * 0.6;
    const hh = this.lay.h * k * 0.6;
    return new DOMRect(r.left + (x - VB_MIN) * k - w / 2, r.top + (y - VB_MIN) * k - hh / 2, w, hh);
  }

  /** Position (as % of the ring) for HTML overlays. */
  pct(x: number, y: number): { left: string; top: string } {
    return { left: `${((x - VB_MIN) / VB_SPAN) * 100}%`, top: `${((y - VB_MIN) / VB_SPAN) * 100}%` };
  }

  center(slot: number | null): { x: number; y: number } {
    if (slot == null || !this.lay) return { x: VB / 2, y: VB / 2 - 40 };
    const g = this.lay.slots[slot]!;
    return { x: g.cx, y: g.cy };
  }

  /** Client-space centre of the ring (attack arrows start and end here). */
  ringCenter(): { x: number; y: number } {
    const r = this.svg.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
}
