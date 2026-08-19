# Commander Forge 6.0 Alpha 6.7

## Fixed: `createPlayer is not defined` when starting multiplayer

### Cause
The state module already defined and exported `createPlayer()`, but the main multiplayer module did not import it.

The error only appeared when the host pressed Start because 3–6 player online setup dynamically creates the additional player state objects at that point.

### Fix
- `createPlayer` is now imported from the state module into the main game/multiplayer module.
- 2–6 player online game creation can construct every seat before the D20 roll begins.
- All Alpha 6.6 lobby-state isolation, PeerJS hardening, Ready-up, D20, Solo D20, and bot fixes remain included.
