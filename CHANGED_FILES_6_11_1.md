# Commander Forge 6.11.1 — Effect Routing + Bot Stack Safety

## Important: the screenshot was running 6.10.4
The reported `smartLibraryDestinationLabel is not defined` screenshot contains:
`commander-forge-6.10.4.js?v=6.10.4`

So that browser was not actually running the 6.11.0 bundle.

6.11.1 adds an explicit build-version identity and a visible cache-mismatch warning if the HTML and JavaScript release do not match.

## Library/tutor movement no longer uses the generic illegal-move path
When a pending effect says to search the library and move a legal card:
- dragging/clicking that matching library card delegates to the pending effect resolver
- it does not use Test Override
- it does not ask the ordinary zone-move legality engine to guess

This preserves ordered effects such as Vampiric Tutor:
1. choose card
2. remove/remember it
3. shuffle remaining library
4. put chosen card on top
5. lose 2 life automatically

## Graveyard movement uses the effect resolver too
For recognized effects such as:
- return target creature card from your graveyard to your hand
- return target card from your graveyard to the battlefield
- put a card from a graveyard into a legal destination

choosing/dragging the legal graveyard card resolves through the pending effect instead of being treated as an illegal ordinary move.

Common `to your hand` and `into your hand` wording are both recognized.

## Stack UX
After an instant/sorcery resolves:
- the spell goes to the graveyard automatically
- if the spell created a library search, the private search picker opens automatically
- recognized graveyard choices are surfaced immediately

The selected card inspector also gains:
`Use for [source effect] → [destination]`

for matching library/graveyard cards.

## Bot Maximum call stack fix
The Autoplay Bot now has:
- a loop reentrancy guard
- separate per-phase and per-turn action limits
- no more old `18 actions reached => safety-pass every remaining phase` behavior
- a deterministic legal fallback if tactical analysis throws `Maximum call stack size exceeded`

Instead of pausing the bot, Forge will make a simple safe legal play (land, combat, or phase advance) and continue.

## Scope protection
The smart library destination text in the renderer now has a local UI-safe fallback, so this particular helper cannot crash the table even if a module binding is unavailable.
