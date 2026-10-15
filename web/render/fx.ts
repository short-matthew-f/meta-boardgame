// Transient effects: floating text, slot glow, dice, attack arrows, flying
// tiles. All are Web Animations on short-lived elements that remove themselves,
// so nothing here can leave the display in a wrong state. `ms` is already
// scaled by the speed; at 0 (instant) every effect is skipped.
import { h, s } from '../dom.ts';
import type { BoardView } from './board.ts';

/** Floating text such as "+2 coins", rising from a slot (or the board's upper middle). */
export function floatText(board: BoardView, text: string, cls: string, slot: number | null, ms: number, stack = 0): void {
  if (ms <= 0) return;
  const c = board.center(slot);
  const pos = board.pct(c.x, c.y);
  const el = h('div', { class: `float ${cls}` }, text);
  el.style.left = pos.left;
  el.style.top = pos.top;
  board.fxHtml.append(el);
  const rise = -46 - stack * 22;
  el.animate(
    [{ transform: 'translate(-50%, -50%)', opacity: 0 }, { transform: `translate(-50%, ${rise * 0.4}px)`, opacity: 1, offset: 0.2 }, { transform: `translate(-50%, ${rise}px)`, opacity: 1, offset: 0.75 }, { transform: `translate(-50%, ${rise - 10}px)`, opacity: 0 }],
    { duration: Math.max(ms, 500), easing: 'ease-out' },
  ).finished.then(() => el.remove(), () => el.remove());
}

/** A glowing outline around a slot card. */
export function glowSlot(board: BoardView, slot: number, cls: string, ms: number): void {
  if (ms <= 0 || !board.lay) return;
  const g = board.lay.slots[slot];
  if (!g) return;
  const r = s('rect', { class: `glow ${cls}`, x: g.cx - g.w / 2 - 4, y: g.cy - g.h / 2 - 4, width: g.w + 8, height: g.h + 8, rx: 12 });
  board.fxG.append(r);
  r.animate([{ opacity: 0, strokeWidth: 2 }, { opacity: 1, strokeWidth: 8, offset: 0.3 }, { opacity: 1, strokeWidth: 6, offset: 0.7 }, { opacity: 0, strokeWidth: 2 }], { duration: ms, easing: 'ease-in-out' })
    .finished.then(() => r.remove(), () => r.remove());
}

/** Flash the whole board card (attack hit, lap, shield). */
export function flashBoard(board: BoardView, cls: string, ms: number): void {
  if (ms <= 0) return;
  board.el.classList.add(cls);
  setTimeout(() => board.el.classList.remove(cls), ms);
}

/** Expanding ring around the token (lap income). */
export function ringPulse(board: BoardView, slot: number, ms: number): void {
  if (ms <= 0 || !board.lay) return;
  const t = board.lay.token(slot);
  const r = s('circle', { class: 'pulse', cx: t.x, cy: t.y, r: 14 });
  board.fxG.append(r);
  r.animate([{ r: 14, opacity: 0.9, strokeWidth: 6 }, { r: 70, opacity: 0, strokeWidth: 1 }], { duration: ms, easing: 'ease-out' })
    .finished.then(() => r.remove(), () => r.remove());
}

export function clearDice(board: BoardView): void {
  board.diceEl.replaceChildren();
}

/** Show dice in the middle of the board. With ms > 0 they tumble first and then settle on `values`. */
export function showDice(board: BoardView, values: number[], sides: number[], ms: number): void {
  const dice = values.map((v, i) => h('div', { class: 'die', 'data-sides': sides[i] ?? 6 }, h('span', undefined, String(v)), h('i', undefined, `d${sides[i] ?? 6}`)));
  board.diceEl.replaceChildren(...dice);
  if (ms <= 0) return;
  dice.forEach((d, i) => {
    const face = d.firstElementChild as HTMLElement;
    d.classList.add('tumbling');
    const iv = setInterval(() => { face.textContent = String(1 + Math.floor(Math.random() * (sides[i] ?? 6))); }, 70);
    d.animate(
      [{ transform: 'rotate(0deg) scale(.7)' }, { transform: `rotate(${360 + i * 90}deg) scale(1.15) translateY(-14px)`, offset: 0.55 }, { transform: `rotate(${720 + i * 90}deg) scale(1)` }],
      { duration: ms, easing: 'cubic-bezier(.2,.7,.3,1)' },
    ).finished.then(() => {}, () => {}).finally(() => {
      clearInterval(iv);
      face.textContent = String(values[i]);
      d.classList.remove('tumbling');
      d.animate([{ transform: 'scale(1.25)' }, { transform: 'scale(1)' }], { duration: 160 });
    });
  });
}

/** Arrow from the attacker's board to the target's, then a hit mark (or a block mark when cancelled). */
export function attackArrow(overlay: SVGSVGElement, from: BoardView, to: BoardView, cancelled: boolean, ms: number): void {
  if (ms <= 0) return;
  const a = from.ringCenter();
  const b = to.ringCenter();
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const line = s('line', { class: `arrow${cancelled ? ' blocked' : ''}`, x1: a.x, y1: a.y, x2: b.x, y2: b.y, 'marker-end': 'url(#arrowhead)' });
  line.style.strokeDasharray = String(len);
  overlay.append(line);
  line.animate([{ strokeDashoffset: len, opacity: 1 }, { strokeDashoffset: 0, opacity: 1, offset: 0.55 }, { strokeDashoffset: 0, opacity: 1, offset: 0.85 }, { strokeDashoffset: 0, opacity: 0 }], { duration: ms, easing: 'ease-in-out' })
    .finished.then(() => line.remove(), () => line.remove());
  const hit = s('circle', { class: `hit${cancelled ? ' blocked' : ''}`, cx: b.x, cy: b.y, r: 10 });
  overlay.append(hit);
  hit.animate([{ r: 10, opacity: 0 }, { r: 10, opacity: 0, offset: 0.5 }, { r: 90, opacity: 0.85, offset: 0.7 }, { r: 130, opacity: 0 }], { duration: ms })
    .finished.then(() => hit.remove(), () => hit.remove());
}

/** Fly a copy of a shop tile onto its slot. Resolves when it lands. */
export function flyTile(from: DOMRect, to: DOMRect, label: string, color: string, ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  const el = h('div', { class: 'fly' }, label);
  el.style.cssText = `left:${from.left}px;top:${from.top}px;width:${from.width}px;height:${from.height}px;border-top-color:${color}`;
  document.body.append(el);
  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  const k = Math.min(to.width / from.width, 1.6);
  return el.animate(
    [{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 40}px) scale(${(1 + k) / 2 + 0.15})`, opacity: 1, offset: 0.5 }, { transform: `translate(${dx}px, ${dy}px) scale(${k})`, opacity: 0.95 }],
    { duration: ms, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' },
  ).finished.then(() => el.remove(), () => el.remove());
}

/** Slide a new shop tile in from the right. */
export function slideIn(el: HTMLElement, ms: number): void {
  if (ms <= 0) return;
  el.animate([{ transform: 'translateX(46px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: ms, easing: 'ease-out' });
}
