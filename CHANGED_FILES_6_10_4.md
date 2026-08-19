# Commander Forge 6.10.4 — Activation Metadata + Real Sacrifice Action

## Fixed: `activationMetadata is not defined`
`activationMetadata()` already existed in Forge's utility module, but the game module was calling it without the function being exported/imported.

That is why the Autoplay Bot could report:
`Play Terramorphic Expanse — activationMetadata is not defined`

Alpha 6.10.4 exports the helper and imports it into the real activated-ability engine.

Terramorphic Expanse can therefore proceed through:
- tap cost
- sacrifice-this-land cost
- actual library search
- basic-land choice
- battlefield tapped
- shuffle

## New right-side Sacrifice button
Every battlefield permanent now has a dedicated **☠ Sacrifice** action in Card Actions → Quick Actions.

This is different from simply dragging/moving a card to the graveyard.

Using Sacrifice:
- explicitly records that the permanent was sacrificed
- moves a nontoken permanent to its owner's graveyard
- lets a sacrificed token die, then cease to exist
- fires ordinary dies/leaves-the-battlefield triggers
- fires sacrifice triggers such as `Whenever you sacrifice a permanent...`
- satisfies a recognized single-card pending sacrifice instruction when that card is a legal choice
- works through the normal host-authoritative multiplayer state system

Use this button when a spell, ability, or tabletop action tells you to sacrifice the permanent.

## Sacrifice triggers
Forge now emits a dedicated `sacrifice` game event.

The trigger system now recognizes common patterns such as:
- Whenever you sacrifice a permanent...
- Whenever you sacrifice a creature...
- Whenever an opponent sacrifices...
- Whenever a permanent is sacrificed...

The sacrificed card is also available as last-known-information for its own relevant sacrifice trigger.

## Unified sacrifice handling
The same sacrifice primitive is now reused for:
- the new manual Sacrifice button
- activated-ability sacrifice costs
- supported `sacrifice a ...` pending effects

This avoids one path treating a sacrifice as a plain graveyard move while another path triggers cards correctly.
