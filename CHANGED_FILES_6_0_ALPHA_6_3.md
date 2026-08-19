# Commander Forge 6.0 Alpha 6.3

## Multiplayer seat-assignment hotfix

Fixed the bug where guests connected to the host but stayed permanently on:

`Waiting for the host to assign your seat…`

### Cause
PeerJS can occasionally have the DataConnection already open by the time Commander Forge attaches its `open` listener on the host side. Alpha 6.2 only sent the seat assignment from that listener, so if the event had already happened the guest could wait forever.

### Fixes
- Host now detects an already-open incoming connection and assigns the seat immediately.
- Guest also handles an already-open outbound connection.
- Guests send a `seat-request` handshake automatically until a seat is assigned.
- Host resends the seat assignment when it receives `hello` or `seat-request`.
- The retry timer stops as soon as the guest receives its Player 2–Player 6 seat.
- A **Request seat again** button is available as a manual fallback.
- Disconnect cleanup removes stale seat/peer mappings before another guest joins.

All 2–6 player, Ready-up, D20, Solo D20, and Autoplay Bot features remain included.
