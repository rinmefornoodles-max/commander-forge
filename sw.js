# The Commander Forge — Digital Commander Table

A browser-based Commander practice table designed to feel closer to playing with physical cards than using a dashboard.

## Included in this build

- Full-screen two-player playmat with battlefield, hand, command zone, library, graveyard, exile, and stack
- Responsive desktop and mobile layouts
- Pointer/touch drag-and-drop between zones
- Tap/untap rotation and attacking markers
- Card side inspector with quick zone moves, Oracle text, notes, counters, token copies, and face-down state
- Slide-up graveyard/exile/library drawers with horizontal scrolling
- Library name search, reveal top, draw, mill, top/bottom placement, and shuffle
- Custom decklist import using lines such as `1 Satoru Umezawa`
- Official precon search through MTGJSON
- Card data and images through Scryfall
- Commander selection and validation for 100 cards, singleton, color identity, commander eligibility, and Scryfall Commander legality
- Life, poison, commander damage by source, commander tax, mana pools, tokens, dice, coin flips, mulligans, concession, and win tracking
- Turn and phase controls with automatic untap and optional automatic draw
- Manual stack resolution and countering
- Undo history, action log, automatic local saving, and JSON save export/import
- Free, Learning, and Strict-basic rules modes
- A free heuristic Monte Carlo coach that ranks moves, two-step cast sequences, attacks, and simple defense assignments
- Installable PWA shell for a phone home screen

## Important rules-engine scope

This build enforces and explains **basic universal rules** such as land timing, one normal land play, mana availability, sorcery timing, commander tax, summoning sickness, tapped attackers, command-zone placement, deck legality, and zones.

It does **not** perfectly execute every unique Oracle ability, replacement effect, layer interaction, target restriction, loop, copy effect, or newly released mechanic. Those effects remain manually resolvable using the table controls. The Monte Carlo coach evaluates visible board state and common card properties; it does not fully simulate every card's Oracle text.

## Run locally

### Windows

Double-click `start_windows.bat`. Python must be installed.

Or open a terminal in the folder and run:

```bash
py -m http.server 8000
```

Then open `http://localhost:8000`.

### macOS/Linux

```bash
./start_mac_linux.sh
```

## Deploy free

This rebuild is a static HTML/CSS/JavaScript app. Use GitHub Pages rather than Streamlit. See `DEPLOY_GITHUB_PAGES.md`.

## Tests

With Node.js installed:

```bash
npm test
```

## Data attribution

Card data and images are loaded from Scryfall. Official preconstructed deck metadata is loaded from MTGJSON. Magic: The Gathering and its card names/images are property of Wizards of the Coast. This project is unofficial and not endorsed by Wizards of the Coast.
