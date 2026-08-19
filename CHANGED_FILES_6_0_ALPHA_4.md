# Commander Forge 6.0 Alpha 4

## Opening hand / mulligan redesign
- Opening cards now use a large responsive grid instead of a tiny horizontal strip.
- Seven cards fit across a normal desktop window without horizontal scrolling.
- Normal-resolution card art is used on the opening-hand screen.
- Later mulligan bottom selections get a large BOTTOM overlay and clear selected count.
- Action buttons stay easy to reach.
- Mobile wraps cards into 3–4 columns instead of making you horizontally scroll.
- When Autoplay Bot controls Player 2, the bot's private opening hand is not exposed.

## Trigger reliability
- Trigger matching now inspects only the trigger condition before the comma, so effect text no longer causes unrelated triggers.
- Controller/opponent checks, creature/artifact/etc. checks, another/other checks, and source-specific checks are stricter.
- Duplicate same-source/same-event trigger insertion is guarded.
- "One or more" ETB batches use one batch guard.
- Ordinal triggers such as "your second card each turn" are intentionally left manual until exact event counting is available rather than firing incorrectly.

## Ninjutsu integrity fix
- A Ninja cannot start a second Ninjutsu activation while its first activation is pending.
- Returning the attacker removes stale duplicate top-level copies before restoring exactly one physical card to hand.
- Resolving Ninjutsu removes stale duplicate Ninja copies before putting exactly one Ninja onto the battlefield.
- If the Ninja leaves the hand before the ability resolves, no duplicate is invented and the ability resolves without a creature entering.
- Countering Ninjutsu leaves the source card in hand and clears its pending marker.

## Right-click card editing
Right-click a card on the table to open:
- Counters
- Keyword abilities

Those editors now open in a centered popup instead of taking up the card inspector.

## Card-effect movement / sacrifice / tutor improvements
Recognized card text can now directly resolve several common instructions without Test Override:
- Search library for a card/type and put it into hand
- Search to battlefield, including "tapped"
- Search to graveyard
- Search to exile
- Search then put the chosen card on top of the library
- Basic-land and land-subtype searches such as Rampant Growth / Farseek-style wording
- Sacrifice creature/artifact/enchantment/land/permanent effects
- Discard effects
- Put cards from hand into graveyard
- Old wording for milling top cards into graveyard
- Self-sacrifice activated costs such as fetchland/Burnished Hart-style abilities
- Activated costs that say "Sacrifice a creature/artifact/etc." now open a card chooser
- Activated "discard a card" costs now open a hand-card chooser

Complex or ambiguous multi-destination searches are deliberately left manual instead of guessing.
