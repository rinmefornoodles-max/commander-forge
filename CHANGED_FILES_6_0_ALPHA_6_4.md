# Commander Forge 6.0 Alpha 6.4

## Guest could not connect to peer — hotfix

Fixed the case where a guest sees:
`Could not connect to peer commander-forge-...`

That error happens before seat assignment: PeerJS could not reach the host room on the first connection attempt.

### What changed
- A missed first PeerJS connection is no longer treated as a permanent room failure.
- Guests automatically retry connecting to the host room with a short capped backoff.
- Both PeerJS peer-level `peer-unavailable` errors and DataConnection-level connection errors are retryable.
- Once the connection opens, the existing seat-request handshake starts automatically.
- Successful seat assignment cancels both connection retries and seat-assignment retries.
- The fallback button changes to **Retry host connection now** when the actual host connection is not open.
- The waiting panel now distinguishes:
  - still connecting to the host room
  - connected and waiting for seat assignment

All Alpha 6.3 features remain included.
