# Decisions and balance log

Decisions made while building v0, so later changes are made against a record.
The spec's own decision table is in the spec; this file records what the build
added and what the sim found.

## Interpretations the spec left open

| Topic | Decision | Reasoning |
| --- | --- | --- |
| `step` signature | `step(state, action)`; no separate `rng` argument | The RNG cursor is in `state.rngState`, so a second argument would be redundant and a second source of truth. Bots get a separate `Rng` seeded from the game seed for tie-breaks. |
| Start slot | Fixed, holds no tile, not a placement target | Open question in the spec; fixed is the simpler rule and the sim never needed it. |
| "One round" for Fog, Haste, shield, lock | Expires at the end of the owner's next turn | A literal "until end of round" makes Fog worthless for seat 4 and Watchtower worthless for anyone. Owner-relative expiry covers one full rotation for every seat. |
| Forced moves | Only the active player's own forward moves trigger passes, laps and landings | Trebuchet pushing a victim onto their Cathedral should not score for them; teleports likewise just relocate. |
| Teleport to Start | No lap, no income | Matches the Portal description. |
| Locked tile | Fully inert: no triggers, no adjacency, no ownership count | "Inert" read literally; keeps Saboteur a real attack on combo clusters. |
| Reroll token | Adds a `reroll` / `keepRoll` pending prompt after the roll | The only way to make a consumable reroll a choice while keeping bots on `legalActions`. |
| Persistent and consumable mods | One of each per player at a time | Prevents stacking Second die; a consumable must be used before another is bought. |
| Fog / Haste with two dice | Every owned die becomes the modified die | "Roll d4" with d6+d4 becomes d4+d4. |
| Heavy die | `replaceDie` primitive: first d6 becomes a d8 | New primitive, as the spec allows when a tile needs one. |
| Expansion+ | Inserts a slot already holding a Market | Expansion tiles carry `insertTile`; they are consumed, not placed. |
| Replaced tiles | Discarded, no refund; locks on that slot clear | Spec. |
| Bag exhaustion | Discard reshuffled into the bag when the bag is empty and the shop needs a tile | Keeps the shop alive in long games. |
| Hard stop | `maxRounds` = 50 | vpRace with a weak lineup can otherwise run forever; `gameEnded.reason` says `maxRounds` so the metric sees it. |
| Chained movers | `maxTriggerChain` = 12 | A loop of Springboards or Tailwinds must terminate. |
| Shop staleness | `shopCycle` = 1: the oldest unbought tile is discarded at the end of each round | Added after the v0 sim; see balance log. |
| Lookahead score | `vp + 0.5 × coins + 0.45 × cost of owned tiles`, differential against the leader | The spec's `vp + 0.5 × coins` over one roll never justifies buying a tile; with the asset term Lookahead beats Random 94% and matches Scorer. |
| Tile buy rate | Reported as take rate: buys ÷ affordable offers | "Bought events ÷ games" cannot be compared with a 5%/80% threshold once the shop always has tiles; take rate when affordable is what "dead" and "auto-buy" mean. |

## Web UI

Choices the UI had to make; none of them changes a rule.

