# Commander Forge 5.34

Upload/replace these files in the repository root:

- `index.html`
- `commander-forge-5.34.0.js`
- `commander-forge-5.34.0.css`
- `sw.js`
- `VERSION.txt`

## Major changes

- Aura casting now asks for a legal enchant target before the spell is cast.
- Aura target is remembered on the stack and rechecked on resolution.
- Auras that become unattached or illegally attached move to their owner's graveyard.
- Removing an enchanted permanent correctly cleans up attachment relationships.
- Enchantment creatures stay with normal permanents/creatures rather than being forced into the enchantment utility corner.
- Owner and controller are now treated separately when a permanent is stolen.
- Changing control does not count as leaving/re-entering the battlefield and therefore does not create a fake ETB.
- Stolen cards that later go to graveyard/hand/library/exile go to the proper owner's zone.
- Public graveyard/exile cards have card-effect helpers for casting/playing/putting them onto the battlefield under another player's control.
- Control Magic-style Auras (`You control enchanted creature/permanent`) now transfer control while attached and restore the prior controller when the Aura leaves.
- Online Undo is available to either player, but sends an approval request to the other player. No undo occurs until approved.
- Trigger engine now keeps separate copies of identical triggers instead of deduplicating them.
- Supported trigger events can create downstream events/triggers (draw -> life gain -> another draw trigger, etc.).
- Resolved instants/sorceries now queue their executable Oracle-text instructions instead of silently going to the graveyard with no effect.
- Fixed automatic resolution for common fixed draw/life/mill effects.
- Token and token-copy battlefield entries now create ETB triggers.
- Targeted triggers with no legal target do not trap phase advancement.

## Important scope note

5.34 is a stronger rules-engine foundation, but it is **not full Magic rules coverage**. Unsupported Oracle wording still falls back to manual resolution. Full card coverage requires a structured Oracle compiler/effect DSL plus more rules systems (continuous effects/layers, replacement effects, target selection, linked abilities, copy effects, alternate costs, delayed triggers, APNAP trigger ordering, and more).
