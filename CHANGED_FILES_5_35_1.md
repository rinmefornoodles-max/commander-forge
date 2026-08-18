# Commander Forge 5.35.1 — Native Multiplayer Approval Popups

## What changed

- Replaced the multiplayer approval experience with themed Commander Forge UI instead of browser-style prompts.
- Undo requests now open a centered in-game approval modal for the other player.
- The requester sees an in-game waiting card with a Cancel Request button.
- Multiplayer Test Override actions now require the other player to approve them before they happen.
- The approval modal explains what test action was requested and warns that Test Override can bypass normal Magic rules.
- Test Mutate without mana, Test Aura without mana, and Force Move sandbox actions use the approval flow online.
- Hidden cards are not named in the approval description when the requested action starts from a hidden hand/library zone.
- Updated multiplayer protocol version so both players must be on the approval-capable build.

## Upload these files

- `index.html`
- `commander-forge-5.35.1.js`
- `commander-forge-5.35.1.css`
- `sw.js`
- `VERSION.txt`

After GitHub Pages redeploys, hard-refresh with Ctrl+Shift+R.
