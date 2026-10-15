// The setup screen: seats, end condition, seed, speed.
import { BOTS } from '../bots/index.ts';
import { h, store } from './dom.ts';
import { SPEEDS } from './types.ts';
import type { SetupChoice, Speed } from './types.ts';
import { PLAYER_COLORS } from './render/table.ts';

const BLURB: Record<string, string> = {
  random: 'any legal move',
  greedy: 'best immediate gain',
  'greedy-random': 'greedy, random placement',
  scorer: 'cheapest VP tiles',
  aggressor: 'attack tiles, targets the leader',
  turtle: 'defense and steady score',
  expander: 'grows its board',
  lookahead: 'one-roll expected value',
};
const BOT_ORDER = ['scorer', 'greedy', 'aggressor', 'turtle', 'expander', 'lookahead', 'greedy-random', 'random'];
const END_DEFAULT = { turnCap: 15, vpRace: 30, lapRace: 6 } as const;
const END_UNIT = { turnCap: 'rounds', vpRace: 'VP', lapRace: 'laps' } as const;
const KEY = 'metaBoardgame.setup.v1';

const label = (b: string) => b.charAt(0).toUpperCase() + b.slice(1).replace(/-/g, ' ');

export function randomSeed(): number {
  return 1 + Math.floor(Math.random() * 999_999);
}

function loadSaved(): Partial<SetupChoice> {
  try { return JSON.parse(store.get(KEY) ?? '{}') as Partial<SetupChoice>; } catch { return {}; }
}

export function showSetup(host: HTMLElement, onStart: (c: SetupChoice) => void): void {
  const saved = loadSaved();
  const botNames = BOT_ORDER.filter((b) => b in BOTS);
  let players = saved.seats && saved.seats.length >= 2 && saved.seats.length <= 4 ? saved.seats.length : 4;
  const seatValues: string[] = [0, 1, 2, 3].map((i) => {
    const v = saved.seats?.[i];
    return v === 'human' || (v && botNames.includes(v)) ? v : (['human', 'scorer', 'aggressor', 'turtle'][i] as string);
  });
  let endMode: SetupChoice['endMode'] = saved.endMode ?? 'turnCap';
  let endValue = saved.endValue ?? END_DEFAULT[endMode];
  let seed = randomSeed();
  let speed: Speed = saved.speed && SPEEDS.includes(saved.speed) ? saved.speed : 'normal';

  const seatRows = [0, 1, 2, 3].map((i) => {
    const sel = h('select', { id: `seat${i}`, 'aria-label': `Seat ${i + 1}` },
      h('option', { value: 'human' }, 'Human'),
      ...botNames.map((b) => h('option', { value: b }, `${label(b)} — ${BLURB[b] ?? ''}`)));
    sel.value = seatValues[i]!;
    sel.addEventListener('change', () => { seatValues[i] = sel.value; });
    const row = h('div', { class: 'seat-row' }, h('span', { class: 'swatch', style: `background:${PLAYER_COLORS[i]}` }), h('label', { for: `seat${i}` }, `Player ${i + 1}`), sel);
    return row;
  });
  const seatBox = h('div', { class: 'seats' }, ...seatRows);

  const playerBtns = [2, 3, 4].map((n) => {
    const b = h('button', { type: 'button', class: 'segbtn' }, `${n} players`);
    b.addEventListener('click', () => { players = n; sync(); });
    return b;
  });

  const modeSel = h('select', { id: 'endmode' },
    h('option', { value: 'turnCap' }, 'Turn cap (fixed rounds)'),
    h('option', { value: 'vpRace' }, 'VP race (first to N VP)'),
    h('option', { value: 'lapRace' }, 'Lap race (first to N laps)'));
  modeSel.value = endMode;
  const valueIn = h('input', { id: 'endvalue', type: 'number', min: 1, max: 99, step: 1 });
  valueIn.value = String(endValue);
  const unit = h('span', { class: 'unit' });
  modeSel.addEventListener('change', () => {
    endMode = modeSel.value as SetupChoice['endMode'];
    endValue = END_DEFAULT[endMode];
    valueIn.value = String(endValue);
    sync();
  });
  valueIn.addEventListener('input', () => { endValue = Math.max(1, Math.min(99, Math.floor(Number(valueIn.value)) || END_DEFAULT[endMode])); });

  const seedIn = h('input', { id: 'seed', type: 'text', inputmode: 'numeric', autocomplete: 'off', spellcheck: 'false' });
  seedIn.value = String(seed);
  seedIn.addEventListener('input', () => {
    const n = Math.floor(Number(seedIn.value.trim()));
    if (Number.isFinite(n) && n >= 0) seed = n;
  });
  const dice = h('button', { type: 'button', class: 'btn ghost', title: 'Pick a new random seed' }, 'Random');
  dice.addEventListener('click', () => { seed = randomSeed(); seedIn.value = String(seed); });

  const speedSel = h('div', { class: 'seg', role: 'group', 'aria-label': 'Initial speed' });
  const speedBtns = SPEEDS.map((sp) => {
    const b = h('button', { type: 'button', class: 'segbtn' }, label(sp));
    b.addEventListener('click', () => { speed = sp; sync(); });
    speedSel.append(b);
    return b;
  });

  const start = h('button', { type: 'button', class: 'btn primary big', id: 'start' }, 'Start game');
  start.addEventListener('click', () => {
    const typed = Math.floor(Number(seedIn.value.trim()));
    if (Number.isFinite(typed) && typed >= 0) seed = typed; else { seed = randomSeed(); seedIn.value = String(seed); }
    const choice: SetupChoice = { seats: seatValues.slice(0, players), endMode, endValue, seed, speed };
    store.set(KEY, JSON.stringify({ ...choice, seats: seatValues }));
    onStart(choice);
  });

  function sync(): void {
    seatRows.forEach((r, i) => { r.hidden = i >= players; });
    playerBtns.forEach((b, i) => b.classList.toggle('on', i + 2 === players));
    speedBtns.forEach((b, i) => b.classList.toggle('on', SPEEDS[i] === speed));
    unit.textContent = END_UNIT[endMode];
    host.dataset.players = String(players);
  }

  host.replaceChildren(h('main', { class: 'setup' },
    h('h1', undefined, 'Board Game Builder'),
    h('p', { class: 'lede' }, 'A loop-board tile game. Watch the bots think, or take any seat yourself.'),
    h('section', { class: 'card' }, h('h2', undefined, 'Table'), h('div', { class: 'seg', role: 'group', 'aria-label': 'Players' }, ...playerBtns), seatBox),
    h('section', { class: 'card' }, h('h2', undefined, 'Game end'),
      h('div', { class: 'row' }, h('label', { for: 'endmode' }, 'Mode'), modeSel),
      h('div', { class: 'row' }, h('label', { for: 'endvalue' }, 'Value'), valueIn, unit)),
    h('section', { class: 'card' }, h('h2', undefined, 'Seed and speed'),
      h('div', { class: 'row' }, h('label', { for: 'seed' }, 'Seed'), seedIn, dice),
      h('p', { class: 'hint' }, 'The same seed with the same seats deals the same shop and the same dice. Enter a seed to replay a game.'),
      h('div', { class: 'row' }, h('label', undefined, 'Speed'), speedSel)),
    start));
  sync();
}
