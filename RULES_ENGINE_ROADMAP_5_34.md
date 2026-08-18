# Commander Forge Rules Engine Roadmap

## Goal

Move Commander Forge from a digital table with phrase-based helpers toward a deterministic rules engine that can execute most card text and preserve correct trigger interactions.

## Target architecture

1. **Scryfall card data** supplies Oracle text, types, keywords, costs, faces, color identity, and identifiers.
2. **Oracle compiler** converts text into a structured intermediate representation rather than card-name-specific code.
3. **Game event bus** emits normalized events such as spell cast, zone change, draw, life change, ETB, dies, attack, damage, counter added, control change, ability activation, and phase start.
4. **Trigger matcher** subscribes compiled triggered abilities to those events and creates separate trigger objects.
5. **Deterministic effect executor** performs reusable primitives such as select, move, draw, discard, sacrifice, destroy, exile, damage, life change, counters, tokens, copy, tap/untap, attach, control change, search, shuffle, and transform.
6. **State-based action pass** runs after atomic changes.
7. **Replacement/prevention layer** changes events before they happen.
8. **Continuous-effect/layer engine** calculates current characteristics and control without rewriting printed card data.
9. **Manual fallback** remains available whenever the compiler is not confident or an unusual rule is not implemented.

## Trigger-chain rule

Every successfully executed effect emits new normalized events. Those events are checked against all relevant triggered abilities. New triggers are queued individually and are never collapsed merely because they have the same text.

Example:

`Draw a card` -> DRAW event -> `Whenever you draw, gain 1 life` -> LIFE_GAIN event -> `Whenever you gain life, draw a card` -> new DRAW event.

The engine should not blindly auto-resolve an infinite chain. It should create the appropriate pending/stack objects and let mandatory-loop handling/rules logic determine what happens.

## Needed for broad card coverage

- Target grammar and target legality
- "up to", "any number", "another", "other", ownership/control filters
- X and variable quantities
- Modal spells/abilities and choices
- Additional/alternative costs and cost reductions
- Replacement/prevention effects
- Continuous effects and Magic's layer system
- Last known information
- Linked abilities and cards exiled "with" an object
- Delayed triggered abilities
- Copy effects
- Duration tracking (until end of turn, for as long as, next time)
- APNAP ordering for simultaneous triggers/choices
- State-based actions
- Combat damage event generation
- Commander-specific replacement/zone rules
- Mechanics that modify casting/resolution (flashback, adventure, cascade, discover, suspend, foretell, etc.)

## Optional AI compiler

AI can help translate previously unseen Oracle wording into a strict JSON/DSL representation, but it should **not** directly mutate the game state. The deterministic engine validates the generated structure and executes only supported primitives. Any API key must be kept behind a backend/serverless endpoint rather than shipped in public GitHub Pages JavaScript.
