# Commander Forge 6.0 Alpha 6.8 — Multiplayer Core Overhaul

## Turn tracking for 2–6 players
- The actual game turn order now has a visible turn-order strip showing every seat.
- Active player, local player, eliminated players, and disconnected players are visibly marked.
- Turn advancement follows `state.turnOrder` instead of assuming Player 1 / Player 2.
- Eliminated players are skipped.
- If the active player disconnects, the host can advance phases for that disconnected seat so the table does not hard-lock.
- Winner detection now waits until exactly one player remains instead of incorrectly choosing the first “other player.”

## Table-wide Undo and Test Override approvals
The old two-player approval logic has been replaced.

For Undo or Test Override:
1. The requester sends one table approval request.
2. The host coordinates it.
3. Every other **connected, active** player receives the themed approval popup.
4. The request shows live approval progress and the players still being waited on.
5. One denial ends the request.
6. Only unanimous approval applies the Undo/Test Override.
7. If an approver disconnects, that disconnected player is removed from the required voter list so the game is not permanently stuck.
8. If the requester disconnects, the request is cancelled for everyone.

The requester can still cancel their own request.

## Multiplayer card-effect decisions
- Private library effects remain resolvable only by the player whose library is involved.
- Sacrifice/discard choices are resolved on the affected player's client.
- “Target opponent sacrifices/discards” now lets the effect controller choose among multiple opponents instead of silently picking Player 2/the first opponent.
- Opponent-graveyard effects inspect all opponents' graveyards rather than only one opponent.
- “Each opponent” cases that are not yet safely automatable remain manual instead of silently applying to only one opponent.

## Other multiplayer protections
- Hidden-zone count updates guard missing/disconnected seats.
- The online Test Override help text now correctly says approval is table-wide.
- Existing 2–6 player lobby, Ready Up, D20 start, seat assignment, hidden information, attack-target selection, and per-player board layout remain included.
