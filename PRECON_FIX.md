# Precon Reliability Update

This update makes official precon loading more reliable.

Changes:
- Retries temporary network failures and timeouts.
- Tries official MTGJSON domains/mirrors.
- Refreshes DeckList.json automatically when a cached filename becomes stale.
- Supports minor MTGJSON deck-schema variations.
- Saves successfully loaded precons locally for reuse during a later outage.
- Uses a network-first service worker so newly deployed fixes are not hidden by an old cache.
- Gives a clearer fallback message when an upstream deck truly is unavailable.

Upload every file in this folder over the matching files in the repository root.
Keep `.github/workflows/deploy-pages.yml`.
