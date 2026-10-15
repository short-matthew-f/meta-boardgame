# Board Game Builder — simulation engine

A headless game engine, a batch simulator for balance work, and a browser UI
for a loop-board tile game. The UI imports the engine and bots directly and
reimplements no rule.

TypeScript, Node 20+, Vitest, esbuild. No runtime dependencies.

```
engine/     pure engine: types, seeded RNG, board helpers, step / legalActions, describe (readable text), traffic (pass / landing masses)
              engine.ts dispatch + roll / turn flow, effects.ts effect interpreter, attack.ts, loopsShop.ts, endgame.ts,
              shared.ts + sharedBoard.ts the shared-board mode
tiles/      starter tiles, shared-board tiles and landmarks, and die mods as JSON, plus a schema validator
bots/       Random, Greedy, Scorer, Aggressor, Turtle, Expander, Landlord, Builder (weight tables), Lookahead (one-ply EV)
              placement.ts the shared-board, class-aware placement terms
sim/        playGame / replay, batch runner with seat rotation, event-log metrics, CLI, experiments/
web/        browser UI (vanilla TypeScript, esbuild into dist/)
  main.ts       entry: setup screen <-> table screen
  setup.ts      table setup form
  game.ts       wires one game: session, clock, presenter, human controller, table
  loop.ts       async game loop (bot decide / human act -> step -> present)
  human.ts      legal actions -> clickable affordances, resolves with an Action
  presenter.ts  animation queue: plays events beat by beat at the chosen speed
  viewmodel.ts  display model advanced one event at a time
  timing.ts     DURATIONS table, speed scale, pause / step clock
  render/       board (SVG ring), shop, panel (thinking, prompt, log), table, fx
  build.mjs     esbuild bundle + dev server; test/smoke.mjs browser smoke test
tests/      vitest suites, one per build step (web-* cover loop, view model, human)
DECISIONS.md  design decisions, interpretations, and the balance log
```

## Run

```sh
npm install
npm test                 # all suites
npm run typecheck
npm run sim -- batch     # 1000 games, standard lineup, turnCap 15
npm run sim -- batch --games 500 --lineup lookahead,scorer,greedy,turtle --endMode vpRace --endValue 30
npm run sim -- balance   # standard lineup × three end modes + placement value + random floor
npm run sim -- batch --fireOnPass --landBonus 2 --tileEndVp 0.34 --tiles superlinear --endMode vpPool --endValue 60   # experimental variants, off by default
node --import tsx sim/experiments/density.ts   # the variant experiment (about 100 s)
npm run sim -- batch --board shared --lineup random,random,random,random   # shared board mode (see below)
npm run sim -- batch --board shared --sideLength 8 --dice 2d6 --endMode landmarkRace --endValue 3
node --import tsx sim/experiments/shared.ts   # shared board versus loops, ten cells (see sim/experiments/shared-results.md)
node --import tsx sim/experiments/perimeter.ts   # fixed-perimeter shared board and its variant options (sim/experiments/perimeter-results.md)
npm run sim -- batch --board shared --perimeter 24 --catchUp 1 --tollOnPass 0.5 --buyoutPremium 2 --replacementTax 2 --replacementTaxEscalates
npm run sim -- batch --board shared --lineup greedy,scorer,landlord,builder   # the shared-board archetypes
npm run sim -- batch --extended    # loops mode with interaction index and progression (always on in shared mode)
npm run sim -- replay --seed 943   # print one game's event log
npm run sim -- batch --json        # the BatchReport as JSON
npm run dev:web                    # the browser UI on http://localhost:8000 (rebuilds on save)
npm run build:web                  # production bundle into dist/
```

A 1000-game batch of the standard lineup runs in about 2.5 s; `balance` in
about 15 s.

## How it fits together

- **State** is one plain JSON object (`GameState`). `step(state, action)`
  clones, applies, and returns `{ state, events }`. The RNG cursor lives in
  state, so `(seed, actions[])` replays exactly; `sim/runner.ts` has `replay`.
