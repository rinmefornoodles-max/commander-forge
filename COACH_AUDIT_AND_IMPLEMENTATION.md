# The Commander Forge — Coach Audit and Information-Set Upgrade

## Audit of the previous coach

The previous `coach.js` was not a full Monte Carlo Tree Search implementation. It:

1. Generated a flat list of candidate actions.
2. Cloned the current game state for each candidate.
3. Applied one approximate move.
4. Ran independent randomized rollouts with hidden-information noise.
5. Ranked the average heuristic score.

It did not build a search tree, use UCT, maintain information sets, or sample public-information-consistent opponent states.

### Information previously analyzed

- **Your full hand:** Yes. Used to generate land plays, castable cards, and some short sequences.
- **Your entire battlefield:** Yes. Used for mana, board value, and attack generation.
- **Opponent visible battlefield:** Yes.
- **Individual card abilities and state:** Partial. It used power, toughness, mana value, tapped/summoning-sick state, counters, commander status, and a small keyword set. It did not meaningfully distinguish many static, triggered, activated, attachment, ward, protection, death-trigger, or combat-trigger interactions.
- **Graveyards and exile:** Present in state, but barely used strategically.
- **Command zones:** Used for commander casting and tax.
- **Life, poison, commander damage, mana:** Yes.
- **Publicly revealed cards and historical actions:** No structured persistent memory.
- **Previously played, discarded, milled, bounced, or exiled cards:** No persistent strategic memory.
- **Opponent hand size:** Yes, mostly as a generic risk/noise input.
- **Opponent play behavior:** No meaningful behavioral model.
- **Opponent hidden hand/deck:** The UI state contained both players' cards because solo mode controls both seats. The old coach did not intentionally use exact opponent names in most scoring, but it had no formal information-set boundary guaranteeing that hidden identities could never leak into analysis.

## What was implemented

### Public-information boundary

`buildInformationSet()` now constructs the only state the coach is allowed to analyze. It includes:

- The active player's exact hand.
- Both visible battlefields and public card state.
- Graveyards, exile, command zones, stack, life, poison, commander damage, mana, hand sizes, and library sizes.
- Publicly known cards in an opponent's hand.
- Public action history and behavior summaries.

It deliberately excludes:

- Exact names in an opponent's hidden hand.
- Exact identities/order of an opponent's hidden library.
- An opponent's imported decklist as hidden knowledge.

Simulations replace those hidden cards with anonymous placeholders.

### Perfect public memory

The state now records structured public events for:

- Cards cast or played.
- Cards milled, discarded, revealed, exiled, destroyed/died, and countered.
- Cards returned to a hand.
- Publicly known cards placed on top or bottom of a library.
- Library shuffles, which invalidate known top/bottom positions.
- Attacks, blocks, turn passes, open mana, cards held across turns, lands played, and spells cast.
- Previously used removal, counterspells, combat tricks, protection, board wipes, graveyard interaction, and flash threats.

A publicly known card returned to an opponent's hand remains in `knownHand` until it is cast, played, discarded, exiled, placed in a library, or shuffled away.

### Card-level visible-board analysis

The coach now distinguishes cards using Oracle text, keywords, counters, attachments, and state. The card evaluator recognizes and values:

- Flying, reach, menace, deathtouch, first strike, double strike, trample, lifelink, vigilance, haste, defender, and unblockable.
- Indestructible, hexproof, shroud, ward, and protection.
- Death, attack, combat-damage, and enter-the-battlefield triggers.
- Activated, tap, and static abilities.
- Equipment, Auras, attachments, tokens, counters, anthem-like effects, draw engines, tutors, recursion, sacrifice value, and common interaction categories.
- Tapped/untapped, summoning-sick, attacking, and blocking state.

The combat evaluator now uses those differences, so a 1/1 with deathtouch is not treated like an ordinary 1/1 or like a normal 5/5 blocker.

### Human-like hidden-information reasoning

The coach estimates categories rather than inventing exact unknown cards:

- Counterspell.
- Creature removal.
- Combat trick.
- Protection spell.
- Board wipe on the next turn.
- Graveyard interaction.
- Flash threat.
- Additional creature or engine piece.

Probabilities are conditioned on:

- Public commander color identity.
- Untapped mana and available colors.
- Current and next-turn castability.
- Opponent hand size.
- Exact publicly known cards.
- Cards already used.
- Visible strategy and observed card characteristics.
- Repeated passes with mana open and cards held over turns.

Impossible categories are assigned zero probability. For example, a mono-red opponent cannot be sampled as holding a conventional blue counterspell.

### Practical information-set Monte Carlo search

The new coach is a practical Information Set Monte Carlo equivalent rather than a full UCT tree:

1. Build a public information set.
2. Generate legal-looking root moves and short sequences.
3. Sample plausible hidden interaction categories from public evidence.
4. Apply the candidate move and sampled response to a cloned public state.
5. Simulate shallow follow-up risk, including board wipes and engine development.
6. Score the resulting visible state using card-level values and combat outcomes.
7. Rank expected value across samples.

The search never gives sampled hidden scenarios an exact unknown card name.

### Explanations

Each recommendation now reports:

- The recommended action.
- Visible-board reasons.
- Public-memory facts that influenced it.
- Plausible hidden interaction.
- Risk level and estimated probability.
- Confidence based on score separation and sample variance.
- A safer alternative when one exists.
- The range of sampled outcomes.

### Strong fundamentals

The evaluator strongly rewards:

- Early land drops.
- Mana development.
- Efficient use of available mana.
- Advancing commander/deck synergies.
- Favorable attacks and evasive damage.
- Avoiding bad trades.
- Holding interaction only when public evidence supports it.

It strongly penalizes passing while an early land drop is available.

## Manual information entry

A digital table cannot observe a physical statement unless the user records it. Public memory is updated automatically for actions made through the app. For unusual real-world or card-specific actions, use the new public reveal/block/attachment actions so the coach can remember them.

## Known limitations

- Oracle text is interpreted with deterministic heuristics, not a complete implementation of every Comprehensive Rules layer and replacement effect.
- The search is information-set sampled root search with shallow continuations, not a full multi-ply UCT implementation.
- Complex loops, copy-layer dependencies, unusual protection wording, hidden choices, and some card-specific effects still require manual resolution.
- The current trainer remains a two-seat Commander practice table.
- Existing saved games begin collecting public memory after migration; historical actions from before this update cannot be reconstructed.
