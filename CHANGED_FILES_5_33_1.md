# Commander Forge 5.33.1

- Fixes pending triggers that have no legal target.
- Sheoldred-style upkeep recursion no longer blocks phase progression when the graveyard has no creature card.
- Known smart effects are preflighted when queued. If there is no legal target/applicable creature, the effect is logged and does not create a blocking pending item.
- If a legal choice disappears after a trigger was already queued, the UI provides a No legal target / nothing to sacrifice resolution action.
- Improves affected-player selection for target/each-opponent sacrifice effects.
