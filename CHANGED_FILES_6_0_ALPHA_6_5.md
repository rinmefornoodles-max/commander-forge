# Commander Forge 6.0 Alpha 6.5

## Multiplayer connection hardening

Alpha 6.4 could still show a generic runtime toast during failed PeerJS connection attempts.

Alpha 6.5:
- Uses an explicit PeerJS Cloud HTTPS configuration.
- Explicitly includes STUN + PeerJS TURN fallback servers for NAT traversal.
- Uses JSON data-channel serialization for Commander Forge network messages.
- Wraps asynchronous Peer/DataConnection callbacks so a network callback cannot crash the setup UI.
- Guards against PeerJS returning no DataConnection.
- Recreates the guest PeerJS signaling client every few failed connection attempts instead of reusing a stale signaling session forever.
- Handles signaling disconnects separately from room/seat assignment.
- Shows the ACTUAL runtime/network error text in the toast instead of only "Something went wrong in that tool."
- Keeps the automatic seat-request handshake from Alpha 6.3/6.4.

All existing 2–6 player, Ready-up, D20, Solo D20, and Autoplay Bot features remain.