- **Legal actions** come from `legalActions(state)`. `step` rejects anything
  not in that list, so every bot is rule-correct by construction.
- **Tiles are data.** `tiles/starter.json` holds 23 tiles (63 copies) and
  `tiles/mods.json` the five die mods. Effects are small JSON expressions
  interpreted by `engine/engine.ts`; the schema in `tiles/schema.ts` is
  checked at import and in tests.
- **Every tunable number is in `GameConfig`** (`engine/engine.ts`,
  `BASE_CONFIG`). Pass overrides to `defaultConfig()` or to the CLI.
- **Metrics read only the event log.** `sim/metrics.ts` is a set of reducers
  over `GameRecord[]`; `flagProblems` applies the spec's thresholds.
- **Bots** pick from the legal list. Archetypes are `Profile` weight tables in
  `bots/archetypes.ts`; `bots/lookahead.ts` is the one-ply reference.
- **Bots explain themselves.** Every `Bot` has `choose` (the fast path the
  batch sim uses) and `decide`, which returns the same action for the same
  state, legal list and `Rng` state, plus a `Decision`: up to 6 `candidates`
  sorted by score (chosen action first, each with a one-line `why` built from
  the actual scoring terms) and an optional `note` on the strategy in force.
  Both share one scoring function; strings are only built in `decide`, so the
  batch speed is unchanged. `engine/describe.ts` is the shared, DOM-free text
  layer for the UI: `describeAction`, `describeEvent` (also used by the CLI
  replay), `describeEffects`, `describeTile` and `describeMod`.

## Web UI

A static page, no framework: `web/index.html`, `styles.css`, `board.css` and
one bundle, `dist/app.js`, built with esbuild. Asset paths are relative, so it
works from any sub-path.

```sh
npm run dev:web      # esbuild serve on http://localhost:8000, unminified, rebuilds on change
npm run build:web    # dist/: app.js (ESM, minified, sourcemap), index.html, *.css
```

**Deploys** to GitHub Pages from `.github/workflows/pages.yml`: every push runs
typecheck, tests and the build, and only a push to the default branch deploys
(`https://<user>.github.io/meta-boardgame/`). Pages must be set to the
"GitHub Actions" source once, under Settings, Pages.

**Setup screen.** 2 to 4 seats, each a bot archetype or Human (any number of
humans), the end mode and value, the seed (random by default, always shown,
editable so a game can be replayed), and the starting speed.

**Table.** The active player's board is the large one; the others are small
around it and swap size when the turn passes. Slot 0 is Start; each slot shows
the tile name, cost and a tag colour band (income gold, score purple, mover
cyan, combo green, attack red, defense blue, expansion grey); the token is the
filled circle with the seat number. Hover a slot or shop tile for what it does.

- **Watching bots.** On a bot's turn the side panel shows its `Decision` from
  `bot.decide()`: the note and every candidate with its score and `why`. It
  holds for a moment, then marks the pick (and outlines the shop tile and the
  slot it chose on the board), and the action plays out: dice tumble, the token
  hops one slot at a time, fired tiles glow with floating `+2 coins`, laps
  flash, attacks draw an arrow to the target, bought tiles fly from the shop
  into their slot, new shop tiles slide in.
- **Speed and time.** Slow, Normal, Fast, Instant (no delays) at any moment.
  Pause holds at the next beat; Step plays one beat while paused. All the
  durations live in one table, `DURATIONS` in `web/timing.ts`.
- **Playing a seat.** Every seat has a Take over / Hand back to bot button; it
  takes effect at that seat's next decision (handing back a seat that is being
  asked takes effect immediately). On your turn: Roll (or Reroll / Keep),
  click an opponent's board to choose a target, click a shop tile and then a
  highlighted slot (green dashed = empty, amber = replaces the tile there) or,
  for Expansion tiles, a `+` between two slots; click a die mod to buy it;
  click an owned tile and Sell; Pass; Cancel backs out of a half-chosen action.
  Only actions in `legalActions(state)` are ever offered.
- **Game over.** A banner with the winner, the final standings, the seed, New
  game and Replay this seed.

