# Commander Forge 6.13.0 — Multiplayer Reconnect

## Added
- Guests receive a private per-room reconnect token stored in their own browser.
- Rejoining the same invite code from the same browser automatically reclaims the original player seat.
- Brief guest connection drops automatically retry instead of leaving the player permanently disconnected.
- Disconnected seats are reserved instead of immediately being reassigned.
- Lobby cards show **Disconnected · seat reserved** and **↻ RECONNECT**.
- Before the game starts, the host can use **Free seat** when a player has actually left.
- Pregame reservations expire after 15 minutes if the player never returns.
- Once a game has started, a disconnected seat stays reserved for that game so another browser cannot silently become that player.
- Duplicate attempts to use an already-connected player's reconnect token are rejected.

## Preserved
- A disconnected player's public draft/ready state is no longer deleted on an unexpected disconnect.
- During an active game the host keeps the authoritative public table state.
- The reconnecting browser keeps its own private hand/library from its local saved Commander Forge state; those identities are never sent to the host.

## Compatibility
Multiplayer protocol is now `6.13.0-mp7`. All players in an online room should refresh to 6.13.0 before joining.

## Important limitation
This release restores **guest/player seats while the original host room still exists**. If the host browser itself closes or loses the room entirely, host-room recovery/migration is a separate feature because the current PeerJS architecture uses the host as the authority.
