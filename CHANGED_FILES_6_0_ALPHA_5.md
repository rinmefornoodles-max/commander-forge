# Commander Forge 6.0 Alpha 5

## Trigger cleanup
- Old Alpha 4 pending-trigger prompts are cleared once when an existing save is upgraded to Alpha 5.
- Battlefield-entry triggers get a unique entry-event key so the same ETB event cannot enqueue the same prompt twice.
- General game-event, leave-the-battlefield, phase, Mutate, and Ninjutsu triggers now carry event identity to reduce duplicate prompts.
- Pending card effects no longer hard-lock phase advancement.
- Added **Dismiss stale effects** for recovery when Forge cannot interpret an unusual card correctly.

### Thieves' Tools / token triggers
- `Create a Treasure token` and several other simple token instructions are now recognized.
- A waiting Treasure trigger can be completed with **Create Treasure & resolve**.
- If you create the matching token manually with the token tool, Forge consumes the matching pending token effect automatically instead of asking again.

## Ninjutsu / Mutate
- Ninjutsu now resolves directly onto the battlefield; its special activated ability no longer appears in the visual stack.
- The returned attacker goes to hand and the Ninja enters tapped and attacking in one action.
- Ninjutsu activation triggers are emitted before the Ninja enters, preventing the Ninja from incorrectly seeing its own activation and preventing duplicate activation triggers.
- Mutate now applies directly to the battlefield after payment and target/top-or-under choice instead of creating a visible stack object.
- The visible stack is now intended for instants and sorceries / response play.

## Library-search reliability
- Fixed a stale-modal race where resolving a library search could remove the pending effect during render and leave an invisible/stuck modal layer.
- The library picker closes before the state mutation now.
- If a pending search disappears or changes, the picker shows a recoverable Continue screen instead of trapping the table.
- Added **Already resolved manually** in the library search window.
- Moving a legal card manually from the library while a matching single-card tutor/search is pending is treated as the card effect, so Test Override is not required.
- Required shuffles are applied when such a manual library move satisfies a recognized search effect.
- Basic-land filtering is stricter.

## Graveyard / sacrifice / discard card effects
Recognized pending effects can authorize normal card movement without Test Override for common patterns:
- Return/put a creature, permanent, artifact, enchantment, land, or generic card from your graveyard to hand.
- Return/put it onto the battlefield, including tapped.
- Move it to exile or the top of your library.
- Reanimate a card from an opponent's/a graveyard in common 1v1 wording.
- Sacrifice one matching permanent by moving it to the graveyard.
- Discard / put a card from hand into the graveyard.
- Token sacrifices now also consume the matching pending sacrifice effect.

The pending-effect panel still leaves complex multi-destination / highly conditional wording manual rather than guessing.
