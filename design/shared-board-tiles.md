# Shared-board tile set (design draft)

A first tile set for the shared-board mode: one loop that every player moves
on, 10 slots per side (one corner plus 9 tile slots), one side per player, so
20 slots for 2 players, 30 for 3, 40 for 4. Tiles are owned; the class of a
tile says whose token triggers it and who benefits (the Machi Koro idea).

Every number here is a first guess for the sim to correct. The fire-rate
arithmetic that shapes them: with a d6 on a 40-slot board a given slot is
passed by a given token about once every 11 turns. So at four players a civic
fires about 5 times in a 15-round game and a private about 1.3 times. Private
amounts are large for that reason, and the die size (d6 versus 2d6) is the
first knob the sim should tune. Costs assume 5 starting coins and corner
income of 2.

## Classes

| Class | Trigger | Who gains | Notes |
| --- | --- | --- | --- |
| Civic | any token passes or lands | owner | the steady engine; fires on every player's turn |
| Private | owner's own token passes or lands | owner | landing fires twice (`landBonus`); goes on your own path |
| Toll | another player's token lands | visitor pays owner | landing only, never passing; amounts small and capped |
| Public | any token lands | the visitor; the owner gains double on their own tile | the public good with an owner premium |
| Landmark | owner's own token passes or lands | owner | one of each per player, plus a permanent passive; the landmark race end mode counts them |

## Civic

| Tile | Cost | Copies | Effect | Why |
| --- | --- | --- | --- | --- |
| Market | 3 | 5 | +1 coin | baseline |
| Caravanserai | 6 | 3 | +2 coins | the bigger Market |
| Pilgrim Road | 5 | 3 | +1 VP, only when a visitor passes | rewards building on traffic, not at home |
| Bazaar | 5 | 3 | +1 coin per adjacent civic tile | clusters on the busy stretch |
| Lighthouse | 5 | 2 | +1 coin, +1 more if the passing player rolled 5+ | die texture |
| Mill | 4 | 3 | +1 coin, +1 more if adjacent to a corner | corners as geography |
| Amphitheatre | 9 | 2 | +1 VP | the expensive VP engine |
| Customs House | 7 | 2 | +1 coin per tile the passing player owns on this side | punishes land grabs on your side |

## Private

| Tile | Cost | Copies | Effect | Why |
| --- | --- | --- | --- | --- |
| Mine | 4 | 4 | +4 coins | baseline |
| Monument | 6 | 3 | +2 VP | baseline VP |
| Workshop | 5 | 3 | +1 coin per civic tile you own | ties the two engines together |
| Stables | 4 | 2 | move 2 more | tempo; chains through your own stretch |
| Treasury | 7 | 2 | +1 coin per 3 coins held | rewards saving for a landmark |
| Chapel | 5 | 3 | +1 VP per adjacent private tile | the home-stretch cluster |
| Vineyard | 6 | 2 | +1 VP per corner passed this game, max 4 | ripens over the game |
| Watchtower | 5 | 2 | +2 coins, and your next toll landing is free | defence without a defence class |

## Toll

| Tile | Cost | Copies | Effect | Why |
| --- | --- | --- | --- | --- |
| Tollbooth | 3 | 4 | visitor pays 1 coin | baseline |
| Bridge | 6 | 2 | visitor pays 2 coins | the bigger toll |
| Inn | 5 | 3 | visitor pays 2 coins and gains 1 VP | a fair toll; both sides gain |
| Ferry | 5 | 2 | visitor pays 1 coin and jumps to the next corner | a paid shortcut |
| Guard Post | 6 | 2 | visitor pays 1 coin per toll you own, max 3 | the Monopoly set bonus |
| Tithe | 7 | 1 | visitor pays 1 VP | the one VP transfer; rare |
| Bandit Camp | 4 | 2 | visitor pays 2 coins, or moves back 3 if they cannot | never bankrupts, still bites |
| Moneylender | 6 | 2 | visitor pays 1 coin per 5 coins held, max 3 | a leader tax |

