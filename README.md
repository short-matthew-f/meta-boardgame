# Board Game Builder — simulation engine

A headless game engine plus a batch simulator for a loop-board tile game, so
balance questions get answered statistically before any UI exists. The engine
is the code the PWA will ship later; nothing here is throwaway.

TypeScript, Node 20+, Vitest. No runtime dependencies.

```
engine/     pure engine: types, seeded RNG, board helpers, step / legalActions
tiles/      starter tiles and die mods as JSON, plus a schema validator
bots/       Random, Greedy, Scorer, Aggressor, Turtle, Expander (weight tables), Lookahead (one-ply EV)
sim/        playGame / replay, batch runner with seat rotation, event-log metrics, CLI
tests/      vitest suites, one per build step
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

The UI (hot-seat PWA on the same engine) is out of scope for v0. When it lands
it will be a static build in this repo published through GitHub Pages.
