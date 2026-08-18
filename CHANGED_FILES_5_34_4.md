# Commander Forge 5.34.4 — Mutate Rules + Nethroi Fix

Upload/replace:
- index.html
- commander-forge-5.34.4.js
- commander-forge-5.34.4.css
- sw.js
- VERSION.txt

## Mutate UI
- A card with Mutate now shows a Mutate rules panel even while it is on the battlefield.
- Battlefield cards correctly explain that Mutate is an alternative casting cost, not an activated battlefield ability.
- Any non-Human creature shows whether it is an eligible Mutate target and tells the player to select the Mutate card in hand/command zone.
- Changeling creatures count as Human and are rejected as Mutate targets.
- The merged pile is visible in the inspector with top/under components and mutation count.

## Mutate rules engine
- Keeps target permanent status, controller, counters, damage, Auras/Equipment, tapped/attacking status.
- Top component determines characteristics; all component abilities are merged.
- Successful mutation does not fire normal ETB for the mutating card.
- Illegal target on resolution makes the spell resolve as a normal creature.
- Every `Whenever this creature mutates` ability is queued.
- Merged commander damage is tracked using the actual commander component.
- When a merged permanent leaves, one permanent leaves/dies and its components separate into their zones.
- Only the commander component goes to the command zone when that option is chosen.
- Token components cease to exist after leaving the battlefield.

## Nethroi-style trigger
Forge now recognizes:
`return any number of target creature cards with total power N or less from your graveyard to the battlefield`

The trigger presents a multi-select list, tracks total power, permits zero targets, and returns the selected creatures together. Cards with nonnumeric graveyard power prompt for the current power value.