## Public

| Tile | Cost | Copies | Effect | Why |
| --- | --- | --- | --- | --- |
| Shrine | 3 | 5 | +1 VP | baseline |
| Well | 3 | 4 | +2 coins | baseline income |
| Fairground | 6 | 3 | +1 VP and +1 coin | the hybrid |
| Springboard | 4 | 2 | move 3 more; owner gains 1 coin when anyone uses it | tempo with an owner echo |
| Oracle | 6 | 2 | roll again | tempo |
| Library | 7 | 2 | +1 VP per adjacent public tile | the public cluster |
| Harbour | 6 | 2 | jump to the next corner; owner gains 2 coins when anyone uses it | a shortcut that pays the builder |
| Festival | 8 | 1 | everyone gains 1 coin, the visitor gains 2 | the fully public good |

## Landmark

One of each per player. Fire on the owner's own pass or landing. Each has a
permanent passive. The `landmarkRace` end mode ends the game when a player
owns N landmarks (3 is the first guess).

| Tile | Cost | On own pass | Passive |
| --- | --- | --- | --- |
| Cathedral | 12 | +3 VP | none |
| Mint | 10 | +1 coin per civic you own | your civics pay +1 |
| City Walls | 10 | +1 VP | your tiles cannot be replaced |
| Harbour Master | 10 | +2 coins | tolls cost you nothing |
| Observatory | 11 | +2 coins | you roll a d8 |
| Guildhall | 10 | +1 VP | shop tiles cost you 1 less |
| Archive | 12 | +1 VP | at game end, +1 VP per 2 tiles you own |
| Colosseum | 14 | +2 VP | +2 VP whenever any visitor lands here |

## Rules the classes assume

- Corners: each player's Start is a corner. Passing any corner pays corner
  income; passing your own corner pays double. This replaces lap income.
- Replacement: you may build over any tile. Over your own, as today. Over
  another player's, pay the tile's cost and the displaced owner gets half
  back (a buyout), unless they own City Walls. Whether a player's own side is
  protected is an open choice.
- Tokens may share a slot; nothing happens.
- Tolls fire on landing only. Everything else fires on pass and on landing,
  with landing counting twice for privates.
- The old attack and defence classes do not exist in this mode.

## New engine primitives needed

| Primitive | Used by |
| --- | --- |
| Triggers `onAnyPass`, `onOwnPass`, `onVisitorLand`, `onAnyLand` | all classes |
| A `corner` concept on the board; `adjacentToCorner` condition; `cornersPassed` amount | Mill, Ferry, Harbour, Vineyard, corner income |
| Amount `ownedWithClass`, `visitorOwnedOnSide`, `coinsHeld / n` | Workshop, Mint, Customs House, Treasury, Moneylender |
| Condition on the passing player's roll (`dieTotal` already exists) | Lighthouse |
| Effect `payOwner` with a cap, and `orElse` fallback | all tolls, Bandit Camp |
| Effect `teleport` to `nextCorner` | Ferry, Harbour |
| Flag `tollFree` consumed on the next toll | Watchtower, Harbour Master |
| Landmark passives: `noReplace`, `civicBonus`, `dieSides`, `shopDiscount`, `endGameVpPerTiles`, `visitorLandVp` | landmarks |
| End mode `landmarkRace` | landmarks |

## Open questions for the sim

- Die size: d6 gives privates 1 to 2 fires per game; 2d6 gives 2 to 3 and
  doubles civic traffic. Which makes the arc?
- Corner income amount versus Market: the corner must not be the best income.
- Toll cap: total toll paid per game as a share of income, and the band that
  reads as tax rather than mugging (the interaction index).
- Replacement price: half refund, or full, or cost plus one.
- Landmark race length: 3 landmarks at 10 to 14 coins each is roughly 35
  coins of saving; is that reachable by round 15 at 4 players?