Under the hood: `web/loop.ts` is the whole game loop with an injected
presenter and human controller (unit-tested with fakes at zero delay);
`web/presenter.ts` plays events on a display model (`viewmodel.ts`) and then
re-renders from the true post-step state, so the screen cannot drift from the
engine. `(seed, actions)` replays a game exactly, humans included.

Browser smoke test (Playwright, a dev-only tool that is not in `package.json`):

```sh
mkdir /tmp/pw && (cd /tmp/pw && npm i playwright)
npm run build:web
NODE_PATH=/tmp/pw/node_modules node web/test/smoke.mjs --shots /tmp/shots
```

## Shared board mode

`config.boardMode: 'loops' | 'shared'` (default `'loops'`, which is everything
above, unchanged). In `'shared'` mode every player moves on ONE loop of
`players × sideLength` slots (`sideLength` 10: a corner plus 9 tile slots per
side). Slot `p × sideLength` is player p's corner and Start; each token starts
on its own corner. Tiles are *owned*: a tile's class says whose token triggers
it and who benefits. The tile set is `tiles/shared.json` (32 tiles, see
`design/shared-board-tiles.md`), the landmarks `tiles/landmarks.json`; get a
ready config with `defaultSharedConfig(overrides)` from `tiles/index.ts`.

| Class | Fires | Benefits |
| --- | --- | --- |
| civic | any token passes or lands | owner |
| private | owner's token passes or lands (landing runs the list `landBonus` times, 2 in shared mode) | owner |
| toll | another player's token lands, never on a pass | owner is paid by the visitor (`pay`, capped, with an `orElse`) |
| public | any token lands (the list runs twice for the owner on their own tile) | the visitor; `who: 'owner'` effects echo to the owner |
| landmark | owner's token passes or lands | owner, plus a permanent passive |

- **Corners.** Passing or landing on any corner pays `cornerIncome` (2), double
  on your own, and counts in `cornersPassed`; your own corner is also a lap
  (`laps`, so `lapRace` works). There is no lap income. Tokens may share a slot.
- **Shop.** `buyTile { shopIndex, slot }` goes on any non-corner slot. Empty:
  place. Yours: replace (no refund). Another player's: a buyout. You pay the
  shop tile's cost and the displaced owner gets `floor(oldCost × buyoutRefund)`
  (0.5). A buyout is blocked by the owner's City Walls (`noReplace`) and, with
  `protectOwnSide`, on the owner's own side. Landmarks are never built over.
- **Landmarks** are a fixed menu, not in the bag. `buyLandmark { landmarkId,
  slot }` on an empty slot or over your own tile, once per landmark per player;
  they cannot be sold. Passives: `noReplace`, `civicBonus`, `dieSides`,
  `shopDiscount`, `endGameVpPerTiles`, `visitorLandVp`, `tollFree`.
- **End modes.** All five work: `turnCap`, `vpRace`, `lapRace`, `vpPool` and
  the sim-only `landmarkRace` (`endValue` = landmarks owned; ends at the end of
  the round in which a player gets there).
- **New DSL.** Effects `pay { amount, res?, cap?, orElse? }`, `gain.who`,
  `teleport to 'nextCorner'`, `who: 'owner'`; amounts `ownedWithClass`,
  `adjacentWithClass`, `visitorOwnedOnSide`, `coinsHeldDiv`, `cornersPassed`
  and a `max` cap on any amount; conditions `adjacentToCorner` and `visitor`.
  Validated by `tiles/schema.ts`, described by `engine/describe.ts`.
- **Also new.** `config.startDice` (both modes; `--dice 2d6`), new events
  `toll` and `corner`, `tileFired` carries `owner` and `slot`, and the shared
  batch report adds `tollsPerGame`, `tollCoinsPerGame`, `cornerIncomePerGame`
  and `firesByClass` (absent in loops mode, so loops reports are unchanged).
