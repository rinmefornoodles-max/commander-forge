# Commander Forge 6.10.2 — Bot Oracle Auto-Resolution

## Core change
The tactical bot now chooses what looks strategically good to cast, but it no longer gets to approximate what a spell actually does when that spell resolves.

When you press **Pass · let bot spell resolve**:
1. the real Forge stack resolves the card,
2. Forge creates the actual Oracle instruction,
3. the bot supplies choices/targets for supported deterministic effects,
4. the rules resolver changes the real table,
5. if an instruction is not supported yet, the bot pauses instead of silently pretending it happened.

## Fight for the Throne
- bot chooses both targets before you get priority
- priority banner shows the targets
- +1/+1 counter is actually added
- creatures actually fight
- fight damage is simultaneous
- lethal damage/deathtouch/indestructible/lifelink/infect/wither are handled at a practical rules-engine level
- if only one target remains legal, the creatures do not fight
- if both targets are illegal, the effect does nothing
- the opponent creature is tracked for the rest of the turn
- if it dies while the bot controls its commander, the bot becomes the monarch

## Monarch
- current monarch stored in game state
- visible crown badge
- monarch draws at their end step
- combat damage to the monarch transfers the monarchy in Solo tactical combat

## Unsupported Oracle text
Unsupported bot spell text no longer disappears into a tactical score.
The bot pauses and names the exact unresolved instruction so the next rules primitive can be added deliberately.
