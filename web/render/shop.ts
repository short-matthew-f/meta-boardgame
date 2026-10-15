// The shop row (6 tiles), a detail line, and the fixed die-mod menu.
import type { GameConfig, TileId } from '../../engine/types.ts';
import { describeMod, describeTile } from '../../engine/describe.ts';
import { h, clear } from '../dom.ts';
import type { Affordances } from '../types.ts';
import { slideIn } from './fx.ts';

export type ShopHandlers = { tile(index: number): void; mod(id: string): void };

export type ShopProps = {
  shop: TileId[];
  /** Coins of the active player: unaffordable tiles are dimmed. */
  coins: number;
  /** Mods the active player already owns (persistent and consumable ones cannot be bought twice). */
  owned: string[];
  config: GameConfig;
  aff: Affordances;
  /** Shop index a bot has just picked. */
  preview: number | null;
  /** Mod id a bot has just picked. */
  previewMod: string | null;
  slideMs: number;
};

export class ShopView {
  readonly el: HTMLElement;
  private row = h('div', { class: 'shop-row' });
  private detail = h('div', { class: 'detail' });
  private modRow = h('div', { class: 'mod-row' });
  private ids: TileId[] = [];
  private hover: { kind: 'tile' | 'mod'; id: string } | null = null;
  private last: ShopProps | null = null;

  constructor(private handlers: ShopHandlers) {
    this.el = h('section', { class: 'shop' }, h('div', { class: 'shop-head' }, h('h2', undefined, 'Shop'), h('span', { class: 'lbl' }, 'Die mods'), this.modRow), this.row, this.detail);
    this.row.addEventListener('click', (e) => {
      const t = (e.target as Element).closest('[data-i]');
      if (t) this.handlers.tile(Number(t.getAttribute('data-i')));
    });
    this.modRow.addEventListener('click', (e) => {
      const t = (e.target as Element).closest('[data-mod]');
      if (t) this.handlers.mod(t.getAttribute('data-mod')!);
    });
    const hoverOf = (e: Event) => {
      const t = e.target as Element;
      const tile = t.closest('[data-i]');
      const mod = t.closest('[data-mod]');
      this.hover = tile ? { kind: 'tile', id: tile.getAttribute('data-i')! } : mod ? { kind: 'mod', id: mod.getAttribute('data-mod')! } : null;
      if (this.last) this.renderDetail(this.last);
    };
    this.el.addEventListener('mouseover', hoverOf);
    this.el.addEventListener('mouseleave', () => { this.hover = null; if (this.last) this.renderDetail(this.last); });
  }

  update(p: ShopProps): void {
    this.last = p;
    const fresh = p.shop.map((id, i) => id !== this.ids[i]);
    this.ids = p.shop.slice();
    clear(this.row);
    for (let i = 0; i < p.shop.length; i++) {
      const def = p.config.tileSet.find((t) => t.id === p.shop[i])!;
      const cls = ['stile'];
      if (def.cost > p.coins) cls.push('poor');
      if (p.aff.shopClickable.includes(i)) cls.push('clickable');
      if (p.aff.shopSelected === i) cls.push('selected');
      if (p.preview === i) cls.push('preview');
      const tag = def.tags[0] ?? 'expansion';
      const node = h('button', { class: cls.join(' '), type: 'button', 'data-i': i, title: describeTile(def, p.config.tileSet), style: `--tag: var(--tag-${tag})` },
        h('span', { class: 'sname' }, def.name),
        h('span', { class: 'smeta' }, h('b', undefined, `${def.cost}c`), h('span', { class: 'stag' }, def.tags.join(' '))));
      this.row.append(node);
      if (fresh[i] && p.slideMs > 0) slideIn(node, p.slideMs);
    }
    clear(this.modRow);
    for (const m of p.config.modSet) {
      const have = (m.scope === 'persistent' || m.scope === 'consumable') && p.owned.includes(m.id);
      const cls = ['smod'];
      if (m.cost > p.coins || have) cls.push('poor');
      if (p.aff.modClickable.includes(m.id)) cls.push('clickable');
      if (p.previewMod === m.id) cls.push('preview');
      this.modRow.append(h('button', { class: cls.join(' '), type: 'button', 'data-mod': m.id, title: describeMod(m) + (have ? ' (owned)' : '') },
        h('span', undefined, m.name), h('b', undefined, `${m.cost}c`)));
    }
    this.renderDetail(p);
  }

  private renderDetail(p: ShopProps): void {
    let text = '';
    const cfg = p.config;
    if (this.hover?.kind === 'mod') {
      const m = cfg.modSet.find((x) => x.id === this.hover!.id);
      if (m) text = describeMod(m);
    } else {
      const idx = this.hover?.kind === 'tile' ? Number(this.hover.id) : p.aff.shopSelected;
      const id = idx != null ? p.shop[idx] : undefined;
      const def = id ? cfg.tileSet.find((t) => t.id === id) : undefined;
      if (def) text = describeTile(def, cfg.tileSet);
    }
    this.detail.textContent = text || 'Hover or select a tile to read what it does.';
    this.detail.classList.toggle('empty', !text);
  }

  tileRect(index: number): DOMRect | null {
    const el = this.row.children[index] as HTMLElement | undefined;
    return el ? el.getBoundingClientRect() : null;
  }
}
