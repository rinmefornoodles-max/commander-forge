# The Commander Forge

Digital Commander playmat with custom deck import, official-precon loading,
Scryfall card images, drag-and-drop zones, automatic mana assistance, game
tracking, and a Monte Carlo-style coach.

## Reliable official precons

This build no longer relies on the browser fetching MTGJSON directly. The
GitHub Pages workflow runs `scripts/build_precons.py`, downloads the official
MTGJSON deck archive server-side, and publishes a same-origin precon catalog.
The workflow also refreshes that catalog daily.

See `PRECON_SAME_ORIGIN_FIX.md` for deployment details.
