# Engine 6 architecture

Browser UI
  -> Commander Forge Engine 6 client
  -> Web Worker
  -> deterministic Engine 6 state/rules core
  -> structured card definitions
  -> conservative Oracle compiler

The current 5.x table is mirrored into the worker during the migration period. The target architecture is for Engine 6 to become the authoritative state and expose legal actions to both the human UI and the future autoplay opponent.

## Core rule flow

1. A legal action is requested.
2. Costs are validated and paid.
3. Spell/ability is placed on the stack when appropriate.
4. Priority rotates.
5. All players pass.
6. Top stack object resolves.
7. Events are emitted.
8. Triggered abilities are queued in AP/NAP order and placed on the stack.
9. State-based actions run.
10. Priority is granted again.

## Card model

Cards are described with structured reusable abilities/effects rather than allowing arbitrary Oracle text to directly mutate game state. The Oracle compiler only emits structures for patterns it recognizes confidently; anything else remains explicitly unsupported until a mechanic/card mapper is added.

## XMage relationship

XMage is used as a reference for mature Magic engine concepts and complex card behavior. Engine 6 is written for the browser and does not run the XMage Java server/client. See `XMAGE_REFERENCE_NOTICE.txt`.
