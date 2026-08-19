# Commander Forge 6.10.1 — Autoplay Stack / Tutor Hotfix

## Fixed
The Autoplay Bot could throw:

`Cannot read properties of undefined (reading 'virtual')`

when one of its spells resolved from the stack.

### Root cause
The tactical simulator uses temporary `_coach.virtual` values while evaluating plays.
After a tactical result is committed to the real game, `_coach` is intentionally removed.
The bot's later stack-resolution path could call the tactical resolver on that real state without rebuilding those temporary values.

## Three Visits / tutors improved too
Rather than only preventing the crash, simple bot spells that Forge already understands now resolve through the real rules path.

For a spell such as **Three Visits**:
1. the bot casts it and you still get priority,
2. when you pass, the actual spell resolves,
3. Forge creates the real library-search instruction,
4. the bot searches its own private library,
5. it chooses a legal matching Forest,
6. it puts that card onto the battlefield,
7. it performs the required shuffle.

The bot can also automatically complete several other supported self-owned pending effects such as simple draw, life, mill, token, graveyard, sacrifice, and discard effects.

The bot still cannot see the human player's hidden hand or library.

The 6.10.0 host-authoritative multiplayer rewrite is unchanged.
