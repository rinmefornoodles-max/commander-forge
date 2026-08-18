Commander Forge 5.35.3

Fixes the remaining native browser Test Override confirmation that could still appear after dragging/casting a card.

Root cause:
- 5.35.2 added a Forge modal in the button/UI wrapper, but game.js moveCard() still called browser confirm() directly.
- Drag-and-drop calls moveCard() directly, bypassing the wrapper.

Fix:
- moveCard() no longer invokes browser confirm() for legality/Test Override.
- It returns a requiresOverride result containing a retry action.
- handleResult() opens the themed Commander Forge modal and retries with Test Override only after approval.
- This applies to drag/drop and normal action-button paths.

Upload:
- index.html
- commander-forge-5.35.3.js
- commander-forge-5.35.3.css
- sw.js
- VERSION.txt
