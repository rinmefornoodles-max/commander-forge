#!/usr/bin/env python3
"""Build and wire Commander Forge 6.15.0 from the tested 6.13.0 bundle.

Each gameplay patch is an exact one-occurrence replacement. If the base bundle
changes or a patch stops matching, the build fails instead of silently shipping
a partially patched rules engine. The same build step updates the deploy copy of
index.html so GitHub Pages loads the generated 6.15 bundle and Compiler V8.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BASE = ROOT / 'commander-forge-6.13.0.js'
OUT = ROOT / 'commander-forge-6.15.0.js'
INDEX = ROOT / 'index.html'
PATCHES = [
    ROOT / 'ability_patch_core.py',
    ROOT / 'ability_patch_combat.py',
    ROOT / 'ability_patch_ui.py',
    ROOT / 'ability_patch_mana.py',
    ROOT / 'ability_patch_blocking.py',
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
    'const { canBlock, cardTraits } = __modules["./card-evaluation.js"];',
]
for marker in required_markers:
    if marker not in source:
        raise RuntimeError(f'Missing required 6.15 marker after build: {marker}')

OUT.write_text(source, encoding='utf-8')

index = INDEX.read_text(encoding='utf-8')

def index_rep(old: str, new: str, label: str) -> None:
    global index
    count = index.count(old)
    if count != 1:
        raise RuntimeError(f'Index patch {label!r} expected one match; found {count}.')
    index = index.replace(old, new, 1)

index_rep('Version 6.13.0 · Cards and rules data provided by Scryfall',
          'Version 6.15.0 · Cards and rules data provided by Scryfall',
          'display version')
index_rep('<script src="./commander-forge-oracle-compiler-v7.js?v=7.2.0-static-restrictions"></script>',
          '<script src="./commander-forge-oracle-compiler-v7.js?v=7.2.0-static-restrictions"></script>\n  <script src="./commander-forge-oracle-compiler-v8.js?v=8.0.0-ability-inventory"></script>',
          'compiler v8 loader')
index_rep('<script defer src="./commander-forge-6.13.0.js?v=6.13.0" onerror="window.__forgeBootError(\'HTTP error while loading commander-forge-6.13.0.js?v=6.13.0\')"></script>',
          '<script defer src="./commander-forge-6.15.0.js?v=6.15.0" onerror="window.__forgeBootError(\'HTTP error while loading commander-forge-6.15.0.js?v=6.15.0\')"></script>',
          'gameplay bundle loader')
index_rep("const expected = '6.12.1';", "const expected = '6.15.0';", 'bundle expectation')
INDEX.write_text(index, encoding='utf-8')

print(f'Built {OUT.name}: {len(source):,} bytes; {len(patch_log)} guarded gameplay patches applied.')
for label in patch_log:
    print(f'  OK {label}')
print('Wired index.html to Commander Forge 6.15.0 and Oracle Compiler V8.')
