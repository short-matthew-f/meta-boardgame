# Density experiment

Question: the balance log says a tile fires only when the token lands on it, so
each tile fires about twice per 15-round game and income never pays back. Four
deck-builder-inspired variants were added as `GameConfig` options, all off by
default, and run against today's rules. Reproduce with
`node --import tsx sim/experiments/density.ts --write` (about 100 s; 600 games
per cell for both lineups, so the lookahead lineups were not reduced). Seeds
1 to 600 and the same seat rotation in every cell, so cells are paired.

Cells (4 players, d6 on 8 slots, starter tiles unless noted):

- **baseline**: today's defaults, turnCap 15.
- **A**: `fireOnPass`, `landBonus` 1.
- **A2**: `fireOnPass`, `landBonus` 2.
- **D**: `tileEndVp` 0.34 (end-of-game VP = floor(0.34 x summed cost of owned tiles)).
- **AD**: fireOnPass + landBonus 2 + tileEndVp 0.34.
- **AD + superlinear**: AD with `tiles/starter-superlinear.json` (Cathedral 10c gives 5 VP, Mine 5c gives 4 coins).
- **AD + superlinear, vpPool 60 / vpRace 30**: the same, ended by a 60 VP total pool or a 30 VP race instead of turnCap 15.
- **baseline, vpRace 30**: the length comparison.

Columns: win rate per bot in lineup order; mean VP of the winner and mean total
VP across all four players at the end (both include end-of-game tile VP);
rounds mean and p90 (`hit stop` = games that ended on `maxRounds` 50); attacks
per game; median fraction of the game after which the winner was never
displaced ("decided by"); the three tiles with the highest take rate (buys /
affordable offers); highest and lowest tile win lift in points (tiles bought in
at least 20 (game, player) pairs).

<!-- table:start -->
### standard lineup (greedy, scorer, aggressor, turtle; 600 games per cell)

| Cell | Win % (greedy / scorer / aggressor / turtle) | Winner VP | Total VP | Rounds mean (p90) | Attacks/game | Decided by | Top take rates | Win lift hi | Win lift lo |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| baseline | 23.3 / 52.3 / 10.3 / 14.0 | 4.7 | 7.7 | 15.0 (15) | 3.0 | 73.3% | shrine 72.5%, market 72.3%, springboard 56.2% | archive +42.2 | saboteur -17.2 |
| A: fireOnPass | 28.8 / 41.0 / 13.2 / 17.0 | 13.4 | 27.6 | 15.0 (15) | 13.0 | 66.7% | shrine 68.9%, market 62.6%, springboard 43.3% | cathedral +20.6 | trebuchet -13.0 |
| A2: fireOnPass, landBonus 2 | 33.5 / 33.8 / 12.5 / 20.2 | 17.7 | 37.2 | 15.0 (15) | 17.2 | 73.3% | shrine 69.0%, market 61.9%, springboard 41.6% | cathedral +24.7 | trebuchet -12.4 |
| D: tileEndVp 0.34 | 37.2 / 26.5 / 19.3 / 17.0 | 13.2 | 39.8 | 15.0 (15) | 3.0 | 93.3% | shrine 72.5%, market 72.3%, springboard 56.2% | archive +42.8 | moat -10.2 |
| AD: A2 + tileEndVp 0.34 | 46.0 / 18.8 / 13.0 / 22.2 | 28.7 | 75.5 | 15.0 (15) | 17.2 | 80.0% | shrine 69.0%, market 61.9%, springboard 41.6% | cathedral +39.4 | trebuchet -12.2 |
| AD + superlinear | 47.5 / 17.3 / 10.7 / 24.5 | 32.1 | 79.9 | 15.0 (15) | 17.6 | 80.0% | shrine 68.4%, market 59.0%, springboard 41.1% | cathedral +43.7 | trebuchet -14.7 |
| AD + superlinear, vpPool 60 | 49.3 / 14.5 / 6.2 / 30.0 | 43.6 | 108.2 | 18.7 (23) | 27.8 | 77.8% | shrine 69.4%, market 49.2%, monument 43.1% | cathedral +43.5 | trebuchet -18.8 |
| AD + superlinear, vpRace 30 | 50.2 / 15.5 / 4.0 / 30.3 | 46.1 | 114.9 | 19.4 (24) | 29.9 | 78.9% | shrine 69.7%, market 46.3%, monument 43.4% | cathedral +43.7 | trebuchet -21.2 |
| baseline, vpRace 30 | 36.7 / 32.8 / 0.0 / 30.5 | 33.2 | 60.9 | 32.6 (42) [6 hit stop] | 13.8 | 76.3% | shrine 76.6%, monument 54.8%, cathedral 52.3% | archive +48.1 | tax-collector -25.0 |

