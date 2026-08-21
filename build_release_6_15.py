#!/usr/bin/env python3
"""Build Commander Forge 6.15.0 from the tested 6.13.0 production bundle.

Each patch is deliberately an exact one-occurrence replacement. If the base
bundle changes or a patch stops matching, the build fails instead of silently
shipping a partially patched rules engine.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BASE = ROOT / 'commander-forge-6.13.0.js'
OUT = ROOT / 'commander-forge-6.15.0.js'
PATCHES = [
    ROOT / 'ability_patch_core.py',
    ROOT / 'ability_patch_combat.py',
    ROOT / 'ability_patch_ui.py',
    ROOT / 'ability_patch_mana.py',
]

source = BASE.read_text(encoding='utf-8')
patch_log = []


def rep(old: str, new: str, label: str) -> None:
    global source
    count = source.count(old)
    if count != 1:
        raise RuntimeError(
            f"Patch {label!r} expected exactly one match in the production bundle; found {count}."
        )
    source = source.replace(old, new, 1)
    patch_log.append(label)


for patch in PATCHES:
    code = patch.read_text(encoding='utf-8')
    scope = {'rep': rep, '__builtins__': __builtins__}
    exec(compile(code, str(patch), 'exec'), scope, scope)

required_markers = [
    "CommanderForgeBuildVersion = '6.15.0'",
    "MULTIPLAYER_APP_VERSION = '6.15.0-mp8'",
    "function abilityCoverageForCard(card)",
    "function resolveSmartRandomEffect(effectId)",
    "kind: 'exile-graveyard-copy-token'",
    "kind: 'roll-die-draw-no-max'",
    "const directManaLines = lines",
    "colon >= 0 && addIndex > colon",
]
for marker in required_markers:
    if marker not in source:
        raise RuntimeError(f'Missing required 6.15 marker after build: {marker}')

OUT.write_text(source, encoding='utf-8')
print(f'Built {OUT.name}: {len(source):,} bytes; {len(patch_log)} guarded patches applied.')
for label in patch_log:
    print(f'  OK {label}')
