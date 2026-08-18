# Commander Forge 5.33.2

Startup hotfix for 5.33.1.

- Exports `smartPendingEffectState` from the game module.
- Imports it into the main UI module so smart pending-effect buttons can render without a ReferenceError.
- Bumps the browser asset version/cache key to 5.33.2.
- Keeps the 5.33.1 no-legal-target behavior and override controls.
