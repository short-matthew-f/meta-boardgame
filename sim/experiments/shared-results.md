# Shared board experiment

Question: how does the shared board play against the loops reference, and which
knobs move it? Reproduce with `node --import tsx sim/experiments/shared.ts --write`
(about 130 s). Seeds 1 to N and the same seat rotation in every cell, so cells
are paired within a lineup.

Cells:

1. **loops, defaults**: `boardMode` loops, 4 players, turnCap 15 (the reference).
2. **loops, fireOnPass + landBonus 2**: the density experiment's variant, same otherwise.
3. **shared, d6, 4p**: `defaultSharedConfig`, sideLength 10 (40 slots), turnCap 15.
4. **shared, 2d6, 4p**: two six-sided dice for everyone.
5. **shared, d6, 2p** and 6. **3p**: 20 and 30 slots; the bots are the ones listed in the row.
7. **shared, d6, 4p, vpPool 60**: ends in the round the total VP of all players reaches 60 (or at the 50-round stop).
8. **shared, d6, 4p, landmarkRace 3**: ends in the round a player owns 3 landmarks (or at the stop).
9. **cornerIncome 1**: corner income 1, 2 on your own (default 2 and 4).
10. **protectOwnSide**: a tile cannot be bought out on its owner's own side.

Lineups: standard (greedy, scorer, aggressor, turtle), shared (greedy, scorer,
landlord, builder) at 600 games per cell; lookahead (lookahead, scorer, landlord,
builder) at 200 games per cell. At 2 and 3 players the bots are the ones listed
in the row (the lineup's first bots would drop landlord and builder), and each
sees every seat equally often. The loops cells run every lineup too: landlord and
builder play there as plain tag-weight bots (their shared-board terms are inert),
which makes cells 1 and 2 a reference, not a test of those two.

Columns. Win % in the order of the Bots column; seat 1 and last-seat win %; winner
VP and total VP at the end (include end-of-game VP); rounds mean (p90), `hit stop`
= games that ended on the 50-round `maxRounds`; decided-by is the median fraction
of the game after which the winner was never displaced; VP at round 5 / 10 / 15 is
the mean per player at the end of that round; engine online is the mean first round
in which a player's income (coins from tiles and corners, own turn or not) reached 8,
with the share of players that got there at all. Fires per game by class (civic /
private / toll / public / landmark); tolls per game with the toll share (toll coins paid ÷ coins
gained from tiles and corners, mean per game); corner share (corner income ÷ the same
total); interaction index (share of a player's coin and VP movement that happens on
another player's turn, not counting their own purchases and sales); buyouts and
landmarks bought per game; the three highest tile take rates (buys ÷ affordable
offers); highest and lowest tile win lift in points (tiles bought by at least 20
(game, player) pairs).

<!-- table:start -->
### standard lineup (greedy, scorer, aggressor, turtle at 4 players; 600 games per cell)

Outcome. Win % in seat order of the lineup listed in the cell's last column; seat 1 and last seat win %; VP are final (include end-of-game VP).

| Cell | Bots | Win % | Seat 1 / last | Winner VP | Total VP | Rounds mean (p90) | Decided by | VP at round 5 / 10 / 15 | Engine online (rate) |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| 1. loops, defaults | greedy / scorer / aggressor / turtle | 23.3 / 52.3 / 10.3 / 14.0 | 21.7 / 26.5 | 4.7 | 7.7 | 15.0 (15) | 73.3% | 0.2 / 0.7 / 1.9 | 11.7 (1.5%) |
| 2. loops, fireOnPass + landBonus 2 | greedy / scorer / aggressor / turtle | 33.5 / 33.8 / 12.5 / 20.2 | 29.5 / 21.3 | 17.7 | 37.2 | 15.0 (15) | 73.3% | 0.7 / 3.3 / 9.3 | 9.3 (40.5%) |
| 3. shared, d6, 4p | greedy / scorer / aggressor / turtle | 27.5 / 34.8 / 9.2 / 28.5 | 31.5 / 19.8 | 5.9 | 11.5 | 15.0 (15) | 73.3% | 0.4 / 1.2 / 2.9 | 10.5 (22.8%) |
| 4. shared, 2d6, 4p | greedy / scorer / aggressor / turtle | 24.7 / 31.0 / 8.7 / 35.7 | 37.3 / 12.8 | 15.5 | 34.6 | 15.0 (15) | 66.7% | 0.7 / 3.5 / 8.6 | 9.0 (67.9%) |
| 5. shared, d6, 2p | greedy / scorer | 46.5 / 53.5 | 58.8 / 41.2 | 7.5 | 10.6 | 15.0 (15) | 60.0% | 0.4 / 1.9 / 5.3 | 9.7 (35.8%) |
| 6. shared, d6, 3p | greedy / scorer / aggressor | 40.2 / 49.8 / 10.0 | 41.8 / 27.7 | 5.5 | 9.3 | 15.0 (15) | 66.7% | 0.4 / 1.4 / 3.1 | 9.9 (23.8%) |
| 7. shared, d6, 4p, vpPool 60 | greedy / scorer / aggressor / turtle | 33.3 / 17.7 / 4.0 / 45.0 | 34.5 / 18.3 | 25.2 | 61.8 | 35.3 (40) [1 hit stop] | 71.0% | 0.4 / 1.2 / 2.9 | 19.7 (66.6%) |
| 8. shared, d6, 4p, landmarkRace 3 | greedy / scorer / aggressor / turtle | 32.3 / 15.5 / 6.8 / 45.3 | 34.3 / 19.0 | 32.1 | 88.5 | 45.1 (50) [359 hit stop] | 71.1% | 0.4 / 1.2 / 2.9 | 21.9 (74.1%) |
| 9. shared, d6, 4p, cornerIncome 1 | greedy / scorer / aggressor / turtle | 29.8 / 31.8 / 10.7 / 27.7 | 29.2 / 20.0 | 4.3 | 7.7 | 15.0 (15) | 73.3% | 0.3 / 0.8 / 1.9 | 10.3 (12.3%) |
| 10. shared, d6, 4p, protectOwnSide | greedy / scorer / aggressor / turtle | 27.3 / 34.8 / 9.5 / 28.3 | 31.5 / 19.8 | 5.9 | 11.5 | 15.0 (15) | 73.3% | 0.4 / 1.2 / 2.9 | 10.5 (22.9%) |

Interaction and economy. Fires per game by class in the order civic / private / toll / public / landmark (shared only); toll share and corner share are fractions of the coins gained from tiles and corners; interaction index is the share of coin and VP movement that happens on another player's turn.

| Cell | Fires per game by class | Tolls per game (toll share) | Corner share | Interaction index | Buyouts per game | Landmarks per game | Top 3 take rates | Win lift hi | Win lift lo |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- |
| 1. loops, defaults | — | — | — | 2.3% | — | — | shrine 72.5%, market 72.3%, springboard 56.2% | archive +42.2 | saboteur -17.2 |
| 2. loops, fireOnPass + landBonus 2 | — | — | — | 5.0% | — | — | shrine 69.0%, market 61.9%, springboard 41.6% | cathedral +24.7 | trebuchet -12.4 |
| 3. shared, d6, 4p | 32.0 / 7.2 / 2.2 / 6.1 / 0.1 | 2.35 (2.4%) | 50.1% | 22.6% | 0.39 | 0.09 | market 89.5%, mill 80.8%, pilgrim-road 77.9% | vineyard +33.6 | moneylender -22.4 |
| 4. shared, 2d6, 4p | 89.6 / 16.4 / 3.1 / 6.7 / 2.1 | 3.61 (1.9%) | 44.4% | 30.7% | 6.88 | 2.29 | market 94.1%, mill 88.3%, pilgrim-road 85.5% | vineyard +26.8 | bridge -18.5 |
| 5. shared, d6, 2p | 21.5 / 6.6 / 0.1 / 4.5 / 0.2 | 0.08 (0.1%) | 48.8% | 15.9% | 0.47 | 0.23 | pilgrim-road 76.9%, amphitheatre 75.8%, market 74.7% | vineyard +29.1 | customs-house -13.9 |
| 6. shared, d6, 3p | 26.2 / 5.4 / 1.9 / 5.3 / 0.0 | 1.94 (2.7%) | 49.3% | 21.9% | 0.37 | 0.06 | market 82.3%, pilgrim-road 74.6%, mill 73.7% | vineyard +36.0 | bridge -30.8 |
| 7. shared, d6, 4p, vpPool 60 | 128.4 / 28.3 / 11.6 / 19.7 / 2.3 | 12.83 (4.5%) | 36.6% | 37.6% | 33.19 | 2.13 | market 89.3%, pilgrim-road 86.2%, mill 82.3% | vineyard +25.4 | bridge -21.3 |
| 8. shared, d6, 4p, landmarkRace 3 | 169.5 / 38.0 / 18.5 / 25.0 / 4.4 | 20.57 (5.6%) | 35.2% | 39.8% | 54.33 | 3.36 | market 89.5%, pilgrim-road 88.2%, mill 82.5% | amphitheatre +22.4 | tollbooth -18.3 |
| 9. shared, d6, 4p, cornerIncome 1 | 24.5 / 5.0 / 1.5 / 5.1 / 0.0 | 1.62 (2.5%) | 41.5% | 24.1% | 0.07 | 0.02 | market 89.3%, mill 77.9%, pilgrim-road 76.8% | vineyard +42.3 | inn -18.8 |
| 10. shared, d6, 4p, protectOwnSide | 32.0 / 7.2 / 2.2 / 6.1 / 0.1 | 2.36 (2.4%) | 50.1% | 22.5% | 0.34 | 0.10 | market 89.5%, mill 80.6%, pilgrim-road 77.9% | vineyard +33.3 | moneylender -22.5 |

### shared lineup (greedy, scorer, landlord, builder at 4 players; 600 games per cell)

Outcome. Win % in seat order of the lineup listed in the cell's last column; seat 1 and last seat win %; VP are final (include end-of-game VP).

| Cell | Bots | Win % | Seat 1 / last | Winner VP | Total VP | Rounds mean (p90) | Decided by | VP at round 5 / 10 / 15 | Engine online (rate) |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| 1. loops, defaults | greedy / scorer / landlord / builder | 20.5 / 46.3 / 18.2 / 15.0 | 22.2 / 28.3 | 5.4 | 9.3 | 15.0 (15) | 73.3% | 0.2 / 0.8 / 2.3 | 11.9 (2.2%) |
| 2. loops, fireOnPass + landBonus 2 | greedy / scorer / landlord / builder | 17.2 / 27.3 / 37.2 / 18.3 | 34.3 / 17.7 | 20.6 | 45.3 | 15.0 (15) | 66.7% | 0.7 / 4.0 / 11.3 | 9.4 (44.7%) |
| 3. shared, d6, 4p | greedy / scorer / landlord / builder | 29.2 / 37.2 / 16.8 / 16.8 | 32.5 / 19.5 | 5.4 | 10.8 | 15.0 (15) | 80.0% | 0.4 / 1.1 / 2.7 | 10.1 (16.4%) |
| 4. shared, 2d6, 4p | greedy / scorer / landlord / builder | 30.3 / 25.0 / 36.2 / 8.5 | 39.0 / 16.7 | 13.8 | 31.1 | 15.0 (15) | 73.3% | 0.7 / 3.2 / 7.8 | 9.0 (57.8%) |
| 5. shared, d6, 2p | landlord / builder | 47.5 / 52.5 | 53.5 / 46.5 | 5.1 | 7.3 | 15.0 (15) | 60.0% | 0.3 / 1.2 / 3.6 | 9.1 (21.0%) |
| 6. shared, d6, 3p | scorer / landlord / builder | 48.8 / 24.7 / 26.5 | 41.0 / 29.7 | 4.8 | 8.2 | 15.0 (15) | 66.7% | 0.3 / 1.3 / 2.7 | 9.3 (16.4%) |
| 7. shared, d6, 4p, vpPool 60 | greedy / scorer / landlord / builder | 36.5 / 18.8 / 38.7 / 6.0 | 29.8 / 18.8 | 25.0 | 62.3 | 36.7 (42) [2 hit stop] | 77.8% | 0.4 / 1.1 / 2.7 | 21.6 (58.2%) |
| 8. shared, d6, 4p, landmarkRace 3 | greedy / scorer / landlord / builder | 40.5 / 23.7 / 32.3 / 3.5 | 31.5 / 19.3 | 18.6 | 45.0 | 30.5 (41) [14 hit stop] | 74.1% | 0.4 / 1.1 / 2.7 | 19.2 (45.4%) |
| 9. shared, d6, 4p, cornerIncome 1 | greedy / scorer / landlord / builder | 31.3 / 34.2 / 16.7 / 17.8 | 30.5 / 19.2 | 4.0 | 6.9 | 15.0 (15) | 66.7% | 0.3 / 0.8 / 1.7 | 9.9 (9.8%) |
| 10. shared, d6, 4p, protectOwnSide | greedy / scorer / landlord / builder | 31.0 / 37.2 / 16.0 / 15.8 | 31.8 / 18.7 | 5.5 | 10.9 | 15.0 (15) | 80.0% | 0.4 / 1.1 / 2.7 | 10.1 (16.8%) |

Interaction and economy. Fires per game by class in the order civic / private / toll / public / landmark (shared only); toll share and corner share are fractions of the coins gained from tiles and corners; interaction index is the share of coin and VP movement that happens on another player's turn.

| Cell | Fires per game by class | Tolls per game (toll share) | Corner share | Interaction index | Buyouts per game | Landmarks per game | Top 3 take rates | Win lift hi | Win lift lo |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- |
| 1. loops, defaults | — | — | — | 2.1% | — | — | market 79.2%, shrine 77.1%, monument 62.1% | archive +35.6 | saboteur -13.9 |
| 2. loops, fireOnPass + landBonus 2 | — | — | — | 4.4% | — | — | shrine 76.4%, market 72.3%, monument 57.3% | cathedral +24.5 | guildhall -10.7 |
| 3. shared, d6, 4p | 27.4 / 5.8 / 1.8 / 4.9 / 1.0 | 1.87 (2.2%) | 55.2% | 22.2% | 2.07 | 1.16 | market 70.4%, pilgrim-road 59.2%, mill 56.1% | vineyard +39.9 | inn -14.9 |
| 4. shared, 2d6, 4p | 75.3 / 13.5 / 2.1 / 5.9 / 4.9 | 2.35 (1.4%) | 48.9% | 27.3% | 6.36 | 4.38 | market 78.1%, pilgrim-road 71.1%, mill 70.8% | amphitheatre +32.9 | guard-post -13.9 |
| 5. shared, d6, 2p | 16.5 / 3.2 / 0.8 / 2.0 / 1.6 | 0.92 (1.8%) | 58.3% | 16.2% | 0.60 | 1.43 | market 50.1%, pilgrim-road 43.0%, mill 38.5% | vineyard +31.6 | springboard -11.5 |
| 6. shared, d6, 3p | 21.5 / 4.1 / 1.4 / 3.6 / 1.1 | 1.53 (2.4%) | 56.4% | 21.6% | 1.93 | 1.24 | market 60.3%, pilgrim-road 52.9%, mill 47.6% | vineyard +42.5 | watchtower -21.9 |
| 7. shared, d6, 4p, vpPool 60 | 119.9 / 24.8 / 8.2 / 19.1 / 7.5 | 9.93 (3.3%) | 40.3% | 31.2% | 25.05 | 4.87 | market 69.3%, pilgrim-road 68.8%, amphitheatre 60.4% | amphitheatre +25.7 | watchtower -12.6 |
| 8. shared, d6, 4p, landmarkRace 3 | 91.3 / 18.5 / 6.7 / 15.1 / 4.3 | 7.45 (3.1%) | 43.8% | 28.6% | 16.27 | 3.97 | market 67.6%, pilgrim-road 65.2%, mill 57.0% | amphitheatre +29.3 | watchtower -16.2 |
| 9. shared, d6, 4p, cornerIncome 1 | 21.7 / 4.1 / 1.4 / 4.6 / 0.3 | 1.46 (2.9%) | 45.1% | 24.2% | 1.12 | 0.43 | market 66.4%, mill 53.1%, pilgrim-road 47.0% | vineyard +43.2 | inn -19.5 |
| 10. shared, d6, 4p, protectOwnSide | 27.4 / 5.9 / 1.8 / 5.1 / 1.0 | 1.86 (2.2%) | 55.0% | 21.6% | 1.79 | 1.16 | market 70.6%, pilgrim-road 59.2%, mill 56.4% | vineyard +40.6 | inn -16.0 |

### lookahead lineup (lookahead, scorer, landlord, builder at 4 players; 200 games per cell)

Outcome. Win % in seat order of the lineup listed in the cell's last column; seat 1 and last seat win %; VP are final (include end-of-game VP).

| Cell | Bots | Win % | Seat 1 / last | Winner VP | Total VP | Rounds mean (p90) | Decided by | VP at round 5 / 10 / 15 | Engine online (rate) |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| 1. loops, defaults | lookahead / scorer / landlord / builder | 51.5 / 24.5 / 12.5 / 11.5 | 20.5 / 27.0 | 6.2 | 10.7 | 15.0 (15) | 66.7% | 0.2 / 1.0 / 2.7 | 12.8 (3.4%) |
| 2. loops, fireOnPass + landBonus 2 | lookahead / scorer / landlord / builder | 67.0 / 10.5 / 13.5 / 9.0 | 37.0 / 20.0 | 27.1 | 53.7 | 15.0 (15) | 53.3% | 1.0 / 5.0 / 13.4 | 9.3 (50.4%) |
| 3. shared, d6, 4p | lookahead / scorer / landlord / builder | 42.5 / 30.5 / 12.5 / 14.5 | 25.0 / 21.5 | 5.1 | 10.0 | 15.0 (15) | 80.0% | 0.4 / 1.1 / 2.5 | 10.0 (15.4%) |
| 4. shared, 2d6, 4p | lookahead / scorer / landlord / builder | 45.0 / 21.0 / 27.0 / 7.0 | 30.0 / 18.0 | 12.6 | 28.9 | 15.0 (15) | 80.0% | 0.7 / 3.1 / 7.2 | 9.1 (49.5%) |
| 5. shared, d6, 2p | lookahead / builder | 73.0 / 27.0 | 52.0 / 48.0 | 6.8 | 9.1 | 15.0 (15) | 60.0% | 0.3 / 1.5 / 4.5 | 9.3 (30.8%) |
| 6. shared, d6, 3p | lookahead / landlord / builder | 53.5 / 27.0 / 19.5 | 45.0 / 27.0 | 4.5 | 7.7 | 15.0 (15) | 73.3% | 0.3 / 1.2 / 2.6 | 9.6 (18.8%) |
| 7. shared, d6, 4p, vpPool 60 | lookahead / scorer / landlord / builder | 58.0 / 11.0 / 28.0 / 3.0 | 28.5 / 22.0 | 24.6 | 62.0 | 38.7 (44) [1 hit stop] | 74.5% | 0.4 / 1.1 / 2.5 | 22.1 (53.1%) |
| 8. shared, d6, 4p, landmarkRace 3 | lookahead / scorer / landlord / builder | 57.0 / 21.5 / 19.0 / 2.5 | 26.5 / 25.0 | 17.4 | 41.0 | 31.1 (39) [1 hit stop] | 73.1% | 0.4 / 1.1 / 2.5 | 19.1 (40.9%) |
| 9. shared, d6, 4p, cornerIncome 1 | lookahead / scorer / landlord / builder | 33.5 / 32.5 / 20.0 / 14.0 | 26.0 / 20.5 | 3.7 | 6.3 | 15.0 (15) | 66.7% | 0.4 / 0.8 / 1.6 | 9.3 (9.5%) |
| 10. shared, d6, 4p, protectOwnSide | lookahead / scorer / landlord / builder | 36.5 / 31.0 / 19.0 / 13.5 | 27.0 / 22.5 | 5.2 | 10.3 | 15.0 (15) | 80.0% | 0.4 / 1.0 / 2.6 | 10.1 (15.6%) |

Interaction and economy. Fires per game by class in the order civic / private / toll / public / landmark (shared only); toll share and corner share are fractions of the coins gained from tiles and corners; interaction index is the share of coin and VP movement that happens on another player's turn.

| Cell | Fires per game by class | Tolls per game (toll share) | Corner share | Interaction index | Buyouts per game | Landmarks per game | Top 3 take rates | Win lift hi | Win lift lo |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- |
| 1. loops, defaults | — | — | — | 3.7% | — | — | shrine 77.8%, market 76.8%, monument 66.1% | archive +46.8 | trebuchet -16.0 |
| 2. loops, fireOnPass + landBonus 2 | — | — | — | 8.7% | — | — | shrine 75.8%, market 66.9%, monument 65.0% | cathedral +27.2 | guildhall -22.5 |
| 3. shared, d6, 4p | 20.3 / 6.2 / 1.5 / 4.4 / 1.0 | 1.70 (2.2%) | 58.4% | 22.4% | 5.11 | 1.17 | market 60.4%, mill 49.7%, shrine 41.4% | vineyard +35.7 | ferry -16.0 |
| 4. shared, 2d6, 4p | 58.0 / 13.1 / 1.7 / 4.6 / 4.7 | 2.10 (1.3%) | 54.4% | 27.1% | 11.24 | 3.87 | market 63.2%, pilgrim-road 59.9%, mill 54.7% | vineyard +31.0 | chapel -9.8 |
| 5. shared, d6, 2p | 7.2 / 6.0 / 0.3 / 2.6 / 1.9 | 0.34 (0.8%) | 56.5% | 13.7% | 2.18 | 1.65 | mine 44.3%, vineyard 29.9%, watchtower 26.5% | vineyard +42.2 | bazaar -8.5 |
| 6. shared, d6, 3p | 14.9 / 5.2 / 1.1 / 3.4 / 1.1 | 1.34 (2.0%) | 57.6% | 22.7% | 5.04 | 1.20 | market 56.8%, mill 42.9%, mine 40.4% | vineyard +40.6 | ferry -12.1 |
| 7. shared, d6, 4p, vpPool 60 | 103.7 / 28.1 / 6.2 / 18.5 / 8.2 | 8.51 (2.5%) | 42.5% | 30.4% | 32.65 | 4.72 | market 58.4%, pilgrim-road 49.1%, mill 48.7% | watchtower +32.1 | ferry -5.0 |
| 8. shared, d6, 4p, landmarkRace 3 | 72.2 / 20.0 / 4.8 / 13.5 / 4.4 | 5.99 (2.4%) | 47.2% | 28.1% | 21.20 | 3.85 | market 56.9%, mill 46.9%, pilgrim-road 45.2% | vineyard +30.4 | ferry -4.2 |
| 9. shared, d6, 4p, cornerIncome 1 | 15.8 / 4.4 / 1.4 / 3.9 / 0.3 | 1.48 (3.4%) | 49.0% | 25.2% | 3.22 | 0.41 | market 56.6%, mill 44.3%, shrine 42.6% | monument +36.8 | inn -15.0 |
| 10. shared, d6, 4p, protectOwnSide | 19.9 / 6.4 / 1.6 / 4.8 / 1.0 | 1.76 (2.3%) | 58.0% | 21.4% | 4.53 | 1.20 | market 58.0%, mill 48.0%, pilgrim-road 41.4% | vineyard +34.4 | workshop -7.2 |

<!-- table:end -->

## Placement value

Greedy with the class-aware traffic placement against the same Greedy with the
traffic terms off (`greedy-random`; it still pays cost, replace and buyout terms),
shared board, d6, 4 players, same seeds: standard lineup 30.3% against 5.7%
(+24.7 points) over 300 games and 28.1% against 6.3% (+21.8) over 2000; shared
lineup 29.4% against 7.0% (+22.4) over 2000. The loops-mode value in the balance
log is -1.8 points. Part of the shared lift is the control's own doing: random
placement puts tolls and privates on slots the owner's token rarely reaches, and
it gives up the income of civics.

## What moved

Facts only. Numbers come from the tables above or from supplementary batches of the
same bots noted in the text. Cell 1 is the reference. "Standard" is greedy / scorer /
aggressor / turtle, "shared" is greedy / scorer / landlord / builder, "lookahead" is
lookahead / scorer / landlord / builder; the 2 and 3 player cells seat the bots listed
in their row.

**1. loops, defaults (reference).** Standard: Scorer 52.3%, Greedy 23.3%, Turtle 14.0%,
Aggressor 10.3%; winner VP 4.7, total VP 7.7, mean VP per player 0.2 / 0.7 / 1.9 at
rounds 5 / 10 / 15. Income reaches 8 coins in a round for 1.5% of players (round 11.7
for those). 2.3% of coin and VP movement happens on another player's turn. Seat 1
wins 21.7%, seat 4 26.5%. Shared lineup: Scorer 46.3%. Lookahead lineup: Lookahead
51.5%.

**2. loops, fireOnPass + landBonus 2.** Standard: Scorer 33.8%, Greedy 33.5%, Turtle
20.2%, Aggressor 12.5%; winner VP 17.7, total VP 37.2, VP at 5 / 10 / 15 0.7 / 3.3 /
9.3. 40.5% of players reach 8 coins of income in a round (round 9.3). Interaction
index 5.0%. Seat 1 29.5%, seat 4 21.3%. Shared lineup: landlord 37.2% (18.2% in cell 1).
Lookahead lineup: Lookahead 67.0%, winner VP 27.1.

**3. shared, d6, 4p.** Standard: Scorer 34.8%, Turtle 28.5%, Greedy 27.5%, Aggressor
9.2%; winner VP 5.9, total VP 11.5, VP at 5 / 10 / 15 0.4 / 1.2 / 2.9. Income reaches 8
for 22.8% of players (round 10.5). Interaction index 22.6% against 2.3%. Corner income
is 50.1% of the coins gained from tiles and corners; the toll share is 2.4% (2.35 tolls
per game); fires per game are 32.0 civic, 7.2 private, 2.2 toll, 6.1 public, 0.1
landmark. Market, Mill and Pilgrim Road are taken 89.5%, 80.8% and 77.9% of the times
they are affordable (loops reference: 72.5% at most, Shrine). Standard-lineup bots buy 0.39
buyouts and 0.09 landmarks per game. Seat 1 wins 31.5%, seat 4 19.8%. Decided-by is
73.3%, the same as cell 1. Shared lineup: Scorer 37.2%, Greedy 29.2%, landlord 16.8%,
builder 16.8%; 2.07 buyouts and 1.16 landmarks per game, 1.87 tolls per game (2.2%
toll share); seat 1 32.5%, seat 4 19.5%; decided-by 80.0%. Lookahead lineup: Lookahead
42.5% (51.5% in cell 1), Scorer 30.5%; 5.11 buyouts per game. Four identical bots,
seats not rotated, 1000 games: Greedy wins seats 1 to 4 31.2 / 26.6 / 22.9 / 19.3%,
Scorer 34.5 / 22.5 / 23.1 / 19.9%, Random 24.4 / 26.8 / 26.5 / 22.3%.

**4. shared, 2d6, 4p.** Standard: Turtle 35.7%, Scorer 31.0%, Greedy 24.7%, Aggressor
8.7%; winner VP 15.5, total VP 34.6, VP at 5 / 10 / 15 0.7 / 3.5 / 8.6. Civic fires go
from 32.0 to 89.6 per game and private fires from 7.2 to 16.4; toll fires 2.2 to 3.1.
Income reaches 8 for 67.9% of players (round 9.0). Corner share 44.4%, interaction
index 30.7%, buyouts 6.88 and landmarks 2.29 per game. Seat 1 wins 37.3% and seat 4
12.8%; with four identical bots Greedy wins seats 1 to 4 41.6 / 24.1 / 18.1 / 16.2%,
Scorer 38.2 / 25.8 / 19.8 / 16.2%, Random 27.0 / 27.4 / 22.1 / 23.5%. Decided-by 66.7%.
Shared lineup: landlord 36.2%, Greedy 30.3%, Scorer 25.0%, builder 8.5%; builder buys
4.38 landmarks per game (all players). Lookahead lineup: Lookahead 45.0%, landlord 27.0%.

**5. shared, d6, 2p.** Standard: Greedy 46.5%, Scorer 53.5%; winner VP 7.5, total VP
10.6, VP at 5 / 10 / 15 0.4 / 1.9 / 5.3 (20 slots). Tolls 0.08 per game. Interaction
index 15.9%. Seat 1 wins 58.8% (shared lineup, landlord against builder: 53.5%;
lookahead against builder: 52.0%). Decided-by 60.0%. Shared lineup: landlord 47.5%,
builder 52.5%, 0.92 tolls per game. Lookahead lineup: Lookahead 73.0%, builder 27.0%.

**6. shared, d6, 3p.** Standard (greedy, scorer, aggressor): 40.2 / 49.8 / 10.0%;
winner VP 5.5, total VP 9.3. Seat 1 wins 41.8%, seat 3 27.7%. Interaction index 21.9%.
Shared lineup (scorer, landlord, builder): 48.8 / 24.7 / 26.5%. Lookahead lineup
(lookahead, landlord, builder): 53.5 / 27.0 / 19.5%, seat 1 45.0%.

**7. shared, d6, 4p, vpPool 60.** Standard games last 35.3 rounds on average (p90
40; 1 game of 600 hit the 50-round stop). Turtle 45.0%, Greedy 33.3%, Scorer 17.7%,
Aggressor 4.0%; winner VP 25.2, total VP 61.8. Buyouts 33.19 per game, tolls 12.83
per game (4.5% toll share), interaction index 37.6%, corner share 36.6%, 66.6% of
players reach 8 coins of income in a round (round 19.7). Shared lineup: 36.7 rounds
(p90 42, 2 at the stop), landlord 38.7%, Greedy 36.5%, Scorer 18.8%, builder 6.0%;
25.05 buyouts and 4.87 landmarks per game. Lookahead lineup: 38.7 rounds, Lookahead
58.0%.

**8. shared, d6, 4p, landmarkRace 3.** Standard: 359 of 600 games hit the 50-round stop
(mean 45.1 rounds); Turtle 45.3%, Greedy 32.3%, Scorer 15.5%, Aggressor 6.8%; 3.36
landmarks per game, 54.33 buyouts per game. Shared lineup: mean 30.5 rounds (p90 41,
14 at the stop); Greedy 40.5%, landlord 32.3%, Scorer 23.7%, builder 3.5%; 3.97
landmarks per game. Lookahead lineup: mean 31.1 rounds, Lookahead 57.0%, builder
2.5%. The winner is ranked by VP when the game ends, not by landmarks owned.

**9. shared, d6, 4p, cornerIncome 1.** Standard: Scorer 31.8%, Greedy 29.8%, Turtle
27.7%, Aggressor 10.7%; winner VP 4.3 (5.9 in cell 3), total VP 7.7 (11.5), VP at 5 / 10
/ 15 0.3 / 0.8 / 1.9. Corner share 41.5% (50.1%); income reaches 8 for 12.3% of
players (22.8%). Buyouts per game 0.07 (0.39) and landmarks 0.02 (0.09). Shared
lineup: buyouts 1.12 (2.07), landmarks 0.43 (1.16), builder 17.8% (16.8%). Lookahead
lineup: Lookahead 33.5% (42.5%).

**10. shared, d6, 4p, protectOwnSide.** Standard win rates are within 0.3 points of
cell 3 (27.3 / 34.8 / 9.5 / 28.3) and buyouts per game go 0.39 to 0.34. Shared lineup:
buyouts 2.07 to 1.79, landlord 16.8% to 16.0%, Scorer 37.2% unchanged. Lookahead
lineup: buyouts 5.11 to 4.53, Lookahead 42.5% to 36.5%, Scorer 30.5% to 31.0% (200
games per cell).

**Across cells.** Interaction index is 21 to 25% in the d6 4-player shared cells
and 13.7 to 16.2% at two players, against 2.1 to 3.7% in loops cell 1 and 4.4 to
8.7% in cell 2. The toll share is 0.1 to 3.4% of coins gained in the 15-round shared cells
and 2.4 to 5.6% in cells 7 and 8. Corner income is 35 to 58% of the coins gained
from tiles and corners in every shared cell. The seat-1 win rate is 25.0 to 39.0%
in 4-player shared cells and the last seat's 12.8 to 25.0%; no 4-player loops cell
has seat 1 above 22.2% except cell 2 (29.5 to 37.0%).

## Supplementary: Lookahead timing

200 shared games, 4 players, d6, one machine, `npm run sim -- batch --board shared`:
four Lookaheads 17.6 s before the pruning and 7.8 s after; Lookahead against
scorer / landlord / builder (the experiment's lookahead lineup) 2.6 s. The whole
experiment takes about 130 s.
