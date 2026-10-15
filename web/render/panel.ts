// The side panel: what a bot is thinking, or what the human is asked to do,
// plus the scrolling event log.
import type { Event, GameConfig } from '../../engine/types.ts';
import { describeEvent, tileName } from '../../engine/describe.ts';
import type { Decision } from '../../bots/types.ts';
import { clear, h } from '../dom.ts';
import type { Affordances } from '../types.ts';

export type PanelHandlers = { button(index: number): void; cancel(): void };

export class PanelView {
  readonly el: HTMLElement;
  private card = h('section', { class: 'card think' });
  private logEl = h('ol', { class: 'log' });
  private think: { name: string; decision: Decision; picked: boolean } | null = null;

  constructor(private handlers: PanelHandlers) {
    this.el = h('aside', { class: 'side' }, this.card, h('section', { class: 'card logcard' }, h('h2', undefined, 'Event log'), this.logEl));
    this.card.addEventListener('click', (e) => {
      const b = (e.target as Element).closest('button');
      if (!b) return;
      if (b.hasAttribute('data-btn')) this.handlers.button(Number(b.getAttribute('data-btn')));
      else if (b.hasAttribute('data-cancel')) this.handlers.cancel();
    });
    this.renderIdle('Waiting for the first turn.');
  }

  /** A bot's decision: candidates first, then (picked = true) the chosen one lit. */
  showThinking(seatName: string, bot: string, decision: Decision, picked: boolean): void {
    this.think = { name: `${seatName} (${bot})`, decision, picked };
    clear(this.card);
    this.card.className = 'card think' + (picked ? ' picked' : ' pondering');
    const list = h('ol', { class: 'cands' });
    decision.candidates.forEach((c, i) => {
      list.append(h('li', { class: i === 0 && picked ? 'chosen' : '' },
        h('span', { class: 'score' }, fmtScore(c.score)),
        h('span', { class: 'why' }, c.why),
        i === 0 && picked ? h('span', { class: 'tick' }, 'chosen') : null));
    });
    this.card.append(h('h2', undefined, picked ? 'Decision' : 'Thinking', h('span', { class: 'who' }, this.think.name)));
    if (decision.note) this.card.append(h('p', { class: 'note' }, decision.note));
    this.card.append(list);
  }

  /** Keep the last decision visible while its action plays; relabel it as played. */
  clearThinkingLabel(): void {
    if (this.think) this.card.classList.add('played');
  }

  showHuman(seatName: string, aff: Affordances): void {
    this.think = null;
    clear(this.card);
    this.card.className = 'card human';
    const buttons = h('div', { class: 'btns' });
    aff.buttons.forEach((b, i) => buttons.append(h('button', { class: `btn ${b.kind}`, type: 'button', 'data-btn': i }, b.label)));
    if (aff.cancel) buttons.append(h('button', { class: 'btn ghost', type: 'button', 'data-cancel': '' }, 'Cancel'));
    this.card.append(h('h2', undefined, 'Your move', h('span', { class: 'who' }, seatName)), h('p', { class: 'prompt' }, aff.prompt), buttons);
  }

  renderIdle(text: string): void {
    this.think = null;
    clear(this.card);
    this.card.className = 'card idle';
    this.card.append(h('h2', undefined, 'Table'), h('p', { class: 'note' }, text));
  }

  logHeader(text: string): void {
    this.logEl.append(h('li', { class: 'hdr' }, text));
    this.scroll();
  }

  logEvents(events: Event[], config: GameConfig): void {
    for (const e of events) {
      const text = describeEvent(e).replace(/^\s+/, '').replace(/^--\s*/, '');
      const nice = prettyIds(text, config);
      const cls = e.t === 'roundEnded' ? 'round' : e.t === 'gameEnded' ? 'end' : e.t === 'resource' ? 'res' : e.t === 'rolled' ? 'roll' : '';
      this.logEl.append(h('li', { class: cls }, nice));
    }
    while (this.logEl.children.length > 600) this.logEl.firstElementChild!.remove();
    this.scroll();
  }

  clearLog(): void {
    clear(this.logEl);
  }

  private scroll(): void {
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }
}

function fmtScore(n: number): string {
  const a = Math.abs(n);
  const s = a >= 100 ? a.toFixed(0) : a >= 10 ? a.toFixed(1) : a.toFixed(2);
  return (n < 0 ? '−' : '') + s;
}

/** describeEvent prints tile ids (`bandit-camp`); show names instead. */
function prettyIds(text: string, config: GameConfig): string {
  let out = text;
  for (const t of config.tileSet) if (t.id.includes('-')) out = out.split(t.id).join(tileName(config, t.id));
  for (const t of config.tileSet) out = out.replace(new RegExp(`\\b${t.id}\\b`, 'g'), t.name);
  return out;
}
