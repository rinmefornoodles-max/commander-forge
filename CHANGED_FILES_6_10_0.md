# Commander Forge 6.10.0 — Host-Authoritative Multiplayer State Rewrite

## Why cards were reverting or disappearing
The old multiplayer system let a guest change their local table and then send an entire replacement game state to the host.

With 3–6 players, another update could reach the host first. The host would reject the stale whole-table snapshot, then send its current state back. Because that current state did not contain the guest's newest placement, the card appeared to jump back or disappear.

## What changed
Commander Forge no longer accepts guest full-state proposals.

Normal guest-side gameplay mutations now become small **state-delta actions** containing only what changed.

That includes the public/network-visible parts of:
- card movement
- tap / untap
- counters and card state
- life / poison / mana / commander damage
- tokens
- graveyard / exile
- stack objects
- triggers and pending effects
- keywords / notes
- tutor, sacrifice, discard, Ninjutsu, Mutate, and similar actions

The host merges those changes into the latest authoritative table and broadcasts the result to everyone.

## Concurrent actions
Different players can now make unrelated actions without replacing one another's board.

- Public card arrays merge using stable card IDs.
- Different fields on the same card merge independently.
- Numeric changes use deltas, so simultaneous life/counter changes do not simply last-write over one another.
- Host revision numbers are now acknowledgements/order markers, not a reason to discard a guest's entire table state.

## Pending local actions
For responsiveness, a guest can still see their own action immediately.

Forge records that action as pending before another network event can arrive. If an unrelated authoritative update arrives first, Forge overlays the still-pending local action until the host acknowledges it.

The multiplayer status pill can show **Syncing N** while actions are waiting for host confirmation.

## Hidden information
Hands and libraries stay private.

The multiplayer layer sends:
- public cards normally
- only counts for private hand/library zones

A player's actual hand/library identities remain on that player's device.

## Dedicated systems retained
These already use dedicated multiplayer messages and do not use the removed full-state proposal path:
- lobby / Ready Up
- D20 starting-player roll
- mulligans
- host-authoritative turn / phase advancement
- table-wide Undo / Test Override approval
- public reveal notifications

The host still sends authoritative snapshots outward to all players for recovery and resync. What was removed is guests sending whole replacement tables to the host.
