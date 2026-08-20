# Commander Forge production source policy

The live GitHub Pages app is defined by `index.html` plus the versioned production bundle and supporting runtime assets it references.

Starting with product release 6.14.0, `package.json` records:
- `version`: the Commander Forge product/reliability release.
- `commanderForge.bundleVersion`: the gameplay bundle used by the site.
- `commanderForge.multiplayerProtocol`: the multiplayer wire version.

A reliability-only release may intentionally reuse a previously tested gameplay bundle. The regression suite verifies the declared bundle exists, parses, and retains critical gameplay fixes.

Older modular JavaScript files in the repository are reference/development material unless a release explicitly rebuilds the production bundle from them. Production fixes must be verified against the versioned bundle actually loaded by the site.

This avoids silently reintroducing a bug from a stale reference module while the source/build pipeline is progressively consolidated.