### lookahead lineup (lookahead, scorer, greedy, turtle; 600 games per cell)

| Cell | Win % (lookahead / scorer / greedy / turtle) | Winner VP | Total VP | Rounds mean (p90) | Attacks/game | Decided by | Top take rates | Win lift hi | Win lift lo |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| baseline | 50.2 / 31.8 / 10.7 / 7.3 | 5.9 | 10.0 | 15.0 (15) | 1.4 | 73.3% | shrine 74.7%, market 71.8%, monument 59.2% | archive +40.9 | watchtower -21.5 |
| A: fireOnPass | 79.7 / 10.7 / 5.7 / 4.0 | 21.8 | 40.2 | 15.0 (15) | 6.2 | 46.7% | shrine 69.6%, market 62.8%, monument 59.7% | bandit-camp +55.5 | moat -21.7 |
| A2: fireOnPass, landBonus 2 | 82.0 / 10.0 / 5.7 / 2.3 | 30.5 | 55.5 | 15.0 (15) | 8.3 | 40.0% | shrine 67.9%, cathedral 64.9%, monument 60.4% | tax-collector +59.6 | moat -23.1 |
| D: tileEndVp 0.34 | 58.3 / 16.3 / 16.7 / 8.7 | 14.9 | 42.4 | 15.0 (15) | 1.4 | 86.7% | shrine 74.7%, market 71.9%, monument 59.3% | archive +45.6 | wall -17.4 |
| AD: A2 + tileEndVp 0.34 | 82.3 / 6.7 / 8.2 / 2.8 | 42.4 | 94.5 | 15.0 (15) | 8.3 | 40.0% | shrine 67.9%, cathedral 65.1%, monument 60.4% | tax-collector +62.0 | wall -22.5 |
| AD + superlinear | 79.3 / 5.7 / 11.2 / 3.8 | 55.1 | 109.4 | 15.0 (15) | 8.8 | 40.0% | cathedral 69.1%, shrine 67.2%, market 58.4% | tax-collector +53.9 | wall -21.7 |
| AD + superlinear, vpPool 60 | 80.2 / 4.5 / 10.8 / 4.5 | 51.8 | 106.4 | 15.1 (18) | 8.9 | 43.8% | cathedral 67.7%, shrine 67.3%, market 57.6% | tax-collector +55.0 | portal -21.5 |
| AD + superlinear, vpRace 30 | 81.2 / 4.7 / 10.3 / 3.8 | 46.2 | 98.6 | 14.6 (18) | 8.4 | 50.0% | cathedral 67.8%, shrine 67.3%, market 58.0% | tax-collector +55.4 | wall -21.6 |
| baseline, vpRace 30 | 53.5 / 16.0 / 18.5 / 12.0 | 33.4 | 58.5 | 27.8 (35) [1 hit stop] | 3.9 | 67.9% | shrine 75.7%, monument 59.0%, archive 54.5% | archive +50.1 | watchtower -16.8 |

<!-- table:end -->

## What moved

Facts only. Numbers are from the tables above, or from supplementary counts of
the same 600 games (VP by source, buys per game, take rate by tile, seat win
rates). Standard lineup unless stated.

**baseline.** Scorer 52.3%, mean winner VP 4.7, mean total VP across four
players 7.7. These match the v0.1 balance log within sampling noise (Scorer
54.4%, 1000 games). Archive win lift +42, Saboteur lift -17.

