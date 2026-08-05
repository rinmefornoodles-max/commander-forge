# Tactical Coach Base 5.0

This release targets consistent decision-making above the average casual player without pretending to automate every Magic interaction.

## Shared tactical engine

The coach now uses the same basic casting, mana, timing, and combat systems as the table. It does not maintain a second board-total-only rules approximation.

It evaluates:

- Specific tapped and untapped mana sources
- Source colors and flexible dual-land choices
- Restricted mana such as creature-spell-only mana
- Commander tax and common cost increases/reductions
- Kicker variants
- Convoke, delve, and improvise opportunity costs
- Additional life, discard, and sacrifice costs
- Land-entry conditions
- Main-phase and stack timing
- Summoning sickness, haste, vigilance, flying, reach, menace, deathtouch, first strike, double strike, trample, lifelink, indestructible, hexproof, shroud, ward, and protection heuristics
- Visible blockers and likely combat trades
- Basic common effects such as draw, mill, life changes, tokens, removal, wipes, tutors, and recursion
- State-based losses and creatures with zero or less toughness

## Tactical search

The coach generates immediate legal actions plus beam-searched sequences up to three decisions deep. Every sampled rollout applies the candidate action through the tactical engine, samples plausible hidden interaction, then checks a best short continuation.

## Strategy profiles

The coach derives a visible strategy profile from the commander and observed cards. Profiles include Ninja/ninjutsu, evasive combat, graveyard/Zombies, reanimation, tokens, sacrifice, artifacts, Equipment/Voltron, spellslinger, counters, lifegain, ramp, control, and go-wide plans.

This allows it to value an unblockable one-drop highly in Satoru, death-trigger creatures in graveyard decks, or preserving interaction in a control shell.

## Manual fallback

Unusual replacement effects, complicated copy/layer interactions, loops, unusual alternate costs, and card-specific exceptions still require manual resolution. Once the table state is corrected, the coach continues from the resulting public position.