| Topic | Decision | Reasoning |
| --- | --- | --- |
| Rules in the UI | None. Every action offered is looked up in `legalActions(state)` by `actionKey`; every display change comes from an engine event | A UI that reimplements a rule drifts from the engine. The display model is also rebuilt from the true post-step state after each step. |
| Bot decisions | The loop calls `bot.decide()` with the same `Rng` the batch runner uses | Per the `Bot` contract it picks the same action as `choose`, so an all-bot game in the UI equals `playGame(seed, ...)`; a test asserts it. |
| Replay | `(seed, actions)` replays a UI game, humans included | The loop records every action like `sim/runner.ts`. The seed field plus the same seats reproduces a bot game exactly; a human game needs the same clicks. |
| Seat switching | A seat flag read at each decision. Take over applies from the seat's next decision; Hand back while the seat is being asked cancels the wait and the bot decides at once | "Next decision" for a seat that is waiting on a human is the one it is waiting on. A seat that started as Human hands back to Lookahead (the strongest general bot). |
| Which board is large | Always the active player's, including while choosing a target or when a human acts | The user reads one board at a time; targets are chosen on the small boards. |
| Events that carry no slot | `tileFired` has no slot, so the glow uses the token's slot for `onLand`, passed slots for `onPass`, else the n-th matching tile; `sold` finds its slot from the action or a board diff | Keeps the engine's event shape as is. Only the animation depends on it, and the final render is from state. |
| Token movement | Forward moves of the active player hop slot by slot (a long move is squeezed to 3 s); forced pushes and teleports slide. A teleport is recognised from the tile that just fired | A teleport and a forward move both emit `moved`. |
| Silent changes | Lock expiry and a spent Reroll token have no event, so they show up in the final re-render | Cheaper than adding events for display. |
| Pause and Step | Pause holds at the next animation beat (the one in flight finishes); Step lets one beat through while paused; Instant resolves any wait in progress | One beat is a dice tumble, a hop, a glow, a thinking pause and so on. |
| Small boards | Name code (e.g. TRE, BC) and cost only, tooltips carry the full text | At 150 to 250 px a full name cannot be 12 px. The large board never goes below 12 px at 1280 wide with up to 12 slots. |
| Seed | Random 1 to 999999 shown in an editable field; the bot RNG is `seed + 0x5eed` as in the sim | Same seed, same seats, same game. |
| Hosting | Relative asset paths, deploy only from the default branch, `dist/` is not committed | Pages serves under `/meta-boardgame/`. |
| Decision lists | Candidates are deduplicated by their short label (`bots/explain.ts`) | Two shop copies of one tile gave identical lines. |

## Balance log

Standard lineup (Greedy, Scorer, Aggressor, Turtle), 4 players, 1000 games per
end mode, seats rotated. `npm run sim -- balance` reproduces every number.

### v0: the spec's starting values

| Mode | Greedy | Scorer | Aggressor | Turtle | Length | Decided by | Attacks/game |
| --- | --- | --- | --- | --- | --- | --- | --- |
| turnCap 15 | 22.5% | **62.1%** | **2.7%** | **12.7%** | 15 | 67% | 1.7 |
| vpRace 30 | 30.8% | **50.9%** | **0.7%** | 17.6% | mean 37, p90 50, **352 games hit the 50-round stop** | **43%** | 8.0 |
| lapRace 6 | 22.7% | **61.3%** | **4.1%** | **11.9%** | mean 12.7 | 67% | 1.2 |

Seat bias: none (every seat 24–27%). Random floor: 0.4%.

Threshold breaches and what was done:

