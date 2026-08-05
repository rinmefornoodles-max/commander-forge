# Rules-Aware Mana / Monte Carlo Update — Changed Files

## Modified

- `rules.js`
  - Common land-entry rules.
  - Exact untapped-source mana planning.
  - Color-preserving source selection.
  - Land-play and spell-timing legality helpers.
  - Current versus next-turn mana snapshots.
- `coach.js`
  - Legal moves now come from the rules/mana layer.
  - Each simulated cast taps named sources and spends actual colors.
  - Tapped lands cannot pay current costs.
  - Lands entering tapped cannot enable same-turn sequences.
  - Resource evaluation distinguishes open mana from future mana.
  - Recommendations explain tapped sources and preserved colors.
- `game.js`
  - Auto-pay uses the same source-preserving planner.
  - Common land-entry tapped/life rules are applied on the table.
- `sw.js`
  - Cache version bumped so the new engine replaces old browser code.
- `README.md`
  - Documents the new rules-aware search behavior.
- `package.json`
  - Version updated to 4.1.0.
- `VERSION.txt`
  - Build updated to 2026.08.04.6.
- `.github/workflows/main.yml`
  - Runs the Node test suite before deploying GitHub Pages.

## New

- `RULES_AWARE_MONTE_UPDATE.md`
- `RULES_AWARE_MONTE_CHANGED_FILES.md`
- `tests/rules-aware-mana.test.mjs`
