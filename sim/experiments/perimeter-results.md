# Perimeter experiment

Question: the shared-board experiment (`shared-results.md`) found interaction and
placement work, but at 10 slots per side with a d6 the board is sparse (winner VP 5.9
in 15 rounds, corners 50% of income, two tolls and seven private fires a game), and
2d6 fixes density while seat 1 wins 37% and seat 4 13%. This experiment fixes the
perimeter instead and tries the new options one at a time against the 40-slot
reference. Reproduce with `node --import tsx sim/experiments/perimeter.ts --write`
(about 4 minutes; nothing was cut). Seeds 1 to N and the same seat rotation in every
cell, so cells are paired within a lineup.

Cells (all shared mode, turnCap 15 unless noted; "24" means `perimeter` 24, so 12 / 8 / 6
slots per side at 2 / 3 / 4 players):

1. **reference**: `sideLength` 10 (40 slots at 4 players), d6, 4p (cell 3 of the last experiment).
2. **24, d6, 4p**. 3. **24, 2d6, 4p**. 4. **24, d6, 2p** (12 per side). 5. **24, d6, 3p** (8 per side).
6. **24, d6, 4p, `catchUpCoins` 1** (seats start with 5 / 6 / 7 / 8 coins).
7. **24, 2d6, 4p, catchUp 1**. 8. **24, 2d6, 4p, catchUp 2** (5 / 7 / 9 / 11).
9. **24, d6, 4p, `tollOnPass` 0.5**.
10. **24, d6, 4p, vpPool 60, `buyoutPremium` 0** (long game, the buyout churn reference).
11. **same, `buyoutPremium` 2**.
12. **24, d6, 4p, landmarkRace 3**, now ranked by landmarks owned first.
13. **perimeter 32** (8 per side), d6, 4p.
14. **24, d6, 4p, `replacementTax` 2**. 15. **same, escalating** (2, 4, 6, ... per player).
16. **vpPool 60 with replacementTax 2**. 17. **vpPool 60 with escalating replacementTax 2**.

