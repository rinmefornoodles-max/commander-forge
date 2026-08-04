# Precon loading fix: same-origin catalog

The MTGJSON files exist, but browsers can block a GitHub Pages site from reading
them directly. This version moves that download into GitHub Actions.

On each deployment, and once daily, the workflow:

1. Downloads MTGJSON `DeckList.json` and `AllDeckFiles.tar.xz` on GitHub's server.
2. Extracts Commander-style preconstructed decklists.
3. Publishes a small local search index plus one JSON file per deck under
   `data/precons/` in the deployed Pages artifact.
4. The website reads those files from its own `github.io` address, eliminating
   the browser cross-origin failure.

## Upload

Upload all files and folders over the existing repository files, including:

- `.github/workflows/main.yml`
- `scripts/build_precons.py`
- `api.js`
- `constants.js`
- `sw.js`

Do not delete the `.github` or `scripts` directories.

After committing, open **Actions → Deploy The Commander Forge**. The first build
can take several minutes because it downloads and processes the official deck
archive. Wait for the green check before refreshing the website.

The generated `data/precons/` directory exists only inside the deployed Pages
artifact. It does not need to appear on the repository Code page.
