# MTG Commander Manual Practice Table

A modern, mobile-friendly Streamlit website for practicing Commander manually with two decks. It loads official preconstructed decklists, card images, and Oracle text, then handles setup and bookkeeping while leaving card-specific decisions and effects under your control.

## Interface

- Modern dark playmat-style design
- Commander artwork previews during deck selection
- Sticky turn, phase, and undo controls
- Player dashboards for life and zone counts
- Mobile-friendly tab navigation
- Rounded card imagery and clearer visual grouping
- Responsive desktop and phone layouts

## Game features

- Search official preconstructed decks through MTGJSON
- Paste any custom decklist as a fallback
- Load card images and Oracle text from Scryfall
- Control both players manually with no AI decisions
- Automatically shuffle, draw opening hands, untap, advance phases, and log actions
- Manage hand, battlefield, library, graveyard, exile, and command zones
- Draw, mill, adjust life, discard, create tokens, manage mana, and add counters
- Track commander casts, commander tax, and commander damage
- Search, reveal, and shuffle libraries
- Undo the last 30 actions

## Run locally

```bash
python -m pip install -r requirements.txt
python -m streamlit run app.py
```

Windows users can double-click `run_windows.bat`.

## Deploy as a website

Follow `SETUP_WINDOWS.md`. The project is ready for Streamlit Community Cloud and does not require private API keys.

## Important limitation

This is a manual practice table, not a complete Magic rules engine. Players remain responsible for legal plays, mana payment, targeting, triggers, replacement effects, combat legality, damage assignment, and resolving Oracle text.

## Data sources

Scryfall supplies card data and imagery. MTGJSON supplies official deck metadata and decklists. This fan-made learning project is not affiliated with Wizards of the Coast.
