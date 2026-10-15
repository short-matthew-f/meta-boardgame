# Board Game Builder — simulation engine

A headless game engine, a batch simulator for balance work, and a browser UI
for a loop-board tile game. The UI imports the engine and bots directly and
reimplements no rule.

TypeScript, Node 20+, Vitest, esbuild. No runtime dependencies.

```
engine/     pure engine: types, seeded RNG, board helpers, step / legalActions, describe (readable text)
tiles/      starter tiles and die mods as JSON, plus a schema validator
bots/       Random, Greedy, Scorer, Aggressor, Turtle, Expander (weight tables), Lookahead (one-ply EV)
sim/        playGame / replay, batch runner with seat rotation, event-log metrics, CLI
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
