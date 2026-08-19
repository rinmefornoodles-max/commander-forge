# Commander Forge 6.0 Alpha 6.9 — Authoritative Turn Sync

## Why turns could desync
Before Alpha 6.9, a guest advanced the turn locally first and then sent the host a full-state proposal.

With 3–6 players, the host's multiplayer revision can change between the guest reading the table and sending that proposal. If that happened, the host correctly rejected the stale whole-state proposal. That protected the game from overwriting newer data, but it also meant the phase/turn change could appear only on the active player's screen until the authoritative state caught up.

This is much more likely with several connected players than in old 1v1 multiplayer.

## New turn architecture
Turn and phase advancement is now host-authoritative.

- A guest pressing **Next** sends a tiny `game-action: next-phase` request to the host.
- The guest does NOT locally advance the phase first.
- The host verifies that the requester is the active player.
- The host executes `nextPhase()` once.
- The host immediately broadcasts the authoritative state to every player.
- The host also broadcasts a lightweight turn-sync packet containing:
  - turn number
  - current phase
  - active player
  - priority player
  - full turn order
- While the request is in flight the guest sees **Syncing…** instead of being able to double-click Next.

## Turn heartbeat
The host also sends a small turn heartbeat about every 1.2 seconds during an online game. This keeps every header/turn tracker aligned even if another unrelated state proposal is rejected because its revision was stale.

## Revision conflicts
When a normal full-state proposal conflicts with a newer host revision, the sender now receives both:
- the authoritative current state
- the authoritative current turn information

So a stale board proposal cannot leave that client showing an old active player/phase.

All Alpha 6.8 2–6 player approvals, ready-up, D20, hidden zones, multi-opponent targeting, and turn-order UI remain included.