- **Bots.** Profile bots place by tile class (`bots/placement.ts`, traffic from
  `engine/traffic.ts`): civics go where any token passes, privates and landmarks on
  the owner's own path (privates get a bonus on their own side), tolls where
  opponents land (weighted toward the VP leader; a penalty on the owner's own
  side), publics where the owner lands first. Building over another player's tile
  costs `buyoutWeight` per coin of the displaced tile and earns `leaderCheckWeight`
  per VP that player leads by; `buyLandmark` is scored from `landmarkWeight`. Each
  shop tile keeps its best 3 slots as candidates. Two archetypes are built for the
  mode: **landlord** (tolls and civics, tolls on the leader's landing spots, buys
  out the leader readily, targets the VP leader) and **builder** (civics early,
  then saves for landmarks and keeps a bigger mod reserve once it owns one).
  Greedy, Scorer, Aggressor and Turtle play through their tag weights (tolls are
  tagged `attack`). Lookahead searches the best traffic slot per tile, at most 2
  buyouts and 2 landmark builds.
- **Metrics.** Shared batches also report `interactionIndex`, `tollShare`,
  `cornerShare`, `progression` (VP by round, price per buy, VP buys by third,
  engine-online round), `landmarksPerGame`, `landmarkBuyRate` and
  `buyoutsPerGame`. Loops reports gain none of them unless asked
  (`--extended` / `computeMetrics(..., { extended: true })`).
- **Variant options** (all off by default, shared mode unless noted; CLI flag in brackets):
  `perimeter` (`--perimeter N`, total slots, `sideLength = perimeter / players`, must divide),
  `catchUpCoins` (`--catchUp N`, seat i starts with `i × N` extra coins, both modes),
  `tollOnPass` (`--tollOnPass X`, a visitor passing a plain coin toll pays `floor(X × pay)`, at least 1;
  Ferry, Inn, Tithe and Bandit Camp only fire on a landing), `buyoutPremium` (`--buyoutPremium N`, extra
  price for building over another player's tile; the refund is unchanged), `replacementTax`
  (`--replacementTax N`, paid to the bank for building over any occupied slot; `--replacementTaxEscalates`
  makes the k-th replacement cost `N × k`). In the `landmarkRace` end mode the winner is ranked by
  landmarks owned first, then VP. Decisions in `DECISIONS.md` ("Shared board variants").
- **Experiment.** `sim/experiments/perimeter.ts` runs 17 cells of those options (about 4 minutes;
  `--write` fills `sim/experiments/perimeter-results.md`). `sim/experiments/shared.ts` runs shared versus loops in ten
  cells (die size, players, end modes, corner income, own-side protection) with
  the standard, shared and lookahead lineups; numbers in
  `sim/experiments/shared-results.md`.
- **Not done yet.** The browser UI is loops-only (`EndMode` as the UI sees it
  does not include `landmarkRace`). Interpretations beyond the design doc are in
  `DECISIONS.md`.

## Rules as implemented

The spec's v0 ruleset, with these interpretations where it was silent. Each is
recorded in `DECISIONS.md`.

- Slot 0 is Start, holds no tile, and cannot be bought onto.
- A move of the active player's own token (roll, Springboard) triggers passes,
  laps and the landed tile. Forced moves of other players (Trebuchet) and
  teleports just relocate the token.
- Round-scoped effects (Fog, Haste, Watchtower's shield, Saboteur's lock) last
  until the end of their owner's *next* turn, so "one round" always covers one
  full rotation of opponents regardless of seat.
- A locked tile is fully inert: it does not fire and does not count for
  adjacency or ownership.
- The Reroll token adds a `reroll` / `keepRoll` prompt after the owner's roll.
- At the end of each round the oldest unbought shop tile is discarded and the
  shop refilled (`config.shopCycle`, default 1). The discard pile is reshuffled
  into the bag when the bag runs dry.
- `config.maxRounds` (default 50) is a hard stop so a game that never trips its
  end condition still terminates; `config.maxTriggerChain` caps chained
  self-moves and roll-agains within a turn.

## Next

Installable PWA and a hot-seat mode that hides the other seats' decisions are
not built yet; the engine needs no change for either.
