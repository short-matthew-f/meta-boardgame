// The animation queue. Events are played one beat at a time with delays from
// DURATIONS scaled by the speed. The display is a View: rendered from the
// pre-step state, advanced event by event, and replaced by a render of the true
// post-step state after the last event, so it cannot drift from the engine.
import type { Action, Event, GameState } from '../engine/types.ts';
import { effectiveDice, tileDef } from '../engine/board.ts';
import { modName, tileName } from '../engine/describe.ts';
import type { Decision } from '../bots/types.ts';
import { DURATIONS } from './timing.ts';
import type { Clock } from './timing.ts';
import { applyEvent, cloneView, firedSlot, hopCount, isTeleport, toView } from './viewmodel.ts';
import type { StepCtx } from './viewmodel.ts';
import type { Presenter, Seat, View } from './types.ts';
import type { TableView } from './render/table.ts';
import { seatLabel } from './render/table.ts';
import { attackArrow, clearDice, flashBoard, floatText, flyTile, glowSlot, ringPulse, showDice } from './render/fx.ts';

const resText = (res: 'coins' | 'vp', n: number) => `${n > 0 ? '+' : '−'}${Math.abs(n)} ${res === 'vp' ? 'VP' : Math.abs(n) === 1 ? 'coin' : 'coins'}`;

export class DomPresenter implements Presenter {
  private turnKey = '';

  constructor(private table: TableView, private clock: Clock, private seats: Seat[]) {}

  private ms(base: number): number { return this.clock.ms(base); }

  private async beat(base: number): Promise<void> {
    if (base > 0) await this.clock.beat(base);
  }

  turn(state: GameState): void {
    const t = this.table;
    t.preview = { slot: null, shop: null, mod: null };
    t.slideMs = this.ms(DURATIONS.shopRefill);
    t.render(toView(state), this.seats);
    const choice = state.pending?.choice;
    if (choice?.kind === 'reroll') {
      const b = t.boards[choice.player]!;
      if (b.diceEl.childElementCount === 0) showDice(b, choice.dice, effectiveDice(state, choice.player).map((d) => d.sides), 0);
    }
    const key = `${state.round}:${state.activePlayer}`;
    if (key !== this.turnKey && state.phase !== 'ended') {
      this.turnKey = key;
      t.panel.logHeader(`Round ${state.round} — Player ${state.activePlayer + 1} (${seatLabel(this.seats[state.activePlayer]!)})`);
    }
  }

  async thinking(decision: Decision, state: GameState): Promise<void> {
    const t = this.table;
    const p = state.activePlayer;
    const seat = this.seats[p]!;
    t.panel.showThinking(`Player ${p + 1}`, seatLabel(seat), decision, false);
    await this.beat(DURATIONS.thinkShow);
    t.panel.showThinking(`Player ${p + 1}`, seatLabel(seat), decision, true);
    const a = decision.action;
    t.preview = {
      slot: a.type === 'buyTile' ? a.slot : a.type === 'sellTile' ? a.slot : null,
      shop: a.type === 'buyTile' || a.type === 'buyExpansion' ? a.shopIndex : null,
      mod: a.type === 'buyMod' ? a.modId : null,
    };
    t.refresh();
    await this.beat(DURATIONS.thinkPick);
  }