| Breach | Finding | Change |
| --- | --- | --- |
| 352 of 1000 vpRace games hit `maxRounds` | Replays (e.g. seed 2) show players sitting on 60–70 coins and buying nothing: the shop only refilled bought slots, so once it filled with tiles no bot wanted it never changed again. The spec's first open question, answered: a stale shop locks the game. | `config.shopCycle` = 1: the oldest unbought tile is discarded at the end of each round. vpRace now ends normally in 991 of 1000 games. |
| Aggressor 0.7–4%, attack tiles win lift −22 to −24 pts, attacks/game 1.2–1.7 | Bandit Camp (4 coins, steal 2) was strictly dominated by Market (3 coins, gain 2). Attacks cost a turn's purchase and a landing for an effect smaller than a Shrine's 1 VP. | Bandit Camp steals 3; Trebuchet 6→5, Saboteur 7→6, Tax Collector 9→7 coins. Attacks/game 1.7→3.1 (turnCap), Aggressor 2.7%→10%. Still under the 15% floor; see open items. |
| Aggressor at 0 coins all game in vpRace | A bot artifact: the profile bought Fog (round-scoped, 5 coins) every turn it could afford it. | Profiles keep a `modReserve` (6 coins) and never buy a mod below it. |
| Springboard, Portal, Tailwind, Expansion, Expansion+ 0% bought | A lineup artifact: no standard-lineup bot had a positive weight on `mover` or `expansion`. Expander buys Expansion in 48% of its games. | Mover weight set to +1 in every profile; they now take Springboard 57% and Portal 39% of affordable offers. Expansion stays 0% in the standard lineup by construction; the Expander lineup is the test for it. |
| Placement lift −3.4 pts (< 3) | Measured again with 1-, 2-, 3- and 4-roll landing horizons: −1.2, −1.4, −1.0, −1.1 pts, all within noise at 1000 games. Real finding: with a d6 on an 8-slot loop the landing distribution is near uniform after two rolls, so landing-probability placement cannot matter. Placement can only matter through adjacency (Workshop, Plaza, Guildhall) and `onPass` (Tollbooth). | Recorded, not patched. Greedy's `likely` placement now looks three rolls ahead (`lookRolls`), which is at least not worse than one. |
| Scorer 51–62% (> 45%) | No config lever fixes it: turnCap 25 → 56%, turnCap 35 → 53%, lapIncome 2 → 60%, lapIncome 5 → 68%, startCoins 10 → 78%, boardSize 6 → 65%, shopActions 2 → 66%. Tile tweaks (attack buffs, +1 coin on Market/Mine, +1 cost on Shrine/Monument) move it by at most 5 pts. Lookahead, a general bot, lands at 39% against Scorer's 41% in the same lineup, so "always buy the cheapest VP tile" is close to optimal under v0 rules. Cause: a tile is landed on about twice per 15-round game, so an income tile returns ~4 coins for 3 and still needs converting, while a Shrine returns ~2 VP for 3. The economy loop never closes in time. | Recorded as the headline open item; it needs a design change, not a number. Candidates: VP that scales with income (Bank-style conversion), score tiles that cost more as the game goes on, or lap-based VP. |
| Archive win lift +40 to +60 pts | The only passive VP; with 6+ laps it pays 1 VP per lap on top of everything else. Taken only 34–38% when affordable because of its 8-coin price, but owners win 65–73% of games. | Recorded. Leave until the Scorer problem is addressed, since Archive is the one tile that rewards the engine route. |
| Turtle 12–13% (< 15%), defense tiles lift −11 to −16 | Defense only pays when attacked; at 2–3 attacks per game across four players, a Wall is a dead slot. Tracks the attack problem. | Recorded; expect it to move with attacks. |
| Market, Mine, Shrine, Monument "auto-buy" (bought in > 80% of games) | An artifact of the first buy-rate definition once the shop cycles. By take rate when affordable, Shrine and Market are 70–76%, under the 80% line. | Metric redefined as take rate; see interpretations. |
| vpRace p90 42 rounds (> 25), decided by 43% | Both follow from the stalled games; after the shop cycle p90 is 42 and decided-by 76%. 30 VP is still a long race for this economy. | Recorded; `endValue` 20 gives mean 33 rounds with the same winners, so the target is not the lever. |
| Cathedral 3.8% of lapRace games | 10 coins is two laps of saving in a 12-round game. Take rate when affordable is 42%, so it is a price-and-length problem, not a design one. | Recorded. |
| turnCap "never trips early" | Expected by the spec's own note. | None. |

### v0.1: after the changes above

| Mode | Greedy | Scorer | Aggressor | Turtle | Length | Decided by | Attacks/game |
| --- | --- | --- | --- | --- | --- | --- | --- |
| turnCap 15 | 22.6% | **54.4%** | **10.0%** | **13.0%** | 15 | 73% | 3.1 |
| vpRace 30 | 37.0% | 32.3% | **0.0%** | 30.7% | mean 32.5, p90 42, 9 hit the stop | 76% | 13.8 |
| lapRace 6 | 18.1% | **56.6%** | **12.1%** | **13.2%** | mean 12.0 | 75% | 2.0 |

Seat bias: none. Random floor 2.0%. Placement lift −1.8 pts.

Note the vpRace result: in long games Greedy, Scorer and Turtle are even,
and attacking is ruinous (attacker lift −16 VP, every attack-tile owner has a
0% win rate). Each landing on an attack tile is a landing not on a score
tile, and in a 32-round game that compounds. Attacks need to touch VP, or be
cheaper than a Shrine, to be worth a slot at all.

## Open items for the next pass

- [ ] Scorer dominance (design change needed; see above).
- [ ] Attacks: worth buying only in short games, never in long ones.
- [ ] Archive is the single tile with a lift above +20.
- [ ] Placement is cosmetic under d6 × 8 slots; decide whether that is fine.
- [ ] Shop refill rule: cycling one tile per round fixed the stall; the spec's alternative (refresh bought slots only) is now known to lock the game.
- [ ] Still open from the spec: Start as an upgradeable slot, the 50% sell refund (no tile was ever sold by any bot in any batch), tie-break order, catch-up for late seats (no seat bias measured, so nothing to fix yet).
