# Put The Commander Forge online for free

This version does not use Streamlit. It is a static website and should be deployed with GitHub Pages.

## Replace the existing GitHub repository

1. Download and extract the ZIP.
2. Open your `commander-forge` repository on GitHub.
3. Back up the current repository with **Code → Download ZIP**.
4. Delete the old Streamlit files, especially `app.py`, `requirements.txt`, `runtime.txt`, and `.streamlit`.
5. Use **Add file → Upload files**.
6. Upload everything inside this project folder, including:
   - `index.html`
   - `styles.css`
   - `js/`
   - `assets/`
   - `.github/`
   - `.nojekyll`
   - `manifest.webmanifest`
   - `sw.js`
7. Commit the upload to the `main` branch.

## Enable GitHub Pages

1. Open the repository's **Settings**.
2. Select **Pages** under **Code and automation**.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**.
4. Open the repository's **Actions** tab.
5. Wait for **Deploy The Commander Forge to GitHub Pages** to finish with a green check.
6. Return to **Settings → Pages** to see the public link.

The address will normally look like:

```text
https://YOUR-USERNAME.github.io/commander-forge/
```

## Put it on an Android home screen

1. Open the GitHub Pages link in Chrome.
2. Tap the three-dot menu.
3. Choose **Install app** or **Add to Home screen**.
4. Name it **The Commander Forge**.

## Updates

Upload changed files to the same GitHub repository and commit them. The included GitHub Actions workflow automatically republishes the website.
