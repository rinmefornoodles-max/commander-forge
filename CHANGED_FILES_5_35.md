# Commander Forge 5.35.0 — Rules Engine Bridge Foundation

## Live-site changes

- Version bumped to 5.35.0.
- Existing local JavaScript rules engine remains authoritative by default.
- Added an internal engine bridge module.
- Added Tools → Rules engine migration controls:
  - Local mode
  - Shadow mode
  - external gateway URL
  - connection test
- Shadow mode mirrors allowed UI actions plus persisted state updates to a separate gateway.
- Local mode makes no network engine calls and keeps current gameplay behavior.
- Existing 5.34.5 gameplay features, Mutate UI, Test Override, control/Aura handling and multiplayer undo UX remain present.

## Migration package

`engine-migration/` includes:

- zero-dependency Java shadow gateway
- authoritative JSON protocol design
- XMage integration map
- migration stages
- deployment notes
- viewer-state and legal-action examples

## Important

5.35 does **not** claim every Magic card is now enforced by XMage. It is the first safe architecture step toward that result. Do not switch normal gameplay authority until the Stage 2–5 XMage integration and parity tests are complete.
