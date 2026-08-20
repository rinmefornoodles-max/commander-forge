# Commander Forge 6.11.2 — Static Attack Costs / Propaganda

## Fixed: bot attacks through Propaganda for free

Commander Forge now has a reusable Oracle static-rule primitive:

`ATTACK_COST`

The rules engine scans the defending player's battlefield for recognized effects that say creatures cannot attack that player unless their controller pays a cost for each attacker.

## Propaganda behavior

For:
`Creatures can't attack you unless their controller pays {2} for each creature they control that's attacking you.`

Forge now:
1. detects Propaganda on the defending battlefield
2. calculates `{2}` for each creature being declared against that player
3. checks whether the attacker can actually pay
4. refuses the attack if the cost cannot be paid
5. pays/taps the necessary mana sources when the attack is declared
6. records the payment in the game log

This applies to both human attack declarations and the Autoplay Bot.

## Bot strategy

The bot now knows the attack tax while deciding whether an attack is good.

- unaffordable attacks are removed from its legal attack plans
- payable taxes reduce the strategic value of attacking
- multi-creature attack plans check the TOTAL tax
- tactical combat simulations also spend the tax, so the AI does not score the attack as if the mana stayed available

Example:
Propaganda + 3 attackers = `{6}` total required.

The bot may decide that paying six mana is worse than developing its board and simply not attack.

## Multiplayer

When choosing which opponent an attacker is attacking, the target picker now shows:
`⚖ Attack tax {2} · Propaganda`

If the current resources cannot pay it, that is shown too.

Each opponent is evaluated independently, so a player can choose to attack an unprotected opponent instead.

## Generic card families

The parser is not keyed to the name Propaganda.

The same static rule recognizes common wording used by:
- Propaganda
- Ghostly Prison
- Windborn Muse
- similar fixed attack-tax permanents

It also includes:
- Sphere of Safety style `{X}`, where X is enchantments you control
- "as long as this permanent is untapped" attack-tax conditions such as Archangel-of-Tithes-style wording

Multiple attack-tax permanents stack because Forge combines all active costs.

Phyrexian/life-alternative attack payments are intentionally reported as needing manual support rather than silently treated as free.

## Oracle Compiler inspector

Selecting a recognized attack-tax card now shows:
`Static combat rule: attackers must pay {2} each`

under the Oracle Compiler status.
