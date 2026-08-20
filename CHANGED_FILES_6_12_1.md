# Commander Forge 6.12.1 — Declare Attackers / Bot Defense Hotfix

## Fixed: declaring an attacker could throw an error in Solo Autoplay

Commander Forge 6.12.0 added the generic `compiledBlockLegality(...)` check to the coach's defensive blocker selection so Void Winnower and future static blocking restrictions are respected by the bot.

The defensive coach called that function, but `coach.js` did not import it from the rules module. As soon as the human declared an attacker, Solo Autoplay asked the coach to choose blocks and JavaScript threw:

`ReferenceError: compiledBlockLegality is not defined`

### Fix

The coach rules import now includes `compiledBlockLegality`.

This keeps the 6.12.0 Void Winnower rules intact:
- normal attack declaration still works;
- the bot can evaluate blockers after an attack;
- an opponent of Void Winnower cannot block with an even-mana-value creature;
- odd-mana-value creatures remain eligible when ordinary blocking rules allow them.

## Cache/version

The browser bundle and stylesheet are versioned as 6.12.1 and `index.html` points to those new filenames so GitHub Pages/browser cache cannot accidentally keep loading the broken 6.12.0 JavaScript.
