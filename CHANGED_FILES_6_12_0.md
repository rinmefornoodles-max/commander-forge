# Commander Forge 6.12.0 — Static Rules Engine / Void Winnower

## Fixed: Void Winnower

Commander Forge now compiles Void Winnower's Oracle text into two generic battlefield rules:

### CAST_PROHIBITION
`Your opponents can't cast spells with even mana values.`

### BLOCK_PROHIBITION
`Your opponents can't block with creatures with even mana values.`

There is no `if card.name === "Void Winnower"` implementation.

The rule is derived from Oracle wording.

## Casting

Whenever any player tries to cast a spell, Forge now scans battlefield permanents for compiled casting restrictions.

With an opponent's Void Winnower on the battlefield:
- mana value 0 → cannot cast
- mana value 2 → cannot cast
- mana value 4 → cannot cast
- mana value 6 → cannot cast
- odd mana values remain castable unless another rule prohibits them

Zero is treated as even.

For X spells, Forge includes the chosen X in the spell's mana value while checking the cast.

The same legality function is used by:
- normal human casting
- drag-to-stack
- commander casting
- Autoplay Bot action generation
- tactical simulations

So the bot should not even consider a prohibited even-mana-value spell to be a legal play.

## Blocking

Block declarations now check:
1. global/static battlefield restrictions
2. ordinary blocking rules such as flying/reach, shadow, protection, etc.

With an opponent's Void Winnower:
- a creature with even mana value cannot be assigned as a blocker
- odd mana value creatures can still block if they satisfy ordinary blocking rules

The Autoplay Bot's defensive simulation uses the same static restriction, so it should not plan an illegal even-mana-value blocker.

## Generic static restriction engine

Oracle Compiler V7.2 adds reusable descriptors:
- CAST_PROHIBITION
- BLOCK_PROHIBITION
- CAST_LIMIT

Predicates currently include:
- even / odd mana value
- mana-value comparisons (>, >=, <, <=, exact)
- source-zone restrictions
- turn/timing restrictions

This is the foundation for moving more global/static cards away from hand-written regex scattered through different subsystems.

## Additional migrations

The same static descriptor layer also recognizes common patterns such as:
- players can't cast spells from graveyards
- your opponents can't cast spells during your turn
- each player / players can't cast more than one spell each turn

Older coverage is retained as fallback where necessary.

## Important limitation

This release does NOT claim literal support for every printed Magic card.

The sustainable model is:
Oracle text → compiled generic rule descriptors → one deterministic rules engine.

Each new generic descriptor fixes whole card families. Very unusual layer/copy/replacement/linked-ability cards will still require additional rules primitives or, ultimately, a mature comprehensive-rules engine backend.
