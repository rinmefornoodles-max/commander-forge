# Commander Forge 6.0 Alpha 6

## 2–6 player online Commander rooms
- Host chooses a table size from 2 through 6 before creating the room.
- One invite code is shared with every guest.
- Guests are assigned the next open Player 2–Player 6 seat automatically.
- The host acts as the room relay so public table state can synchronize across all seats.
- Hands and libraries remain private to their owners.
- Your battlefield stays full-size while the other players use compact responsive battlefield pods.
- Each attacker can choose which opponent it is attacking.

## Ready-up lobby
- Every player loads and validates their own deck.
- Every player has Ready / Unready.
- Changing a deck removes that player's ready status.
- The host cannot start until every required seat is connected and every player is ready.
- The lobby shows connected, deck-loaded, and ready status for every seat.

## Interactive D20 starting-player roll
- After the host starts, a D20 arena appears before mulligans.
- Every player makes their own roll.
- Click/touch and hold the die, drag it, then release to throw.
- The die has momentum, friction, angular spin, edge collision, and bounce.
- Throw velocity is capped at 950 px/s so extreme mouse movement cannot launch it unrealistically.
- Roll values use browser cryptographic randomness when available.
- Highest roll becomes the starting player automatically.
- If the highest result ties, only the tied players reroll.
- Turn order rotates around the table from the winning player.

## Opening draw
- In 1v1, the starting player skips the first draw.
- With 3 or more players, the starting player draws during the first draw step.

## Multiplayer UI cleanup
- Opening-hand privacy/status supports all remote players.
- Table Tools shows only the local player's Concede button in online multiplayer.
- The mulligan screen identifies the D20 winner and whether the starting player draws.
- Attack/block target checks respect the chosen defending player.
