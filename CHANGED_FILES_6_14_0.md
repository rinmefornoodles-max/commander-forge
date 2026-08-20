# Commander Forge 6.14.0 — Stability & Quality

## Deployment safety
- GitHub Pages now runs the Commander Forge regression suite before deployment.
- A failing regression test stops the deploy job before the live site changes.
- `package.json` now tracks product version 6.14.0, gameplay bundle 6.13.0, and multiplayer protocol 6.13.0-mp7 separately.

## Regression coverage
- Normal attacks and multiplayer attack targets.
- Propaganda-style attack taxes.
- Attack-trigger queuing.
- Void Winnower blocking restrictions.
- Bot defense after a human attack.
- Multiplayer reconnect identity, reserved seats, anti-hijack behavior, expiry, and host seat-release rules.
- Release metadata and JavaScript syntax.

## Cache / PWA reliability
- Added a 6.14 stability layer that re-registers a scoped Commander Forge service worker after the legacy 6.13 startup cleanup.
- Only old caches beginning with `commander-forge-` are removed by the new worker.
- Navigation uses network-first behavior with an offline shell fallback.
- `VERSION.txt` is checked without cache so a later release can display an **Update & Reload** prompt.

## Better bug reports
- Runtime-error toasts gain **Report this error**.
- Feedback can include privacy-safe technical context: product/build version, mode, player count, turn, phase, rules mode, mana mode, online status, viewport, and page.
- Hand and library identities are never included.

## Fixed / contained
- The 6.13 index still contains a stale cache warning expecting 6.12.1. The 6.14 stability layer removes that known stale warning without rewriting the large gameplay page or bundle.

## Production bundle note
6.14.0 is intentionally a shell/reliability release and continues to use the tested 6.13.0 gameplay bundle. No game-logic or multiplayer wire-protocol change was needed, so the combat and reconnect code that already passed regression testing remains untouched.