  async events(events: Event[], before: GameState, after: GameState, action: Action): Promise<void> {
    const t = this.table;
    const cfg = before.config;
    const ctx: StepCtx = { before, after, action };
    const view = toView(before);
    const used = new Map<string, number>();
    let passed: number[] = [];
    // After a Keep the engine moves the token with no `rolled` event; the total sits in the pending roll.
    let rollTotal: number | null = action.type === 'keepRoll' ? (before.pending?.lastTotal ?? null) : null;
    t.preview = { slot: null, shop: null, mod: null };
    t.panel.clearThinkingLabel();
    t.slideMs = this.ms(DURATIONS.shopRefill);

    const draw = (v: View = view) => t.render(v, this.seats);
    const log = (...evs: Event[]) => t.panel.logEvents(evs, cfg);
    /** Apply the `resource` events that directly follow event i; returns the next index. */
    const trailing = (i: number, slot: number | null, owner: number): number => {
      let j = i + 1;
      let stack = 0;
      while (events[j]?.t === 'resource') {
        const r = events[j] as Extract<Event, { t: 'resource' }>;
        applyEvent(view, r, ctx);
        log(r);
        const mine = r.player === owner;
        floatText(t.boards[r.player]!, resText(r.res, r.delta), `${r.delta > 0 ? 'gain' : 'loss'} ${r.res}`, mine ? slot : null, this.ms(DURATIONS.tileFired), mine ? 0 : stack++);
        j++;
      }
      return j;
    };

    for (let i = 0; i < events.length;) {
      const e = events[i]!;
      const board = 'player' in e ? t.boards[e.player] : undefined;
      switch (e.t) {
        case 'rolled': {
          log(e);
          const sides = effectiveDice(before, e.player).map((d) => d.sides);
          applyEvent(view, e, ctx);
          draw();
          showDice(board!, e.dice, e.dice.map((_, k) => sides[k] ?? 6), this.ms(DURATIONS.diceTumble));
          rollTotal = e.total;
          await this.beat(DURATIONS.diceTumble);
          i++;
          break;
        }
        case 'moved': {
          log(e);
          const p = view.players[e.player]!;
          const size = p.board.length;
          const from = p.position;
          const forced = e.player !== before.activePlayer || isTeleport(events[i - 1], before);
          const hops = forced ? 0 : hopCount(from, e.to, size, e.passedStart, rollTotal);
          rollTotal = null;
          if (hops > 0 && e.to === (from + hops) % size) {
            const hopBase = Math.min(DURATIONS.tokenHopPerSlot, DURATIONS.tokenMoveMax / hops);
            passed = [];
            for (let k = 1; k <= hops; k++) {
              const slot = (from + k) % size;
              passed.push(slot);
              board!.placeToken(slot, 'hop', this.ms(hopBase) * 0.9);
              await this.beat(hopBase);
            }
          } else {
            board!.placeToken(e.to, 'slide', this.ms(DURATIONS.tokenSlide));
            await this.beat(DURATIONS.tokenSlide);
          }
          applyEvent(view, e, ctx);
          draw();
          i++;
          break;
        }
        case 'lap': {
          log(e);
          applyEvent(view, e, ctx);
          const slot = view.players[e.player]!.position;
          ringPulse(board!, slot, this.ms(DURATIONS.lapFlash));
          flashBoard(board!, 'lapflash', this.ms(DURATIONS.lapFlash));
          const j = trailing(i, null, e.player);
          draw();
          await this.beat(DURATIONS.lapFlash);
          i = j;
          break;
        }
        case 'tileFired': {
          log(e);
          const slot = firedSlot(view, e.player, e.tile, e.trigger, passed, used);
          if (slot != null) glowSlot(board!, slot, `t-${tileDef(cfg, e.tile).tags[0] ?? 'income'}`, this.ms(DURATIONS.tileFired));
          const j = trailing(i, slot, e.player);
          draw();
          await this.beat(DURATIONS.tileFired);
          i = j;
          break;
        }
        case 'resource': {
          const j = trailing(i - 1, null, e.player);
          draw();
          i = j;
          break;
        }
        case 'attacked': {
          log(e);
          const target = t.boards[e.target]!;
          attackArrow(t.overlay, t.boards[e.attacker]!, target, e.cancelled, this.ms(DURATIONS.attack));
          flashBoard(target, e.cancelled ? 'blocked' : 'hit', this.ms(DURATIONS.attack));
          floatText(target, e.cancelled ? 'Blocked!' : `${tileName(cfg, e.tile)}!`, e.cancelled ? 'info' : 'loss', null, this.ms(DURATIONS.attack));
          await this.beat(DURATIONS.attack);
          i++;
          break;
        }
        case 'bought': {
          log(e);
          i = await this.bought(e, view, ctx, i);
          break;
        }
        case 'expanded': {
          log(e);
          applyEvent(view, e, ctx);
          draw();
          glowSlot(board!, e.afterSlot + 1, 'place', this.ms(DURATIONS.expanded));
          floatText(board!, `${e.size} slots`, 'info', e.afterSlot + 1, this.ms(DURATIONS.expanded));
          await this.beat(DURATIONS.expanded);
          i++;
          break;
        }
        case 'sold': {
          log(e);
          const slot = action.type === 'sellTile' ? action.slot : null;
          if (slot != null) glowSlot(board!, slot, 'sell', this.ms(DURATIONS.sold));
          applyEvent(view, e, ctx);
          const j = trailing(i, slot, e.player);
          draw();
          await this.beat(DURATIONS.sold);
          i = j;
          break;
        }
        case 'locked': {
          log(e);
          applyEvent(view, e, ctx);
          draw();
          glowSlot(t.boards[e.player]!, e.slot, 'lock', this.ms(DURATIONS.locked));
          floatText(t.boards[e.player]!, 'Locked', 'loss', e.slot, this.ms(DURATIONS.locked));
          await this.beat(DURATIONS.locked);
          i++;
          break;
        }
        case 'shopRefilled': {
          log(e);
          applyEvent(view, e, ctx);
          draw();
          await this.beat(DURATIONS.shopRefill);
          i++;
          break;
        }
        case 'roundEnded': {
          log(e);
          await this.beat(DURATIONS.roundEnd);
          i++;
          break;
        }
        case 'gameEnded':
          log(e);
          i++;
          break;
      }
    }

    // Land on the truth.
    t.preview = { slot: null, shop: null, mod: null };
    draw(toView(after));
    if (after.activePlayer !== before.activePlayer) t.boards.forEach(clearDice);
    await this.beat(DURATIONS.settle);
  }

