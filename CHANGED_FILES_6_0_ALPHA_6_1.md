# Commander Forge 6.0 Alpha 6.1

Fixed the Alpha 6 startup crash:

`ReferenceError: Cannot access 'd20Runtime' before initialization`

Cause:
The first app render referenced the D20 runtime before its `const` initialization had executed.

Fix:
The D20 runtime is now initialized before the startup restore/subscription/first-render sequence.

All Alpha 6 multiplayer, ready-up, D20, 2–6 player, and first-player features remain included.
