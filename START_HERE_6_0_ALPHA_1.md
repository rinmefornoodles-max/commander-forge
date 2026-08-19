# Commander Forge 6.0 Alpha 1 — Browser Rules Core

This is the first integrated build of the new browser-native Commander Forge rules engine.

## What changed

Commander Forge now starts a dedicated rules Web Worker in the browser. It requires no Java process, no rules-gateway URL, no API key, and no hosted backend.

The existing Commander Forge table remains the safe gameplay authority during Alpha 1. Every live table update is mirrored into Engine 6 while the new deterministic rules core is migrated into authoritative play action-by-action. This avoids breaking the current site while the replacement engine grows.

When a deck is loaded, Engine 6 also analyzes the card data already fetched by Commander Forge and compiles conservative structured definitions for common Oracle patterns. Unsupported Oracle clauses are preserved as unsupported instead of guessed.

## Implemented in the Engine 6 core

- normalized game state and zones
- real stack object model
- priority passing
- turn/step engine
- event bus
- triggered ability queue
- AP/NAP ordering foundation
- state-based actions
- commander damage loss
- commander tax accounting
- replacement-effect framework
- continuous-effect/layer framework
- targeting primitives and target-selection constraints
- effect primitives: draw, discard, mill, move, destroy, exile, sacrifice, damage, life, counters, tap/untap, tokens, control change, counter spell, return from graveyard, shuffle
- combat attackers/blockers and combat damage
- deathtouch, lifelink and vigilance hooks
- Mutate module, including command-zone commander tax and combined mutation abilities
- Ninjutsu module
- legal-action generation foundation
- undo snapshots
- Web Worker isolation so future rules/AI work does not freeze the UI
- conservative Oracle compiler for simple/common patterns
- automatic analysis of cards loaded into the existing table

## Important limitation

This is the foundation of the full engine, not a claim that every Magic card is already supported. Alpha 1 intentionally keeps the current 5.x table authoritative while Engine 6 runs beside it. The next releases can move normal casting, targeting, stack resolution, triggers, combat, and mechanics onto Engine 6 in controlled stages.

## How to install

Upload the changed files from this ZIP to the root of the Commander Forge GitHub repository. Keep the four `commander-forge-engine-*` / compiler files beside `index.html`.

After GitHub Pages deploys, hard refresh with Ctrl+Shift+R. Open Tools / Table tools. The Rules Engine section should say **Engine 6 ready** and show that the table is mirrored. The **Test Engine 6** button pings the background worker directly.

## Tests

The included Node tests cover:

- ETB trigger -> stack -> life-gain chain
- instant spell stack resolution
- commander tax tracking
- command-zone Mutate
- Nethroi-style total-power target validation
- mutation combined abilities
- Ninjutsu return/attacking behavior
- commander-damage loss
- Oracle compiler trigger/Ninjutsu/keyword recognition

See `ENGINE_6_TEST_RESULTS.txt`.