  /** A purchase: tiles fly from the shop to the chosen slot, mods just appear. */
  private async bought(e: Extract<Event, { t: 'bought' }>, view: View, ctx: StepCtx, i: number): Promise<number> {
    const t = this.table;
    const cfg = ctx.before.config;
    const a = ctx.action;
    const board = t.boards[e.player]!;
    if (a.type === 'buyMod') {
      applyEvent(view, e, ctx);
      t.render(view, this.seats);
      floatText(board, modName(cfg, a.modId), 'info', null, this.ms(DURATIONS.modBought));
      await this.beat(DURATIONS.modBought);
      return i + 1;
    }
    const def = tileDef(cfg, e.item);
    const isExpansion = a.type === 'buyExpansion';
    const from = a.type === 'buyTile' || a.type === 'buyExpansion' ? t.shop.tileRect(a.shopIndex) : null;
    const slot = e.slot ?? 1;
    const target = isExpansion ? board.gapRect(a.type === 'buyExpansion' ? a.afterSlot : 0) : board.slotRect(slot);
    const masked = cloneView(view);
    applyEvent(view, e, ctx);
    // While the tile is in the air the slot still shows what was there before.
    const shown = cloneView(view);
    if (!isExpansion) shown.players[e.player]!.board[slot] = masked.players[e.player]!.board[slot] ?? null;
    t.render(shown, this.seats);
    if (!isExpansion) glowSlot(board, slot, 'place', this.ms(DURATIONS.bought));
    if (from) void flyTile(from, target, def.name, `var(--tag-${def.tags[0] ?? 'expansion'})`, this.ms(DURATIONS.bought));
    await this.beat(DURATIONS.bought);
    t.render(view, this.seats);
    if (!isExpansion) glowSlot(board, slot, 'place', this.ms(DURATIONS.bought));
    return i + 1;
  }
}
