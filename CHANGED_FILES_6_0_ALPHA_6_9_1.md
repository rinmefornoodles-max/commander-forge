# Commander Forge 6.0 Alpha 6.9.1 — D20 Physics Stability Hotfix

## Fixed: D20 snaps back to center / cannot finish a throw

Alpha 6.9 added a host turn-sync heartbeat every ~1.2 seconds. That heartbeat was also running during the pregame D20 screen.

Guests processed the heartbeat with a forced UI render. That replaced the D20 canvas while somebody was holding or throwing the die. The replacement canvas then initialized the die in the middle again.

## Fixes
- Turn heartbeat pauses while the D20 roll is active.
- Turn heartbeat also pauses during mulligans/opening hands.
- Guests ignore stray turn-sync packets during those pregame screens.
- Each player/round gets a stable D20 session identity.
- If the D20 canvas is harmlessly replaced during the same roll session, position, velocity, spin, and throw timing are preserved.
- If a canvas refresh happens while actively dragging, the current motion becomes a throw instead of snapping to center.
- Preserved coordinates are clamped inside the arena.

The authoritative turn-sync system resumes normally once the D20 and mulligans are complete.
