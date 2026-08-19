# Commander Forge 6.0 Alpha 6.6

## Fixed: guest multiplayer `reading 'zones'` crash

The exact crash was caused by mixing two different states:

- a previous 2-player Solo table could still exist behind the Online Multiplayer setup modal
- the guest could already be assigned Player 3–6 in the new lobby

The background table then tried to render the newly assigned multiplayer seat against the old two-player Solo state.

A connected lobby could also start the multiplayer state-sync subscriber before an online game had actually been created.

### Alpha 6.6 fixes
- Online lobby traffic is isolated from any previous Solo game.
- Gameplay state synchronization starts only after the online `start-game` handshake creates an `onlineGameId`.
- Guests ignore early gameplay state packets before that handshake.
- Network state serialization and merging normalize all expected zones before reading them.
- Background table rendering safely handles a multiplayer seat that does not yet exist in the old table state.
- Both compact and full player mats guard against a temporarily missing seat.
- Entering Online Multiplayer clears stale table-only UI without deleting the saved Solo game.