Lineups: standard (greedy, scorer, aggressor, turtle), shared (greedy, scorer, landlord,
builder) at 600 games per cell; lookahead (lookahead, scorer, landlord, builder) at 200.
At 2 and 3 players the bots are the ones listed in the row (as in `shared-results.md`).
Columns are those of `shared-results.md`, plus: slots per board; board-full round (mean
first round in which every non-corner slot holds a tile or landmark, and the share of
games that got there; sells carry no slot and are ignored, 5 happened in all cells
together); replacement share (buys onto an occupied slot, own tile or buyout, over all
tile and landmark buys); tax paid per game. Tolls per game counts landing tolls; pass
tolls (cell 9) are added. The seat-bias table is four identical greedy bots, seats not
rotated, 1000 games, for cells 2, 3, 7 and 8 plus the reference (cell 1; its row equals
the last experiment's 31.2 / 26.6 / 22.9 / 19.3, as it should). Take rates in the
tables use the printed tile cost, so with a premium or tax they are a little generous.

<!-- table:start -->
### standard lineup (greedy, scorer, aggressor, turtle at 4 players; 600 games per cell)

Outcome. Win % in the order of the Bots column; seat 1 and last seat win %; VP are final (include end-of-game VP).

| Cell | Bots | Win % | Seat 1 / last | Winner VP | Total VP | Rounds mean (p90) | Decided by | VP at round 5 / 10 / 15 | Engine online (rate) |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| 1. reference: sideLength 10 (40 slots), d6, 4p | greedy / scorer / aggressor / turtle | 27.5 / 34.8 / 9.2 / 28.5 | 31.5 / 19.8 | 5.9 | 11.5 | 15.0 (15) | 73.3% | 0.4 / 1.2 / 2.9 | 10.5 (22.8%) |
| 2. perimeter 24, d6, 4p | greedy / scorer / aggressor / turtle | 26.2 / 34.3 / 8.8 / 30.7 | 34.8 / 19.2 | 11.2 | 24.4 | 15.0 (15) | 73.3% | 0.7 / 2.9 / 6.1 | 8.9 (47.7%) |
| 3. perimeter 24, 2d6, 4p | greedy / scorer / aggressor / turtle | 27.0 / 30.2 / 7.3 / 35.5 | 33.7 / 19.5 | 22.9 | 60.1 | 15.0 (15) | 66.7% | 2.1 / 7.8 / 15.0 | 5.8 (85.3%) |
| 4. perimeter 24, d6, 2p | greedy / scorer | 43.2 / 56.8 | 55.2 / 44.8 | 5.2 | 7.3 | 15.0 (15) | 60.0% | 0.3 / 1.5 / 3.6 | 9.9 (25.9%) |
| 5. perimeter 24, d6, 3p | greedy / scorer / aggressor | 42.0 / 45.0 / 13.0 | 42.5 / 24.0 | 8.0 | 13.9 | 15.0 (15) | 66.7% | 0.5 / 2.0 / 4.6 | 9.9 (40.8%) |
| 6. perimeter 24, d6, 4p, catchUp 1 | greedy / scorer / aggressor / turtle | 25.2 / 37.7 / 7.3 / 29.8 | 25.0 / 23.3 | 11.8 | 26.8 | 15.0 (15) | 73.3% | 0.9 / 3.4 / 6.7 | 8.7 (51.2%) |
| 7. perimeter 24, 2d6, 4p, catchUp 1 | greedy / scorer / aggressor / turtle | 28.7 / 31.0 / 8.5 / 31.8 | 27.7 / 24.8 | 23.7 | 64.5 | 15.0 (15) | 73.3% | 2.4 / 8.6 / 16.1 | 5.6 (83.6%) |
| 8. perimeter 24, 2d6, 4p, catchUp 2 | greedy / scorer / aggressor / turtle | 25.3 / 32.7 / 4.3 / 37.7 | 22.0 / 26.2 | 24.4 | 67.5 | 15.0 (15) | 73.3% | 2.9 / 9.3 / 16.9 | 5.7 (84.1%) |
| 9. perimeter 24, d6, 4p, tollOnPass 0.5 | greedy / scorer / aggressor / turtle | 26.8 / 33.3 / 10.2 / 29.7 | 34.3 / 19.7 | 11.1 | 24.1 | 15.0 (15) | 73.3% | 0.7 / 2.8 / 6.0 | 8.9 (49.4%) |
| 10. perimeter 24, d6, 4p, vpPool 60, premium 0 | greedy / scorer / aggressor / turtle | 33.7 / 19.0 / 4.8 / 42.5 | 30.8 / 22.5 | 24.0 | 62.0 | 27.5 (33) [1 hit stop] | 72.0% | 0.7 / 2.9 / 6.1 | 12.5 (67.0%) |
| 11. perimeter 24, d6, 4p, vpPool 60, premium 2 | greedy / scorer / aggressor / turtle | 31.3 / 17.8 / 9.2 / 41.7 | 30.5 / 21.0 | 25.8 | 62.0 | 28.9 (35) | 67.9% | 0.7 / 2.8 / 5.9 | 12.5 (65.3%) |
| 12. perimeter 24, d6, 4p, landmarkRace 3 (ranked by landmarks) | greedy / scorer / aggressor / turtle | 32.7 / 18.3 / 8.2 / 40.8 | 20.3 / 31.7 | 32.2 | 105.6 | 42.0 (50) [320 hit stop] | 98.0% | 0.7 / 2.9 / 6.1 | 15.2 (75.8%) |
| 13. perimeter 32 (8 per side), d6, 4p | greedy / scorer / aggressor / turtle | 28.3 / 32.7 / 10.0 / 29.0 | 29.7 / 19.5 | 8.0 | 16.8 | 15.0 (15) | 73.3% | 0.5 / 1.8 / 4.2 | 9.7 (32.4%) |
| 14. perimeter 24, d6, 4p, replacementTax 2 | greedy / scorer / aggressor / turtle | 23.5 / 37.3 / 7.8 / 31.3 | 33.5 / 20.2 | 10.9 | 23.0 | 15.0 (15) | 66.7% | 0.7 / 2.8 / 5.8 | 8.9 (46.3%) |
| 15. perimeter 24, d6, 4p, replacementTax 2 escalating | greedy / scorer / aggressor / turtle | 22.5 / 41.2 / 9.7 / 26.7 | 33.2 / 19.7 | 10.5 | 21.9 | 15.0 (15) | 60.0% | 0.7 / 2.8 / 5.5 | 9.0 (46.7%) |
| 16. perimeter 24, d6, 4p, vpPool 60, replacementTax 2 | greedy / scorer / aggressor / turtle | 31.7 / 18.2 / 8.3 / 41.8 | 30.0 / 22.2 | 24.7 | 62.0 | 29.7 (36) | 69.7% | 0.7 / 2.8 / 5.8 | 12.7 (65.7%) |
| 17. perimeter 24, d6, 4p, vpPool 60, replacementTax 2 escalating | greedy / scorer / aggressor / turtle | 33.5 / 25.3 / 2.7 / 38.5 | 28.2 / 22.5 | 25.9 | 61.4 | 33.4 (44) [16 hit stop] | 58.1% | 0.7 / 2.8 / 5.5 | 12.9 (65.4%) |

Board, interaction and economy. Slots per board; board-full round = mean first round in which every non-corner slot holds a tile or landmark (share of games that got there); replacement share = buys onto an occupied slot (own tile or buyout) ÷ all tile and landmark buys; tax paid = replacement tax coins per game. Fires per game by class civic / private / toll / public / landmark; tolls per game at landings (+ pass tolls) with the toll share of coins gained; corner share; interaction index; buyouts and landmarks per game.

| Cell | Slots | Board full (reached) | Replacement share | Tax paid | Fires per game by class | Tolls per game (toll share) | Corner share | Interaction index | Buyouts per game | Landmarks per game | Top 3 take rates |
| --- | ---: | --- | ---: | ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1. reference: sideLength 10 (40 slots), d6, 4p | 40 | never (0.0%) | 1.7% | — | 32.0 / 7.2 / 2.2 / 6.1 / 0.1 | 2.35 (2.4%) | 50.1% | 22.6% | 0.39 | 0.09 | market 89.5%, mill 80.8%, pilgrim-road 77.9% |
| 2. perimeter 24, d6, 4p | 24 | 10.0 (99.7%) | 48.3% | — | 57.2 / 12.3 / 4.1 / 7.1 / 0.7 | 4.40 (3.2%) | 50.4% | 34.2% | 16.59 | 0.81 | market 93.6%, mill 86.3%, pilgrim-road 85.5% |
| 3. perimeter 24, 2d6, 4p | 24 | 6.4 (100.0%) | 62.1% | — | 110.7 / 19.9 / 4.0 / 4.7 / 8.0 | 4.96 (2.0%) | 53.1% | 33.8% | 27.10 | 4.46 | market 95.4%, mill 90.4%, pilgrim-road 89.0% |
| 4. perimeter 24, d6, 2p | 24 | 14.0 (0.2%) | 0.6% | — | 16.2 / 5.0 / 0.0 / 3.7 / 0.1 | 0.05 (0.1%) | 51.4% | 14.9% | 0.06 | 0.10 | pilgrim-road 74.5%, market 72.1%, amphitheatre 69.2% |
| 5. perimeter 24, d6, 3p | 24 | 13.5 (59.3%) | 18.2% | — | 36.7 / 7.5 / 2.5 / 5.9 / 0.2 | 2.50 (2.9%) | 48.1% | 26.2% | 3.91 | 0.26 | market 87.4%, pilgrim-road 79.9%, mill 77.4% |
| 6. perimeter 24, d6, 4p, catchUp 1 | 24 | 9.3 (99.8%) | 50.9% | — | 60.6 / 12.8 / 4.1 / 6.9 / 1.0 | 4.50 (3.2%) | 48.8% | 36.1% | 18.48 | 1.06 | market 93.4%, mill 86.2%, pilgrim-road 83.8% |
| 7. perimeter 24, 2d6, 4p, catchUp 1 | 24 | 6.2 (100.0%) | 62.5% | — | 113.5 / 19.7 / 3.8 / 4.3 / 9.1 | 4.73 (1.9%) | 52.8% | 34.2% | 27.38 | 4.72 | market 95.6%, mill 90.7%, pilgrim-road 89.3% |
| 8. perimeter 24, 2d6, 4p, catchUp 2 | 24 | 6.1 (100.0%) | 62.8% | — | 111.8 / 18.9 / 4.1 / 4.0 / 10.7 | 5.03 (2.1%) | 53.2% | 34.1% | 27.60 | 4.99 | market 95.0%, mill 91.1%, pilgrim-road 89.5% |
| 9. perimeter 24, d6, 4p, tollOnPass 0.5 | 24 | 10.0 (100.0%) | 47.7% | — | 57.8 / 12.1 / 8.9 / 6.8 / 0.6 | 4.49 + 4.97 pass (5.7%) | 49.0% | 34.6% | 16.16 | 0.78 | market 93.6%, mill 86.9%, pilgrim-road 86.0% |
| 10. perimeter 24, d6, 4p, vpPool 60, premium 0 | 24 | 10.0 (100.0%) | 73.7% | — | 113.8 / 24.4 / 10.3 / 11.5 / 4.2 | 11.47 (4.7%) | 48.6% | 40.3% | 49.13 | 2.46 | market 93.9%, pilgrim-road 90.6%, mill 88.4% |
| 11. perimeter 24, d6, 4p, vpPool 60, premium 2 | 24 | 9.6 (100.0%) | 70.0% | — | 126.8 / 25.5 / 10.6 / 11.4 / 3.4 | 11.73 (4.1%) | 47.8% | 33.1% | 22.98 | 1.87 | market 93.6%, pilgrim-road 88.1%, mill 86.7% |
| 12. perimeter 24, d6, 4p, landmarkRace 3 (ranked by landmarks) | 24 | 10.0 (100.0%) | 82.8% | — | 169.6 / 35.3 / 19.0 / 16.4 / 10.2 | 21.10 (5.4%) | 48.4% | 40.8% | 83.49 | 3.94 | market 94.0%, pilgrim-road 92.4%, mill 90.1% |
| 13. perimeter 32 (8 per side), d6, 4p | 32 | 14.2 (37.3%) | 12.6% | — | 44.3 / 9.3 / 3.1 / 7.6 / 0.2 | 3.39 (2.9%) | 47.8% | 26.8% | 3.48 | 0.25 | market 90.6%, mill 82.7%, pilgrim-road 81.9% |
| 14. perimeter 24, d6, 4p, replacementTax 2 | 24 | 9.4 (100.0%) | 39.9% | 26.52 | 57.8 / 11.9 / 4.0 / 7.5 / 0.4 | 4.30 (3.1%) | 50.2% | 31.4% | 11.78 | 0.41 | market 86.3%, mill 77.2%, pilgrim-road 73.2% |
| 15. perimeter 24, d6, 4p, replacementTax 2 escalating | 24 | 9.3 (100.0%) | 32.0% | 35.52 | 57.7 / 11.6 / 3.9 / 7.7 / 0.3 | 4.20 (3.0%) | 50.2% | 29.6% | 8.53 | 0.24 | market 78.1%, mill 64.0%, pilgrim-road 62.6% |
| 16. perimeter 24, d6, 4p, vpPool 60, replacementTax 2 | 24 | 9.4 (100.0%) | 69.4% | 90.70 | 129.3 / 26.5 / 11.4 / 13.2 / 2.4 | 12.39 (4.4%) | 47.5% | 37.0% | 39.76 | 1.29 | market 80.8%, mill 73.5%, pilgrim-road 72.2% |
| 17. perimeter 24, d6, 4p, vpPool 60, replacementTax 2 escalating | 24 | 9.3 (100.0%) | 53.1% | 163.45 | 152.2 / 27.6 / 11.3 / 15.5 / 1.0 | 12.21 (3.8%) | 46.5% | 33.1% | 20.34 | 0.33 | market 44.5%, pilgrim-road 33.3%, mill 31.9% |

### shared lineup (greedy, scorer, landlord, builder at 4 players; 600 games per cell)

Outcome. Win % in the order of the Bots column; seat 1 and last seat win %; VP are final (include end-of-game VP).

| Cell | Bots | Win % | Seat 1 / last | Winner VP | Total VP | Rounds mean (p90) | Decided by | VP at round 5 / 10 / 15 | Engine online (rate) |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| 1. reference: sideLength 10 (40 slots), d6, 4p | greedy / scorer / landlord / builder | 29.2 / 37.2 / 16.8 / 16.8 | 32.5 / 19.5 | 5.4 | 10.8 | 15.0 (15) | 80.0% | 0.4 / 1.1 / 2.7 | 10.1 (16.4%) |
| 2. perimeter 24, d6, 4p | greedy / scorer / landlord / builder | 27.8 / 32.8 / 28.7 / 10.7 | 34.8 / 16.8 | 10.1 | 22.5 | 15.0 (15) | 73.3% | 0.7 / 2.7 / 5.6 | 9.0 (42.2%) |
| 3. perimeter 24, 2d6, 4p | greedy / scorer / landlord / builder | 28.3 / 23.8 / 30.7 / 17.2 | 36.7 / 20.0 | 22.0 | 60.0 | 15.0 (15) | 73.3% | 1.9 / 7.3 / 15.0 | 6.0 (83.0%) |
| 4. perimeter 24, d6, 2p | landlord / builder | 48.3 / 51.7 | 52.3 / 47.7 | 3.6 | 4.8 | 15.0 (15) | 66.7% | 0.2 / 0.9 / 2.4 | 9.1 (13.4%) |
| 5. perimeter 24, d6, 3p | scorer / landlord / builder | 43.8 / 31.0 / 25.2 | 40.7 / 25.5 | 6.9 | 12.3 | 15.0 (15) | 66.7% | 0.5 / 1.9 / 4.1 | 9.8 (28.9%) |
| 6. perimeter 24, d6, 4p, catchUp 1 | greedy / scorer / landlord / builder | 28.2 / 31.2 / 29.0 / 11.7 | 29.3 / 21.5 | 10.4 | 24.8 | 15.0 (15) | 80.0% | 0.9 / 3.1 / 6.2 | 8.8 (43.2%) |
| 7. perimeter 24, 2d6, 4p, catchUp 1 | greedy / scorer / landlord / builder | 31.8 / 20.2 / 28.7 / 19.3 | 33.3 / 20.8 | 22.7 | 62.6 | 15.0 (15) | 73.3% | 2.2 / 7.9 / 15.7 | 5.7 (81.3%) |
| 8. perimeter 24, 2d6, 4p, catchUp 2 | greedy / scorer / landlord / builder | 29.2 / 26.2 / 25.2 / 19.5 | 31.7 / 25.2 | 23.0 | 65.5 | 15.0 (15) | 80.0% | 2.6 / 8.5 / 16.4 | 5.9 (79.7%) |
| 9. perimeter 24, d6, 4p, tollOnPass 0.5 | greedy / scorer / landlord / builder | 26.0 / 28.7 / 35.7 / 9.7 | 33.8 / 17.5 | 9.9 | 22.3 | 15.0 (15) | 73.3% | 0.7 / 2.6 / 5.6 | 9.1 (43.5%) |
| 10. perimeter 24, d6, 4p, vpPool 60, premium 0 | greedy / scorer / landlord / builder | 33.2 / 17.7 / 35.0 / 14.2 | 37.5 / 18.0 | 23.1 | 62.4 | 27.9 (33) | 76.9% | 0.7 / 2.7 / 5.6 | 13.0 (62.7%) |
| 11. perimeter 24, d6, 4p, vpPool 60, premium 2 | greedy / scorer / landlord / builder | 40.3 / 16.7 / 30.8 / 12.2 | 36.5 / 18.2 | 24.8 | 62.5 | 28.5 (34) | 69.7% | 0.7 / 2.7 / 5.7 | 12.6 (59.4%) |
| 12. perimeter 24, d6, 4p, landmarkRace 3 (ranked by landmarks) | greedy / scorer / landlord / builder | 5.8 / 1.8 / 0.0 / 92.3 | 25.5 / 26.8 | 7.6 | 39.7 | 20.5 (30) | 100.0% | 0.7 / 2.7 / 5.5 | 11.3 (51.5%) |
| 13. perimeter 32 (8 per side), d6, 4p | greedy / scorer / landlord / builder | 34.5 / 31.8 / 20.0 / 13.7 | 29.8 / 20.5 | 6.9 | 14.9 | 15.0 (15) | 73.3% | 0.5 / 1.7 / 3.7 | 9.5 (26.1%) |
| 14. perimeter 24, d6, 4p, replacementTax 2 | greedy / scorer / landlord / builder | 25.2 / 38.8 / 23.7 / 12.3 | 35.7 / 18.7 | 10.1 | 22.3 | 15.0 (15) | 66.7% | 0.7 / 2.7 / 5.6 | 8.9 (42.2%) |
| 15. perimeter 24, d6, 4p, replacementTax 2 escalating | greedy / scorer / landlord / builder | 25.8 / 39.8 / 22.3 / 12.0 | 32.7 / 19.8 | 10.2 | 22.1 | 15.0 (15) | 66.7% | 0.7 / 2.7 / 5.5 | 8.9 (42.3%) |
| 16. perimeter 24, d6, 4p, vpPool 60, replacementTax 2 | greedy / scorer / landlord / builder | 41.0 / 15.7 / 29.5 / 13.8 | 33.0 / 20.8 | 23.9 | 62.2 | 29.1 (35) | 77.4% | 0.7 / 2.7 / 5.6 | 13.2 (62.7%) |
| 17. perimeter 24, d6, 4p, vpPool 60, replacementTax 2 escalating | greedy / scorer / landlord / builder | 37.7 / 25.3 / 20.3 / 16.7 | 32.8 / 21.3 | 24.4 | 61.8 | 31.3 (39) [2 hit stop] | 66.7% | 0.7 / 2.7 / 5.5 | 12.9 (60.1%) |

Board, interaction and economy. Slots per board; board-full round = mean first round in which every non-corner slot holds a tile or landmark (share of games that got there); replacement share = buys onto an occupied slot (own tile or buyout) ÷ all tile and landmark buys; tax paid = replacement tax coins per game. Fires per game by class civic / private / toll / public / landmark; tolls per game at landings (+ pass tolls) with the toll share of coins gained; corner share; interaction index; buyouts and landmarks per game.

| Cell | Slots | Board full (reached) | Replacement share | Tax paid | Fires per game by class | Tolls per game (toll share) | Corner share | Interaction index | Buyouts per game | Landmarks per game | Top 3 take rates |
| --- | ---: | --- | ---: | ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1. reference: sideLength 10 (40 slots), d6, 4p | 40 | never (0.0%) | 9.6% | — | 27.4 / 5.8 / 1.8 / 4.9 / 1.0 | 1.87 (2.2%) | 55.2% | 22.2% | 2.07 | 1.16 | market 70.4%, pilgrim-road 59.2%, mill 56.1% |
| 2. perimeter 24, d6, 4p | 24 | 11.7 (95.8%) | 41.3% | — | 51.8 / 10.0 / 3.7 / 7.0 / 2.4 | 4.00 (3.0%) | 52.8% | 29.8% | 11.74 | 2.60 | market 75.8%, mill 67.8%, pilgrim-road 67.6% |
| 3. perimeter 24, 2d6, 4p | 24 | 7.6 (100.0%) | 58.3% | — | 98.2 / 18.2 / 2.7 / 5.2 / 14.1 | 3.36 (1.3%) | 55.4% | 28.0% | 19.50 | 8.00 | market 83.6%, mill 79.3%, pilgrim-road 76.8% |
| 4. perimeter 24, d6, 2p | 24 | never (0.0%) | 4.5% | — | 12.0 / 2.4 / 0.7 / 1.6 / 1.0 | 0.80 (1.9%) | 60.9% | 15.5% | 0.42 | 1.13 | market 46.0%, pilgrim-road 33.0%, mill 30.0% |
| 5. perimeter 24, d6, 3p | 24 | 14.2 (8.2%) | 18.4% | — | 29.2 / 5.7 / 1.9 / 4.5 / 1.7 | 2.17 (2.5%) | 55.3% | 23.6% | 3.54 | 1.77 | market 63.8%, pilgrim-road 60.2%, mill 51.3% |
| 6. perimeter 24, d6, 4p, catchUp 1 | 24 | 11.2 (97.5%) | 44.3% | — | 54.9 / 10.4 / 3.7 / 7.0 / 2.7 | 4.03 (3.0%) | 51.5% | 31.7% | 13.39 | 2.75 | market 76.1%, mill 69.9%, pilgrim-road 68.7% |
| 7. perimeter 24, 2d6, 4p, catchUp 1 | 24 | 7.4 (100.0%) | 59.0% | — | 99.2 / 17.9 / 2.7 / 4.6 / 15.5 | 3.45 (1.3%) | 55.2% | 28.6% | 20.25 | 8.20 | market 83.9%, mill 80.3%, lighthouse 77.7% |
| 8. perimeter 24, 2d6, 4p, catchUp 2 | 24 | 7.4 (100.0%) | 59.1% | — | 99.2 / 17.1 / 2.9 / 4.0 / 16.8 | 3.63 (1.4%) | 55.0% | 28.6% | 20.68 | 8.31 | market 83.9%, mill 79.7%, pilgrim-road 77.2% |
| 9. perimeter 24, d6, 4p, tollOnPass 0.5 | 24 | 11.8 (94.0%) | 41.0% | — | 51.8 / 9.9 / 7.9 / 7.0 / 2.2 | 3.97 + 4.64 pass (5.3%) | 51.8% | 30.1% | 11.56 | 2.46 | market 76.1%, mill 69.3%, pilgrim-road 68.4% |
| 10. perimeter 24, d6, 4p, vpPool 60, premium 0 | 24 | 11.9 (100.0%) | 70.7% | — | 104.6 / 21.4 / 7.5 / 12.0 / 11.0 | 9.10 (3.3%) | 51.0% | 33.4% | 37.56 | 5.75 | market 78.2%, pilgrim-road 73.9%, mill 70.7% |
| 11. perimeter 24, d6, 4p, vpPool 60, premium 2 | 24 | 11.0 (100.0%) | 66.7% | — | 112.0 / 21.6 / 7.7 / 12.5 / 10.1 | 9.21 (3.1%) | 50.5% | 28.6% | 19.22 | 4.82 | market 75.3%, pilgrim-road 70.6%, mill 67.7% |
| 12. perimeter 24, d6, 4p, landmarkRace 3 (ranked by landmarks) | 24 | 11.9 (96.0%) | 59.0% | — | 75.1 / 15.3 / 5.7 / 9.4 / 5.0 | 6.34 (3.2%) | 51.4% | 31.1% | 22.74 | 4.15 | market 75.9%, pilgrim-road 70.2%, mill 68.3% |
| 13. perimeter 32 (8 per side), d6, 4p | 32 | 14.7 (3.0%) | 15.3% | — | 38.0 / 7.5 / 2.6 / 6.3 / 1.3 | 2.80 (2.7%) | 52.5% | 25.0% | 3.94 | 1.54 | market 72.2%, pilgrim-road 64.2%, mill 62.1% |
| 14. perimeter 24, d6, 4p, replacementTax 2 | 24 | 10.5 (99.3%) | 33.5% | 20.13 | 53.4 / 10.0 / 3.6 / 7.8 / 2.1 | 3.88 (2.8%) | 52.3% | 27.7% | 8.11 | 2.16 | market 69.7%, mill 60.1%, pilgrim-road 59.4% |
| 15. perimeter 24, d6, 4p, replacementTax 2 escalating | 24 | 10.4 (100.0%) | 27.1% | 26.54 | 53.5 / 10.0 / 3.5 / 8.1 / 2.0 | 3.76 (2.7%) | 52.2% | 26.3% | 5.83 | 2.06 | market 63.6%, mill 53.6%, pilgrim-road 52.4% |
| 16. perimeter 24, d6, 4p, vpPool 60, replacementTax 2 | 24 | 10.6 (100.0%) | 65.7% | 76.72 | 115.3 / 22.6 / 7.6 / 14.0 / 9.2 | 9.02 (3.0%) | 49.9% | 31.2% | 29.34 | 4.34 | market 66.4%, pilgrim-road 59.7%, mill 57.6% |
| 17. perimeter 24, d6, 4p, vpPool 60, replacementTax 2 escalating | 24 | 10.4 (100.0%) | 51.4% | 153.84 | 131.8 / 22.6 / 7.6 / 16.0 / 9.0 | 9.04 (2.7%) | 49.5% | 28.3% | 16.26 | 3.39 | market 40.3%, pilgrim-road 32.2%, mill 31.2% |

### lookahead lineup (lookahead, scorer, landlord, builder at 4 players; 200 games per cell)

Outcome. Win % in the order of the Bots column; seat 1 and last seat win %; VP are final (include end-of-game VP).

| Cell | Bots | Win % | Seat 1 / last | Winner VP | Total VP | Rounds mean (p90) | Decided by | VP at round 5 / 10 / 15 | Engine online (rate) |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| 1. reference: sideLength 10 (40 slots), d6, 4p | lookahead / scorer / landlord / builder | 42.5 / 30.5 / 12.5 / 14.5 | 25.0 / 21.5 | 5.1 | 10.0 | 15.0 (15) | 80.0% | 0.4 / 1.1 / 2.5 | 10.0 (15.4%) |
| 2. perimeter 24, d6, 4p | lookahead / scorer / landlord / builder | 41.0 / 26.0 / 21.0 / 12.0 | 32.5 / 20.0 | 9.4 | 21.3 | 15.0 (15) | 66.7% | 0.7 / 2.7 / 5.3 | 9.2 (35.0%) |
| 3. perimeter 24, 2d6, 4p | lookahead / scorer / landlord / builder | 33.5 / 27.5 / 26.5 / 12.5 | 28.0 / 24.0 | 21.2 | 58.1 | 15.0 (15) | 80.0% | 2.0 / 7.2 / 14.5 | 6.3 (82.0%) |
| 4. perimeter 24, d6, 2p | lookahead / builder | 70.5 / 29.5 | 49.5 / 50.5 | 4.3 | 5.6 | 15.0 (15) | 66.7% | 0.2 / 1.0 / 2.8 | 9.7 (24.8%) |
| 5. perimeter 24, d6, 3p | lookahead / landlord / builder | 57.5 / 26.0 / 16.5 | 34.5 / 32.0 | 6.8 | 11.4 | 15.0 (15) | 66.7% | 0.4 / 1.8 / 3.8 | 10.0 (27.3%) |
| 6. perimeter 24, d6, 4p, catchUp 1 | lookahead / scorer / landlord / builder | 48.5 / 23.0 / 21.5 / 7.0 | 24.0 / 21.0 | 10.4 | 24.6 | 15.0 (15) | 73.3% | 1.0 / 3.2 / 6.2 | 9.2 (38.9%) |
| 7. perimeter 24, 2d6, 4p, catchUp 1 | lookahead / scorer / landlord / builder | 34.5 / 24.5 / 25.0 / 16.0 | 26.0 / 17.5 | 22.5 | 63.4 | 15.0 (15) | 73.3% | 2.5 / 8.2 / 15.9 | 6.5 (82.4%) |
| 8. perimeter 24, 2d6, 4p, catchUp 2 | lookahead / scorer / landlord / builder | 31.5 / 26.0 / 26.5 / 16.0 | 27.5 / 22.5 | 23.3 | 66.0 | 15.0 (15) | 73.3% | 2.8 / 8.8 / 16.5 | 6.2 (79.4%) |
| 9. perimeter 24, d6, 4p, tollOnPass 0.5 | lookahead / scorer / landlord / builder | 40.0 / 27.5 / 22.5 / 10.0 | 30.5 / 23.5 | 9.3 | 21.2 | 15.0 (15) | 73.3% | 0.7 / 2.7 / 5.3 | 9.3 (37.3%) |
| 10. perimeter 24, d6, 4p, vpPool 60, premium 0 | lookahead / scorer / landlord / builder | 40.5 / 19.0 / 29.0 / 11.5 | 27.0 / 20.0 | 22.1 | 62.5 | 29.0 (34) | 84.6% | 0.7 / 2.7 / 5.3 | 14.5 (60.8%) |
| 11. perimeter 24, d6, 4p, vpPool 60, premium 2 | lookahead / scorer / landlord / builder | 40.0 / 21.0 / 28.5 / 10.5 | 28.5 / 22.5 | 23.3 | 62.3 | 28.2 (33) | 75.0% | 0.8 / 3.1 / 6.0 | 13.2 (60.9%) |
| 12. perimeter 24, d6, 4p, landmarkRace 3 (ranked by landmarks) | lookahead / scorer / landlord / builder | 1.0 / 0.5 / 0.0 / 98.5 | 26.0 / 25.0 | 7.4 | 40.3 | 21.6 (31) [3 hit stop] | 100.0% | 0.7 / 2.7 / 5.2 | 12.5 (49.1%) |
| 13. perimeter 32 (8 per side), d6, 4p | lookahead / scorer / landlord / builder | 40.0 / 31.5 / 15.5 / 13.0 | 29.0 / 21.5 | 6.7 | 14.1 | 15.0 (15) | 80.0% | 0.5 / 1.6 / 3.5 | 10.2 (24.0%) |
| 14. perimeter 24, d6, 4p, replacementTax 2 | lookahead / scorer / landlord / builder | 41.5 / 30.5 / 18.5 / 9.5 | 27.5 / 23.5 | 10.2 | 23.2 | 15.0 (15) | 73.3% | 0.8 / 3.1 / 5.8 | 9.2 (41.1%) |
| 15. perimeter 24, d6, 4p, replacementTax 2 escalating | lookahead / scorer / landlord / builder | 36.5 / 35.0 / 18.5 / 10.0 | 28.0 / 24.0 | 10.2 | 23.3 | 15.0 (15) | 66.7% | 0.8 / 3.1 / 5.8 | 9.1 (41.5%) |
| 16. perimeter 24, d6, 4p, vpPool 60, replacementTax 2 | lookahead / scorer / landlord / builder | 25.0 / 21.5 / 38.5 / 15.0 | 33.0 / 20.5 | 22.9 | 62.2 | 29.4 (36) | 85.2% | 0.8 / 3.1 / 5.8 | 13.3 (62.3%) |
| 17. perimeter 24, d6, 4p, vpPool 60, replacementTax 2 escalating | lookahead / scorer / landlord / builder | 25.5 / 32.0 / 26.5 / 16.0 | 27.0 / 20.0 | 23.7 | 61.9 | 30.9 (39) [2 hit stop] | 70.4% | 0.8 / 3.1 / 5.8 | 13.1 (60.9%) |

Board, interaction and economy. Slots per board; board-full round = mean first round in which every non-corner slot holds a tile or landmark (share of games that got there); replacement share = buys onto an occupied slot (own tile or buyout) ÷ all tile and landmark buys; tax paid = replacement tax coins per game. Fires per game by class civic / private / toll / public / landmark; tolls per game at landings (+ pass tolls) with the toll share of coins gained; corner share; interaction index; buyouts and landmarks per game.

| Cell | Slots | Board full (reached) | Replacement share | Tax paid | Fires per game by class | Tolls per game (toll share) | Corner share | Interaction index | Buyouts per game | Landmarks per game | Top 3 take rates |
| --- | ---: | --- | ---: | ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1. reference: sideLength 10 (40 slots), d6, 4p | 40 | never (0.0%) | 23.6% | — | 20.3 / 6.2 / 1.5 / 4.4 / 1.0 | 1.70 (2.2%) | 58.4% | 22.4% | 5.11 | 1.17 | market 60.4%, mill 49.7%, shrine 41.4% |
| 2. perimeter 24, d6, 4p | 24 | 13.1 (63.0%) | 42.2% | — | 41.2 / 10.3 / 3.1 / 6.8 / 2.4 | 3.71 (2.9%) | 56.5% | 28.4% | 13.23 | 2.36 | market 66.6%, mill 59.5%, pilgrim-road 57.7% |
| 3. perimeter 24, 2d6, 4p | 24 | 9.4 (100.0%) | 57.3% | — | 86.1 / 18.9 / 2.6 / 4.9 / 12.9 | 3.56 (1.4%) | 57.8% | 28.2% | 22.64 | 6.33 | market 73.2%, lighthouse 65.7%, mill 65.7% |
| 4. perimeter 24, d6, 2p | 24 | never (0.0%) | 20.7% | — | 5.3 / 4.7 / 0.2 / 2.0 / 1.3 | 0.24 (0.7%) | 58.0% | 14.4% | 1.99 | 1.28 | mine 43.6%, watchtower 28.1%, vineyard 26.5% |
| 5. perimeter 24, d6, 3p | 24 | never (0.0%) | 34.2% | — | 20.4 / 6.8 / 1.5 / 3.9 / 1.8 | 1.74 (2.2%) | 57.2% | 23.8% | 7.10 | 1.80 | market 55.3%, mill 46.2%, lighthouse 37.7% |
| 6. perimeter 24, d6, 4p, catchUp 1 | 24 | 12.8 (78.0%) | 44.8% | — | 46.8 / 11.1 / 3.1 / 6.9 / 2.7 | 3.69 (2.8%) | 53.8% | 30.6% | 14.89 | 2.58 | market 63.0%, mill 58.8%, pilgrim-road 58.1% |
| 7. perimeter 24, 2d6, 4p, catchUp 1 | 24 | 9.0 (100.0%) | 58.2% | — | 89.2 / 18.4 / 2.4 / 5.0 / 15.2 | 3.27 (1.2%) | 56.7% | 28.3% | 22.66 | 7.12 | market 73.7%, mill 68.7%, lighthouse 67.5% |
| 8. perimeter 24, 2d6, 4p, catchUp 2 | 24 | 9.1 (100.0%) | 58.6% | — | 88.0 / 17.6 / 2.4 / 4.7 / 16.6 | 3.33 (1.2%) | 57.0% | 28.3% | 23.52 | 7.24 | market 74.1%, mill 70.1%, lighthouse 69.8% |
| 9. perimeter 24, d6, 4p, tollOnPass 0.5 | 24 | 13.2 (63.5%) | 42.3% | — | 41.4 / 10.1 / 6.9 / 6.7 / 2.2 | 3.71 + 3.96 pass (5.2%) | 55.2% | 29.0% | 13.31 | 2.23 | market 63.0%, mill 59.8%, pilgrim-road 55.8% |
| 10. perimeter 24, d6, 4p, vpPool 60, premium 0 | 24 | 14.8 (100.0%) | 71.2% | — | 98.2 / 24.4 / 7.0 / 12.6 / 10.1 | 9.27 (3.2%) | 51.2% | 32.8% | 42.88 | 4.71 | market 68.0%, pilgrim-road 62.3%, mill 62.1% |
| 11. perimeter 24, d6, 4p, vpPool 60, premium 2 | 24 | 11.9 (100.0%) | 64.1% | — | 101.3 / 23.3 / 6.2 / 13.8 / 10.3 | 8.40 (2.6%) | 49.7% | 27.4% | 20.51 | 4.67 | market 58.2%, mill 52.4%, pilgrim-road 50.0% |
| 12. perimeter 24, d6, 4p, landmarkRace 3 (ranked by landmarks) | 24 | 14.6 (93.5%) | 60.3% | — | 69.4 / 17.4 / 5.3 / 9.9 / 4.9 | 6.35 (3.1%) | 53.1% | 30.4% | 26.95 | 3.73 | market 60.1%, pilgrim-road 59.2%, mill 58.0% |
| 13. perimeter 32 (8 per side), d6, 4p | 32 | never (0.0%) | 27.3% | — | 28.6 / 7.9 / 2.2 / 5.7 / 1.4 | 2.47 (2.5%) | 56.2% | 24.3% | 7.13 | 1.56 | market 57.7%, pilgrim-road 51.5%, mill 49.3% |
| 14. perimeter 24, d6, 4p, replacementTax 2 | 24 | 11.4 (98.5%) | 29.5% | 16.72 | 47.0 / 10.8 / 3.1 / 8.4 / 2.3 | 3.67 (2.5%) | 52.9% | 25.4% | 7.04 | 2.33 | market 54.4%, mill 49.3%, pilgrim-road 41.9% |
| 15. perimeter 24, d6, 4p, replacementTax 2 escalating | 24 | 11.1 (99.5%) | 23.0% | 19.66 | 47.1 / 10.7 / 3.0 / 8.5 / 2.3 | 3.57 (2.5%) | 53.1% | 24.0% | 4.82 | 2.27 | market 47.3%, mill 41.6%, pilgrim-road 39.7% |
| 16. perimeter 24, d6, 4p, vpPool 60, replacementTax 2 | 24 | 11.5 (100.0%) | 63.7% | 70.26 | 109.3 / 24.1 / 6.9 / 14.8 / 9.8 | 9.15 (2.7%) | 48.9% | 29.2% | 27.60 | 4.20 | market 52.8%, mill 46.4%, pilgrim-road 43.0% |
| 17. perimeter 24, d6, 4p, vpPool 60, replacementTax 2 escalating | 24 | 11.1 (100.0%) | 46.9% | 119.62 | 121.1 / 23.0 / 6.7 / 16.8 / 9.9 | 8.82 (2.5%) | 49.0% | 25.9% | 13.12 | 3.66 | market 28.2%, pilgrim-road 24.0%, mill 21.1% |

### Seat bias: four identical greedy bots, seats not rotated, 1000 games

Win rate by seat 1 / 2 / 3 / 4 (a fair game is 25% each).

| Cell | Seat 1 | Seat 2 | Seat 3 | Seat 4 |
| --- | ---: | ---: | ---: | ---: |
| 1. reference: sideLength 10 (40 slots), d6, 4p | 31.2 | 26.6 | 22.9 | 19.3 |
| 2. perimeter 24, d6, 4p | 37.6 | 22.0 | 22.2 | 18.2 |
| 3. perimeter 24, 2d6, 4p | 39.1 | 26.2 | 17.8 | 16.9 |
| 7. perimeter 24, 2d6, 4p, catchUp 1 | 31.6 | 23.2 | 22.8 | 22.4 |
| 8. perimeter 24, 2d6, 4p, catchUp 2 | 24.7 | 22.9 | 24.0 | 28.4 |

Sells observed in all cells: 5 (board-full round ignores sells, which carry no slot).

<!-- table:end -->

## What moved

Facts only, against cell 1 (the 40-slot reference) unless a cell says otherwise. Numbers
are from the tables above. "Standard" is greedy / scorer / aggressor / turtle, "shared"
greedy / scorer / landlord / builder, "lookahead" lookahead / scorer / landlord / builder;
the 2 and 3 player cells seat the bots listed in their row, so their win rates are not
comparable with cell 1's.

**1. reference (40 slots).** Standard: Scorer 34.8%, Turtle 28.5%, Greedy 27.5%, Aggressor
9.2%; winner VP 5.9, total 11.5, VP at 5 / 10 / 15 0.4 / 1.2 / 2.9; 22.8% of players reach 8
income in a round. Fires per game 32.0 civic, 7.2 private, 2.2 toll, 6.1 public, 0.1 landmark;
2.35 tolls per game (2.4% of coins gained); corner share 50.1%; interaction index 22.6%. The
board never fills in 15 rounds (0% of games); 1.7% of buys are replacements or buyouts; 0.39
buyouts and 0.09 landmarks per game. Seat 1 wins 31.5%, seat 4 19.8%. Shared: Scorer 37.2%,
Greedy 29.2%, landlord 16.8%, builder 16.8%, 2.07 buyouts and 1.16 landmarks per game, 9.6%
replacements. Lookahead: Lookahead 42.5%, 5.11 buyouts, 23.6% replacements. Seat bias
(identical Greedy): 31.2 / 26.6 / 22.9 / 19.3%.

**2. perimeter 24, d6, 4p (6 per side).** Winner VP 11.2 (5.9), total 24.4 (11.5), VP at 5 /
10 / 15 0.7 / 2.9 / 6.1. 47.7% of players reach 8 income (22.8%), at round 8.9. Fires per game
57.2 civic, 12.3 private, 4.1 toll, 7.1 public, 0.7 landmark; 4.40 tolls per game (3.2% of
coins); corner share 50.4% (50.1%); interaction index 34.2% (22.6%). The board is full in
99.7% of games, at round 10.0; 48.3% of buys are replacements (1.7%), 16.59 buyouts per game
(0.39), 0.81 landmarks (0.09). Standard win rates: Scorer 34.3%, Turtle 30.7%, Greedy 26.2%,
Aggressor 8.8%. Seat 1 wins 34.8%, seat 4 19.2%. Shared: Scorer 32.8%, landlord 28.7%, Greedy
27.8%, builder 10.7%; 11.74 buyouts, 2.60 landmarks, board full at round 11.7 in 95.8% of
games, seat 1 34.8% and seat 4 16.8%. Lookahead: Lookahead 41.0%, landlord 21.0%, builder
12.0%; board full at round 13.1 in 63.0% of games. Seat bias: 37.6 / 22.0 / 22.2 / 18.2%.

**3. perimeter 24, 2d6, 4p.** Winner VP 22.9, total 60.1, VP at 5 / 10 / 15 2.1 / 7.8 / 15.0; 85.3%
of players reach 8 income, at round 5.8. Fires per game 110.7 civic, 19.9 private, 4.0 toll, 4.7
public, 8.0 landmark; 4.96 tolls (2.0% of coins). Board full at round 6.4 in 100% of games;
62.1% replacements, 27.10 buyouts and 4.46 landmarks per game. Standard: Turtle 35.5%, Scorer
30.2%, Greedy 27.0%, Aggressor 7.3%; seat 1 33.7%, seat 4 19.5%; decided-by 66.7%. Shared:
landlord 30.7%, Greedy 28.3%, Scorer 23.8%, builder 17.2%; 8.00 landmarks per game; seat 1
36.7%, seat 4 20.0%. Lookahead: 33.5 / 27.5 / 26.5 / 12.5%. Seat bias: 39.1 / 26.2 / 17.8 /
16.9% (the 40-slot 2d6 cell of the last experiment: 41.6 / 24.1 / 18.1 / 16.2%).

**4. perimeter 24, d6, 2p (12 per side).** Standard (greedy, scorer): 43.2 / 56.8%; winner VP
5.2, total 7.3, VP at 5 / 10 / 15 0.3 / 1.5 / 3.6; 25.9% of players reach 8 income. Fires per
game 16.2 civic, 5.0 private, 0.0 toll, 3.7 public; 0.05 tolls per game; interaction index
14.9%; the board is full in 0.2% of games; replacements 0.6%, buyouts 0.06 per game. Seat 1
wins 55.2%. Shared (landlord, builder): 48.3 / 51.7%, 0.80 tolls, 0.42 buyouts, 4.5%
replacements, seat 1 52.3%, board never full. Lookahead (lookahead, builder): 70.5 / 29.5%, seat
1 49.5%, 1.99 buyouts, 20.7% replacements.

**5. perimeter 24, d6, 3p (8 per side).** Standard (greedy, scorer, aggressor): 42.0 / 45.0 /
13.0%; winner VP 8.0, total 13.9, VP at 5 / 10 / 15 0.5 / 2.0 / 4.6; 40.8% reach 8 income.
Interaction index 26.2%, 2.50 tolls per game, 3.91 buyouts, 18.2% replacements; the board is
full in 59.3% of games (round 13.5). Seat 1 wins 42.5%, seat 3 24.0%. Shared (scorer,
landlord, builder): 43.8 / 31.0 / 25.2%, seat 1 40.7%, seat 3 25.5%. Lookahead (lookahead,
landlord, builder): 57.5 / 26.0 / 16.5%, seat 1 34.5%, seat 3 32.0%; board never full.

**6. 24, d6, 4p, catchUp 1.** Against cell 2: seat 1 wins 25.0% (34.8%) and seat 4 23.3%
(19.2%); shared lineup seat 1 29.3% (34.8%), seat 4 21.5% (16.8%); lookahead 24.0 / 21.0%
(32.5 / 20.0%). Winner VP 11.8 (11.2), total 26.8 (24.4); 51.2% reach 8 income (47.7%). Standard
win rates: Scorer 37.7%, Turtle 29.8%, Greedy 25.2%, Aggressor 7.3%. Shared: builder 11.7%
(10.7%), landlord 29.0% (28.7%). Buyouts 18.48 per game (16.59), landmarks 1.06 (0.81).
Board full at round 9.3 (10.0). Lookahead 48.5% (41.0%).

**7. 24, 2d6, 4p, catchUp 1.** Against cell 3: seat 1 wins 27.7% (33.7%), seat 4 24.8% (19.5%);
shared lineup 33.3 / 20.8% (36.7 / 20.0%); lookahead 26.0 / 17.5% (28.0 / 24.0%). Seat bias:
31.6 / 23.2 / 22.8 / 22.4% (39.1 / 26.2 / 17.8 / 16.9%). Winner VP 23.7 (22.9), total 64.5 (60.1).
Standard: Turtle 31.8%, Scorer 31.0%, Greedy 28.7%, Aggressor 8.5%. Shared: Greedy 31.8%,
landlord 28.7%, Scorer 20.2%, builder 19.3% (17.2%). Buyouts 27.38 per game, landmarks 4.72.

**8. 24, 2d6, 4p, catchUp 2.** Against cell 3: seat 1 wins 22.0% (33.7%), seat 4 26.2% (19.5%);
shared lineup 31.7 / 25.2%; lookahead 27.5 / 22.5%. Seat bias: 24.7 / 22.9 / 24.0 / 28.4%.
Winner VP 24.4, total 67.5. Standard: Turtle 37.7%, Scorer 32.7%, Greedy 25.3%, Aggressor 4.3%.
Shared: Greedy 29.2%, Scorer 26.2%, landlord 25.2%, builder 19.5%. Buyouts 27.60 per game,
landmarks 4.99.

**9. 24, d6, 4p, tollOnPass 0.5.** Against cell 2: toll fires 8.9 per game (4.1); 4.49 landing
tolls and 4.97 pass tolls per game (4.40 tolls); toll share of coins 5.7% (3.2%); interaction
index 34.6% (34.2%). Winner VP 11.1 (11.2). Standard: Scorer 33.3%, Turtle 29.7%, Greedy
26.8%, Aggressor 10.2% (8.8%). Shared: landlord 35.7% (28.7%), Scorer 28.7% (32.8%), Greedy
26.0% (27.8%), builder 9.7% (10.7%); toll share 5.3%, 3.97 landing plus 4.64 pass tolls.
Lookahead: Lookahead 40.0%, landlord 22.5% (21.0%). Seat 1 34.3% (34.8%).

**10. 24, d6, 4p, vpPool 60, premium 0.** Standard: 27.5 rounds (p90 33, 1 game at the stop);
Turtle 42.5%, Greedy 33.7%, Scorer 19.0%, Aggressor 4.8%; winner VP 24.0. Replacements 73.7%
of buys, 49.13 buyouts per game, 2.46 landmarks, 11.47 tolls (4.7% of coins), interaction
index 40.3%. Shared: 27.9 rounds, landlord 35.0%, Greedy 33.2%, Scorer 17.7%, builder 14.2%;
37.56 buyouts and 5.75 landmarks per game, replacements 70.7%. Lookahead: 29.0 rounds, Lookahead
40.5%, landlord 29.0%; 42.88 buyouts, 71.2% replacements. (The 40-slot vpPool 60 cell of the
last experiment: 33.19 buyouts per game in the standard lineup, 25.05 in the shared lineup.)

**11. 24, d6, 4p, vpPool 60, premium 2.** Against cell 10: buyouts 22.98 per game (49.13)
standard, 19.22 (37.56) shared, 20.51 (42.88) lookahead; replacements 70.0% (73.7%), 66.7%
(70.7%), 64.1% (71.2%). Rounds 28.9 (27.5), 28.5 (27.9), 28.2 (29.0). Standard: Turtle 41.7%,
Greedy 31.3%, Scorer 17.8%, Aggressor 9.2%. Shared: Greedy 40.3% (33.2%), landlord 30.8%
(35.0%), Scorer 16.7%, builder 12.2%. Lookahead 40.0% (40.5%). Interaction index 33.1% (40.3%)
standard. Decided-by 67.9% (72.0%).

**12. 24, d6, 4p, landmarkRace 3, ranked by landmarks.** Standard: 320 of 600 games hit the
50-round stop (mean 42.0 rounds), decided-by 98.0%; Turtle 40.8%, Greedy 32.7%, Scorer 18.3%,
Aggressor 8.2%; 3.94 landmarks and 83.49 buyouts per game, 82.8% replacements. Shared:
builder 92.3%, Greedy 5.8%, Scorer 1.8%, landlord 0.0%; mean 20.5 rounds (p90 30), decided-by
100%; winner VP 7.6, total VP 39.7; 4.15 landmarks and 22.74 buyouts per game. Lookahead:
builder 98.5%, Lookahead 1.0%; mean 21.6 rounds, 3 games at the stop. (Last experiment, ranked
by VP, 40 slots: builder 3.5% in the shared lineup.)

**13. perimeter 32 (8 per side), d6, 4p.** Against cell 1 (cell 2): winner VP 8.0 (5.9; 11.2), total
16.8 (11.5; 24.4), VP at 5 / 10 / 15 0.5 / 1.8 / 4.2; 32.4% of players reach 8 income (22.8%;
47.7%). Interaction index 26.8%. Board full in 37.3% of standard games (round 14.2), 3.0% of
shared games, 0% of lookahead games; replacements 12.6% (1.7%; 48.3%); buyouts 3.48 (0.39;
16.59), landmarks 0.25. Standard: Scorer 32.7%, Turtle 29.0%, Greedy 28.3%, Aggressor 10.0%;
seat 1 29.7%, seat 4 19.5%. Shared: Greedy 34.5%, Scorer 31.8%, landlord 20.0%, builder 13.7%,
seat 1 29.8%, seat 4 20.5%. Lookahead 40.0%, seat 1 29.0%, seat 4 21.5%.

**14. 24, d6, 4p, replacementTax 2.** Against cell 2: tax paid 26.52 coins per game (standard),
20.13 (shared), 16.72 (lookahead). Replacements 39.9% of buys (48.3%), 33.5% (41.3%), 29.5%
(42.2%); buyouts 11.78 (16.59), 8.11 (11.74), 7.04 (13.23). Winner VP 10.9 (11.2), total 23.0
(24.4); decided-by 66.7% (73.3%). Market take rate 86.3% (93.6%). Standard: Scorer 37.3%
(34.3%), Turtle 31.3%, Greedy 23.5%, Aggressor 7.8%. Shared: Scorer 38.8% (32.8%), landlord
23.7% (28.7%), Greedy 25.2%, builder 12.3%. Lookahead 41.5% (41.0%). Seat 1 33.5% (34.8%).

**15. 24, d6, 4p, replacementTax 2 escalating.** Against cell 2: tax paid 35.52 coins per game
(standard), 26.54 (shared), 19.66 (lookahead). Replacements 32.0% (48.3%), 27.1% (41.3%),
23.0% (42.2%); buyouts 8.53 (16.59), 5.83 (11.74), 4.82 (13.23). Winner VP 10.5 (11.2), total
21.9 (24.4); decided-by 60.0% (73.3%). Market take rate 78.1% (93.6%). Standard: Scorer
41.2% (34.3%), Turtle 26.7%, Greedy 22.5%, Aggressor 9.7%. Shared: Scorer 39.8%, landlord
22.3%, Greedy 25.8%, builder 12.0%. Lookahead: Lookahead 36.5%, Scorer 35.0%.

**16. vpPool 60, replacementTax 2.** Against cell 10: tax paid 90.70 coins per game (standard),
76.72 (shared), 70.26 (lookahead). Buyouts 39.76 (49.13), 29.34 (37.56), 27.60 (42.88);
replacements 69.4% (73.7%), 65.7% (70.7%), 63.7% (71.2%). Rounds 29.7 (27.5), 29.1 (27.9),
29.4 (29.0). Standard: Turtle 41.8%, Greedy 31.7%, Scorer 18.2%, Aggressor 8.3%. Shared:
Greedy 41.0%, landlord 29.5%, Scorer 15.7%, builder 13.8%. Lookahead: landlord 38.5%, Lookahead
25.0% (40.5%). Market take rate 80.8% standard (93.9%).

**17. vpPool 60, replacementTax 2 escalating.** Against cell 10: tax paid 163.45 coins per game
(standard), 153.84 (shared), 119.62 (lookahead). Buyouts 20.34 (49.13), 16.26 (37.56), 13.12
(42.88); replacements 53.1% (73.7%), 51.4% (70.7%), 46.9% (71.2%). Rounds 33.4 (p90 44, 16
games at the stop; 27.5), 31.3 (2 at the stop; 27.9), 30.9 (2 at the stop; 29.0). Market take
rate 44.5% standard, 40.3% shared, 28.2% lookahead (93.9%, 78.2%, 68.0%). Standard: Turtle
38.5%, Greedy 33.5%, Scorer 25.3%, Aggressor 2.7%. Shared: Greedy 37.7%, Scorer 25.3%, landlord
20.3%, builder 16.7%. Lookahead: Scorer 32.0%, landlord 26.5%, Lookahead 25.5%, builder 16.0%.
Decided-by 58.1% standard (72.0%).

**Across cells.** Interaction index is 33.8 to 36.1% in cells 2, 3 and 6 to 9 (22.6% at 40 slots; 29.6 and
31.4% with a replacement tax). Board-full round is 6.1 to 6.4 with 2d6 and 9.3 to 10.0 with d6 at 24
slots and 4 players (standard lineup). Seat 1's win rate in the standard lineup is 33.7 to
34.8% in cells 2, 3 and 9 and 22.0 to 27.7% with catch-up coins; seat 4's is 19.2 to 19.7%
without them and 23.3 to 26.2% with them. Corner share is 47.8 to 53.2% in every 15-round
standard cell and 46.5 to 48.6% in the vpPool and landmarkRace cells. Aggressor wins 2.7 to 13.0% in every
cell of the standard lineup.
