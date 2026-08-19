# Commander Forge 6.0 Alpha 6.2

## Bot turn crash fixed
Fixed the Test Override/runtime error:
`nextTurnPlayerId is not defined`

The live game turn/phase module was calling a helper that only existed inside the tactical-analysis module. Alpha 6.2 gives the live game engine its own multiplayer-safe turn-order helper.

## D20 added to Solo Practice
Solo games now use the same starting-player D20 before mulligans.

### Solo vs Autoplay Bot
- You physically throw the D20.
- The Autoplay Bot automatically rolls after you.
- Highest roll goes first.
- If tied, only the tied sides reroll.
- Mulligans begin after the winner is decided.

### Solo without the bot
- Player 1 throws.
- Then Player 2 throws on the same D20 arena.
- Highest roll goes first.
- Ties reroll normally.

The D20 keeps the existing capped velocity, momentum, spin, friction, and edge bounce.
