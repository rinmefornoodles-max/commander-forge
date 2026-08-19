# Commander Forge 6.0 Alpha 3 — Autoplay Bot

## Added
- Solo Practice opponent can be set to **Autoplay Bot**.
- Casual / Average / Strong / Best Available strength levels.
- Watch / Fast / Instant pacing.
- Automatic Commander mulligans for the bot.
- Full opponent deck profiling including custom deck libraries; opponent hidden cards remain private to the bot.
- Existing Coach information-set search is reused for bot decisions.
- Spell casting creates a real priority pause: the bot places ordinary spells on the stack and waits for the human to respond or pass.
- Bot can use instant-speed responses to a human spell when the tactical search values the response.
- Bot declares attacks, human chooses blocks, then combat can be resolved automatically.
- Bot chooses blocks against human attacks.
- Pause Bot and Take Over Opponent controls are always visible while autoplay is enabled.
- Bot decision reason and inferred deck plan are shown in the status bar.

## Engine / rules improvements
- Strategy profiling now includes the player's own library at low weight so a completely custom deck can be understood before key cards are drawn.
- Tactical counterspells now counter the spell beneath them on the stack.
- Added marked-combat resolver that respects declared blocker assignments.
- Vigilance attackers no longer tap when declared through the regular attack control.

## Scope
This is the first functional autoplay opponent. It uses the current tactical/rules model while Engine 6 continues becoming authoritative. Very unusual cards or unsupported Oracle interactions may still need Test Override/manual handling.
