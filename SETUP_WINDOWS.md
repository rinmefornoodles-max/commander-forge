# Free Website Setup on Windows

## 1. Test the website locally

1. Install Python from https://www.python.org/downloads/.
2. During installation, enable **Add Python to PATH**.
3. Open this project folder.
4. Double-click `run_windows.bat`.
5. If Windows asks for network permission, allow private-network access.
6. Your browser should open at `http://localhost:8501`.

Manual terminal method:

```bat
py -m pip install -r requirements.txt
py -m streamlit run app.py
```

Stop the local website by pressing `Ctrl+C` in the terminal window.

## 2. Upload the website to GitHub

1. Create a free GitHub account.
2. Create a new public repository named `mtg-commander-practice`.
3. Choose **Add file > Upload files**.
4. Upload the contents of this folder, not the ZIP itself.
5. Make sure `app.py` and `requirements.txt` are at the top level.
6. Commit the upload.

## 3. Deploy free with Streamlit Community Cloud

1. Sign into Streamlit Community Cloud using GitHub.
2. Select **Create app**.
3. Choose your `mtg-commander-practice` repository.
4. Use branch `main`.
5. Use main file path `app.py`.
6. Press **Deploy**.

Streamlit will give you a public address ending in `.streamlit.app`.

## 4. Add it to an Android home screen

1. Open the public website in Chrome.
2. Open Chrome's three-dot menu.
3. Select **Add to Home screen** or **Install app**.

## Troubleshooting

- `py is not recognized`: reinstall Python and enable **Add Python to PATH**.
- Blank card images: check the internet connection and reload.
- Precon search unavailable: use **Paste a decklist** temporarily.
- Streamlit says it cannot find `app.py`: your files were uploaded inside an extra folder. Move them to the repository's top level.
