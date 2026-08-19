# Commander Forge 6.10.3 — Real Bot Activated Abilities / Fetch Lands

## Fixed: Terramorphic Expanse only tapped and did nothing

### Root cause
The tactical AI understood that activating Terramorphic Expanse was strategically useful, but `activate-ability` bot actions were still executed inside the tactical simulator.

That simulator could mark the land tapped and award strategic value without running Commander Forge's real activation-cost and Oracle-effect engine.

## New behavior
Bot activated abilities now use the SAME real game function as a player pressing Activate.

For Terramorphic Expanse:
1. bot chooses to activate it strategically
2. Forge pays `{T}, Sacrifice this land` as the real activation cost
3. Terramorphic Expanse leaves the battlefield and goes to its owner's graveyard
4. Forge queues the real Oracle instruction
5. bot searches its actual private library for a legal basic land
6. bot chooses the best matching basic
7. that land enters the battlefield tapped
8. the library is shuffled

## Broader activated-ability support
This same path now covers supported activated abilities involving:
- tap costs
- self-sacrifice
- sacrificing another creature/artifact/enchantment/land/permanent
- discarding a card
- mana costs
- life costs
- resulting library searches
- simple draw/life/mill/token/graveyard effects already understood by Forge

If an activated ability pays its cost but the resulting Oracle instruction is still unsupported, the bot pauses and tells you instead of pretending the effect happened.

## Rules reliability
Creature abilities with `{T}` now also respect summoning sickness when the real activation engine is used.
