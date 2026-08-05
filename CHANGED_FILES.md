# Files changed in the skilled public-information coach update

## New files

- `card-evaluation.js` — card traits, effective stats, combat outcomes, and permanent valuation.
- `knowledge.js` — persistent public-information memory and opponent behavior model.
- `package.json` — Node test command and ES module configuration.
- `tests/coach-information-set.test.mjs` — requested hidden-information and combat scenarios.
- `tests/core.test.mjs` — preserved core deck, mana, move, and combat tests.
- `tests/main-smoke.test.mjs` — initial application rendering smoke test.
- `COACH_AUDIT_AND_IMPLEMENTATION.md` — exact old-code audit, new architecture, and limitations.
- `CHANGED_FILES.md` — this file.

## Modified files

- `coach.js` — replaced flat noisy rollouts with public-information-only sampled search, risk model, card-level evaluation, explanations, confidence, and safer alternatives.
- `state.js` — state version 4, public-memory storage, card relation fields, color identity, and save migration.
- `game.js` — public event recording, publicly revealed cards, blockers, attachments, shuffle memory invalidation, and zone-history tracking.
- `main.js` — coach explanation UI, information audit, public reveal/block/attach actions, and information-set sample settings.
- `constants.js` — coach sample defaults and cache/version keys.
- `styles.css` — visible-board, memory, risk, confidence, and safer-line coach styling.
- `sw.js` — cache version and new JavaScript modules.
- `.github/workflows/main.yml` — preserves same-origin precon building before Pages deployment.
- `README.md` — current feature, testing, deployment, and limitation documentation.

## Preserved without simplification

- `api.js`
- `rules.js`
- `utils.js`
- `build_precons.py`
- Existing deck import, precon, split-card, auto-mana, playmat, save, drawer, commander, token, counter, and GitHub Pages systems.