**A (fireOnPass).** Tile-trigger VP per game rises from 7.7 to 27.6 and mean
winner VP from 4.7 to 13.4. Scorer drops 52.3% to 41.0%, Greedy rises 23.3% to
28.8%, Aggressor 10.3% to 13.2%, Turtle 14.0% to 17.0%. Attacks per game go
from 3.0 to 13.0, because every attack tile the token passes now prompts for a
target (attack-tile buys 3.2 to 4.2 per game). Take rates fall for Market (72%
to 63%), Mine (38% to 29%) and Springboard (56% to 43%); movers do not fire on
pass. Decided-by drops from 73% to 67%. Cathedral is the highest win lift
(+20.6) and Archive is no longer the top tile. Lookahead lineup: Lookahead 50.2%
to 79.7%, Scorer 31.8% to 10.7%, winner VP 5.9 to 21.8, decided-by 47%.

**A2 (fireOnPass, landBonus 2).** Winner VP 17.7, total VP 37.2. Scorer 33.8% and
Greedy 33.5% are level; Turtle 20.2%; Aggressor 12.5%. Attacks 17.2 per game.
Lookahead lineup: Lookahead 82.0%, Scorer 10.0%, winner VP 30.5, decided-by 40%.
Seat 1 wins 30% and seat 4 21% in the standard lineup (22% and 27% at baseline).

**D (tileEndVp 0.34).** In-game events are identical to baseline (same take rates
and 3.0 attacks per game, since no bot reads the new VP); only final VP changes:
32.1 end-of-game VP per game across four players, total VP 39.8 against 7.7,
winner VP 13.2. Greedy 23.3% to 37.2%, Scorer 52.3% to 26.5%, Aggressor 10.3% to
19.3%, Turtle 14.0% to 17.0%. Decided-by 93%, the highest of any turnCap cell.
Lookahead lineup: Lookahead 58.3%, Scorer 16.3%, Greedy 16.7%, Turtle 8.7%.

**AD.** End-of-game VP 38.3 plus trigger VP 37.2 per game, total 75.5, winner VP
28.7. Greedy 46.0%, Turtle 22.2%, Scorer 18.8%, Aggressor 13.0%. Seat 1 wins 32%
and seat 4 19%. Cathedral lift +39.4 and Trebuchet -12.2 are the extremes.
Lookahead lineup: Lookahead 82.3%, Scorer 6.7%, winner VP 42.4.

**AD + superlinear.** Trigger VP per game 41.1 against 37.2 for AD; winner VP 32.1
against 28.7; win rates move by at most 2 points (47.5 / 17.3 / 10.7 / 24.5).
Cathedral take rate 39% to 37% and lift +39.4 to +43.7. In the lookahead lineup
Cathedral take rate goes 65% to 69%, winner VP 42.4 to 55.1, Lookahead stays at
79%.

**AD + superlinear, vpPool 60.** Game length mean 18.7 rounds, p90 23, no game hit
`maxRounds`. In-game VP at the moment the pool trips averages 64.8 per game
(the round finishes), with 43.3 more at the end from tileEndVp; total VP 108.2,
winner VP 43.6. Turtle 30.0%, Greedy 49.3%, Scorer 14.5%, Aggressor 6.2%. Attacks
27.8 per game. Market take rate 49%. In the lookahead lineup the pool is reached
at about the same time as the 15-round cap: mean length 15.1, p90 18.

**AD + superlinear, vpRace 30.** Mean length 19.4 rounds, p90 24, decided-by 78.9%,
against 32.6 / p90 42 / 6 games at the stop for baseline vpRace 30. Winner VP 46.1
(a 30 VP race is passed by a wide margin in the round it ends). Aggressor 4.0%,
Turtle 30.3%, Greedy 50.2%. Lookahead lineup: mean length 14.6, p90 18, against
27.8 / p90 35 for baseline vpRace 30.

**baseline, vpRace 30.** Mean 32.6 rounds, p90 42, 6 games at the 50-round stop
(1 in the lookahead lineup); Aggressor 0.0%; Greedy, Scorer and Turtle within 6.2
points of each other.
