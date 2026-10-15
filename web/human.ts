// The human seat's controller. It turns `legalActions(state)` into clickable
// affordances and resolves a promise with the chosen Action. It never builds
// an action it has not found in the legal list (compared with `actionKey`),
// and it has no DOM: the table view feeds clicks in and renders `Affordances`.
import type { Action, GameState } from '../engine/types.ts';
import { actionKey } from '../engine/engine.ts';
import { tileName } from '../engine/describe.ts';
import { tileDef } from '../engine/board.ts';
import { NO_AFFORDANCES } from './types.ts';
import type { Affordances, HumanController } from './types.ts';

export class HumanPlayer implements HumanController {
  /** Called whenever what the human can click changes. */
  onChange: (aff: Affordances) => void = () => {};

  private state: GameState | null = null;
  private legal: Action[] = [];
  private resolver: ((a: Action | null) => void) | null = null;
  private selShop: number | null = null;
  private selSell: number | null = null;

  get waiting(): boolean { return this.resolver !== null; }

  act(state: GameState, legal: Action[]): Promise<Action | null> {
    this.cancel();
    this.state = state;
    this.legal = legal;
    this.selShop = null;
    this.selSell = null;
    return new Promise((resolve) => {
      this.resolver = resolve;
      this.emit();
    });
  }

  /** Stop waiting (seat handed back, or the game was abandoned). The pending act() resolves null. */
  cancel(): void {
    const r = this.resolver;
    this.resolver = null;
    this.state = null;
    this.legal = [];
    this.selShop = null;
    this.selSell = null;
    this.onChange(NO_AFFORDANCES);
    r?.(null);
  }

  // ----- clicks ---------------------------------------------------------

  clickShop(index: number): void {
    if (!this.state || !this.shopClickable().includes(index)) return;
    this.selSell = null;
    this.selShop = this.selShop === index ? null : index;
    this.emit();
  }

  clickSlot(slot: number): void {
    const st = this.state;
    if (!st) return;
    if (this.selShop != null) {
      this.take({ type: 'buyTile', shopIndex: this.selShop, slot });
      return;
    }
    if (this.sellable().includes(slot)) {
      this.selSell = this.selSell === slot ? null : slot;
      this.emit();
    }
  }

  clickGap(afterSlot: number): void {
    if (this.selShop != null) this.take({ type: 'buyExpansion', shopIndex: this.selShop, afterSlot });
  }

  clickMod(modId: string): void {
    if (this.selShop == null && this.selSell == null) this.take({ type: 'buyMod', modId });
  }

  clickBoard(player: number): void {
    this.take({ type: 'chooseTarget', player });
  }

  clickButton(action: Action): void {
    this.take(action);
  }

  clickCancel(): void {
    this.selShop = null;
    this.selSell = null;
    this.emit();
  }

  // ----- internals ------------------------------------------------------

  /** Resolve with `action` only if the engine would accept it. */
  private take(action: Action): void {
    const found = this.legal.find((a) => actionKey(a) === actionKey(action));
    if (!found || !this.resolver) return;
    const r = this.resolver;
    this.resolver = null;
    this.state = null;
    this.legal = [];
    this.onChange(NO_AFFORDANCES);
    r(found);
  }

  private emit(): void {
    this.onChange(this.affordances());
  }

  private shopClickable(): number[] {
    const out = new Set<number>();
    for (const a of this.legal) if (a.type === 'buyTile' || a.type === 'buyExpansion') out.add(a.shopIndex);
    return [...out].sort((a, b) => a - b);
  }

  private sellable(): number[] {
    return this.legal.flatMap((a) => (a.type === 'sellTile' ? [a.slot] : []));
  }

  affordances(): Affordances {
    const st = this.state;
    if (!st) return NO_AFFORDANCES;
    const cfg = st.config;
    const legal = this.legal;
    const aff: Affordances = { ...NO_AFFORDANCES, buttons: [], shopClickable: [], modClickable: [], slotTargets: [], gapTargets: [], sellable: [], targets: [] };

    if (st.phase === 'roll') {
      const choice = st.pending?.choice ?? null;
      if (choice?.kind === 'chooseTarget') {
        aff.prompt = `Choose a target for ${tileName(cfg, choice.tile)}`;
        aff.targets = legal.flatMap((a) => (a.type === 'chooseTarget' ? [a.player] : []));
        return aff;
      }
      if (choice?.kind === 'reroll') {
        const total = choice.dice.reduce((x, y) => x + y, 0);
        aff.prompt = `You rolled ${total}. Reroll with your token, or keep it?`;
        for (const a of legal) {
          if (a.type === 'reroll') aff.buttons.push({ label: 'Reroll', action: a, kind: 'secondary' });
          if (a.type === 'keepRoll') aff.buttons.push({ label: `Keep ${total}`, action: a, kind: 'primary' });
        }
        return aff;
      }
      aff.prompt = 'Roll the dice';
      for (const a of legal) if (a.type === 'roll') aff.buttons.push({ label: 'Roll', action: a, kind: 'primary' });
      return aff;
    }

    // shop phase
    aff.shopClickable = this.shopClickable();
    aff.modClickable = legal.flatMap((a) => (a.type === 'buyMod' ? [a.modId] : []));
    const pass = legal.find((a) => a.type === 'pass');

    if (this.selShop != null) {
      const id = st.shop[this.selShop]!;
      const name = tileName(cfg, id);
      aff.shopSelected = this.selShop;
      aff.cancel = true;
      const me = st.players[st.activePlayer]!;
      if (tileDef(cfg, id).tags.includes('expansion')) {
        aff.gapTargets = legal.flatMap((a) => (a.type === 'buyExpansion' && a.shopIndex === this.selShop ? [a.afterSlot] : []));
        aff.prompt = `Where does ${name} go? Click a + between two slots.`;
      } else {
        aff.slotTargets = legal.flatMap((a) => (a.type === 'buyTile' && a.shopIndex === this.selShop ? [{ slot: a.slot, replaces: me.board[a.slot] != null }] : []));
        aff.prompt = `Pick a slot for ${name}`;
      }
      return aff;
    }

    if (this.selSell != null) {
      const id = st.players[st.activePlayer]!.board[this.selSell]!;
      const refund = Math.floor(tileDef(cfg, id).cost * cfg.sellRefund);
      aff.sellSelected = this.selSell;
      aff.sellable = this.sellable();
      aff.cancel = true;
      aff.prompt = `Sell ${tileName(cfg, id)} from slot ${this.selSell}?`;
      const sell = legal.find((a) => a.type === 'sellTile' && a.slot === this.selSell);
      if (sell) aff.buttons.push({ label: `Sell for ${refund}c`, action: sell, kind: 'danger' });
      return aff;
    }

    aff.sellable = this.sellable();
    const canBuy = aff.shopClickable.length > 0 || aff.modClickable.length > 0;
    aff.prompt = canBuy || aff.sellable.length > 0
      ? 'Buy a tile, a mod, sell, or pass'
      : 'Nothing to buy or sell. Pass.';
    if (pass) aff.buttons.push({ label: 'Pass', action: pass, kind: canBuy ? 'secondary' : 'primary' });
    return aff;
  }
}
