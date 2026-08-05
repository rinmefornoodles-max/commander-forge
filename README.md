# The Commander Forge — Skilled Public-Information Coach

A two-seat digital Commander practice table for GitHub Pages. Both seats can be controlled manually, while the coach reasons like a skilled player with perfect memory of public information and no access to hidden opponent cards.

## Main trainer features

- Full digital playmat, drag-and-drop zones, tap rotation, drawers, card inspector, tokens, counters, attachments, stack, undo, save/import, commander tax, life, poison, commander damage, auto-mana, deck import/validation, official precon catalog, Scryfall images/data, split/multi-face card support, and responsive desktop/mobile UI.

## Coach update

- Formal information-set boundary prevents hidden-hand/decklist cheating.
- Structured memory of public cards and actions.
- Card-level board and combat evaluation.
- Opponent behavior and open-mana analysis.
- Public-evidence-weighted hidden interaction categories.
- Practical sampled information-set Monte Carlo search.
- Risk, confidence, public-memory reasons, and safer alternatives.
- Strong early land and mana-development fundamentals.

Read `COACH_AUDIT_AND_IMPLEMENTATION.md` for the exact pre-update audit and technical design.

## Tests

```bash
npm test
```

The included suite covers the requested scenarios plus core trainer and rendering checks.

## GitHub Pages deployment

Upload the contents of this folder to the repository root, replacing files with the same names. Keep the included `.github/workflows/main.yml`. Commit to `main`; the workflow rebuilds the same-origin precon catalog and deploys Pages.

After deployment, hard-refresh the site or clear the installed PWA cache if an older interface remains.

## Important limitation

This is a rules-aware Commander coach, not a complete implementation of every Magic rules interaction. It uses common Oracle-text heuristics and sampled public-information reasoning. Complicated card-specific effects remain manually resolvable on the table.
