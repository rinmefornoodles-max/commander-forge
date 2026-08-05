# Rules-Aware Mana and Monte Carlo Update

## What changed

The sampled search now uses the same mana and basic legality model as the table instead of treating land count as a generic score.

### Mana state

- Only untapped permanents with a recognized mana ability can pay a current cost.
- Each selected source is assigned an actual mana-production choice.
- Sources selected for payment become tapped in every rollout.
- Remaining floating mana and remaining untapped sources are retained in the simulated state.
- Payment planning minimizes the number of permanents tapped and prefers lines that preserve colors needed by visible instants or flash cards.

### Land entry

The coach and table model common land-entry patterns, including unconditional tapped lands, check lands, fast lands, reveal lands, multiplayer lands, legendary-creature conditions, and shock-land life payment. Unsupported replacement effects remain manual.

### Basic rules used by search

- One normal land play per turn.
- Land plays require the active player's main phase and an empty stack.
- Noninstant spells require the active player's main phase and an empty stack.
- Commander tax is included.
- Tapped creatures cannot attack.
- Summoning-sick creatures need haste to attack.
- Visible flying, reach, menace, deathtouch, first strike, double strike, trample, lifelink, indestructible, ward, protection, counters, and common triggers remain part of combat and permanent evaluation.

## Important boundary

This is not a complete implementation of every Comprehensive Rules interaction. Alternate costs, cost reducers/increasers, convoke, delve, improvise, treasures that require sacrificing, restricted mana, priority passing, layers, replacement effects, and unusual card-specific permissions may still require manual handling. The coach now has a much stronger universal-rules foundation without pretending those edge cases are solved.
